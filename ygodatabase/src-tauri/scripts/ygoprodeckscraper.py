#!/usr/bin/env python3
"""
ygoprodeckscraper.py — Full YuGiOh DB sync from YGOPRODeck API.

Phases:
  1. Schema — ensure all tables and columns exist, run migrations
  2. Cards  — upsert card data from YGOPRODeck (never drops tables)
  3. Images — download missing card images
  4. Sets   — upsert set entries (preserves collection_amount & artwork)
  5. Prices — run update_prices.py (tcgcsv → per-set EUR prices)
  6. Thumbs — generate missing WebP thumbnails

All scripts (update_prices.py, generate_thumbnails.py) are expected in the
same folder as this file: src-tauri/scripts/
"""

import json
import os
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

import requests

try:
    from PIL import Image as PILImage
    import io
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    print("WARN: Pillow not installed — images saved as JPG. Run: pip install Pillow", flush=True)

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).parent                        # src-tauri/scripts/
DB_PATH    = BASE_DIR.parent / "ressources" / "cards.db"  # src-tauri/ressources/cards.db
IMAGES_DIR = DB_PATH.parent / "img"
THUMBS_DIR = DB_PATH.parent / "img_thumb"

IMAGES_DIR.mkdir(exist_ok=True)
THUMBS_DIR.mkdir(exist_ok=True)

# Full image quality (detail pane) and thumbnail settings
FULL_QUALITY  = 85   # WebP quality for full-size images
THUMB_WIDTH   = 120  # px
THUMB_QUALITY = 82   # WebP quality for thumbnails

API_URL = "https://db.ygoprodeck.com/api/v7/cardinfo.php?misc=yes&format=genesys"

# ── HTTP ──────────────────────────────────────────────────────────────────────
session = requests.Session()
session.headers.update({"User-Agent": "ygo-collection-manager/1.0"})

def get_json(url: str, retries: int = 3):
    for attempt in range(retries):
        try:
            r = session.get(url, timeout=30)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            if attempt == retries - 1:
                print(f"  WARN: {url} — {e}", flush=True)
                return None
            time.sleep(2 ** attempt)

# ── DB ────────────────────────────────────────────────────────────────────────
def open_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn

def ensure_schema(conn: sqlite3.Connection):
    print("=== Phase 1/6: Schema ===", flush=True)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY,
            name TEXT, type TEXT, typeline TEXT, frameType TEXT, desc TEXT,
            atk INTEGER, def INTEGER, level INTEGER, scale INTEGER,
            linkval INTEGER, linkmarkers TEXT, race TEXT, attribute TEXT,
            archetype TEXT, banlist_info TEXT, formats TEXT,
            ocg_date TEXT, tcg_date TEXT, genesys_points INTEGER,
            md_rarity TEXT, has_effect INTEGER, treated_as TEXT,
            has_alt_art INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS card_images (
            card_id INTEGER, image_id INTEGER, local_path TEXT,
            PRIMARY KEY (card_id, image_id)
        );
        CREATE TABLE IF NOT EXISTS card_images_cropped (
            card_id INTEGER, image_cropped_id INTEGER, local_path TEXT,
            PRIMARY KEY (card_id, image_cropped_id)
        );
        CREATE TABLE IF NOT EXISTS card_sets (
            card_id INTEGER, set_code TEXT, set_name TEXT, set_rarity TEXT,
            set_price TEXT, collection_amount INTEGER DEFAULT 0, artwork INTEGER DEFAULT 0,
            UNIQUE(card_id, set_code, set_rarity, artwork)
        );
        CREATE TABLE IF NOT EXISTS card_prices (
            card_id INTEGER PRIMARY KEY,
            tcgplayer_price TEXT, ebay_price TEXT,
            amazon_price TEXT, cardmarket_price TEXT
        );
    """)

    # Idempotent column additions
    for table, col, defn in [
        ("cards",     "has_alt_art",    "INTEGER DEFAULT 0"),
        ("cards",     "genesys_points", "INTEGER"),
        ("cards",     "md_rarity",      "TEXT"),
        ("cards",     "has_effect",     "INTEGER"),
        ("cards",     "treated_as",     "TEXT"),
        ("card_sets", "artwork",        "INTEGER DEFAULT 0"),
    ]:
        try:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {defn}")
            print(f"  Added column {table}.{col}", flush=True)
        except sqlite3.OperationalError:
            pass  # already exists

    # Migrate card_prices to add PRIMARY KEY on card_id if missing.
    # The old scraper created it without one, causing ON CONFLICT to fail.
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='card_prices'"
    ).fetchone()
    if row and "PRIMARY KEY" not in row[0]:
        print("  Migrating card_prices to add PRIMARY KEY...", flush=True)
        conn.executescript("""
            BEGIN;
            CREATE TABLE IF NOT EXISTS card_prices_new (
                card_id INTEGER PRIMARY KEY,
                tcgplayer_price TEXT, ebay_price TEXT,
                amazon_price TEXT, cardmarket_price TEXT
            );
            INSERT OR IGNORE INTO card_prices_new
                (card_id, tcgplayer_price, ebay_price, amazon_price, cardmarket_price)
            SELECT card_id, tcgplayer_price, ebay_price, amazon_price, cardmarket_price
            FROM card_prices;
            DROP TABLE card_prices;
            ALTER TABLE card_prices_new RENAME TO card_prices;
            COMMIT;
        """)
        print("  card_prices migration done.", flush=True)

    # Migrate card_sets UNIQUE key to include artwork if still old schema
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='card_sets'"
    ).fetchone()
    if row and "set_rarity, artwork" not in row[0] and "set_rarity,artwork" not in row[0]:
        print("  Migrating card_sets UNIQUE key to include artwork...", flush=True)
        conn.executescript("""
            BEGIN;
            CREATE TABLE IF NOT EXISTS card_sets_new (
                card_id INTEGER, set_code TEXT, set_name TEXT, set_rarity TEXT,
                set_price TEXT, collection_amount INTEGER DEFAULT 0, artwork INTEGER DEFAULT 0,
                UNIQUE(card_id, set_code, set_rarity, artwork)
            );
            INSERT OR IGNORE INTO card_sets_new
                (card_id, set_code, set_name, set_rarity, set_price, collection_amount, artwork)
            SELECT card_id, set_code, set_name, set_rarity, set_price,
                   COALESCE(collection_amount, 0), COALESCE(artwork, 0)
            FROM card_sets;
            DROP TABLE card_sets;
            ALTER TABLE card_sets_new RENAME TO card_sets;
            COMMIT;
        """)
        print("  Migration done.", flush=True)

    conn.executescript("""
        CREATE INDEX IF NOT EXISTS idx_cards_name          ON cards(name);
        CREATE INDEX IF NOT EXISTS idx_card_sets_card_id   ON card_sets(card_id);
        CREATE INDEX IF NOT EXISTS idx_card_sets_code_rar  ON card_sets(card_id, set_code, set_rarity);
        CREATE INDEX IF NOT EXISTS idx_card_images_card_id ON card_images(card_id);
    """)
    conn.commit()
    print("  Schema OK", flush=True)

# ── Archetype ─────────────────────────────────────────────────────────────────
def to_archetype_json(value) -> str | None:
    """Wrap single archetype string in a JSON array for json_each() compatibility."""
    if value is None:
        return None
    if isinstance(value, list):
        return json.dumps(value)
    s = str(value).strip()
    if not s or s.lower() == "null":
        return None
    if s.startswith("["):
        return s  # already a JSON array
    return json.dumps([s])

# ── Image download ────────────────────────────────────────────────────────────
def save_image(card_id: int, image_id: int, url: str) -> str | None:
    """
    Download a card image and save as WebP (if Pillow is available) or JPG fallback.
    Also generates the thumbnail in img_thumb/ at the same time.
    Returns the local_path string to store in card_images, or None on failure.
    """
    if not url:
        return None

    # Prefer WebP if Pillow is available
    ext  = "webp" if PIL_AVAILABLE else "jpg"
    path = IMAGES_DIR / f"{card_id}_{image_id}.{ext}"

    # If full image already exists, also ensure thumbnail exists
    if path.exists():
        _ensure_thumbnail(card_id, image_id, path)
        return str(path)

    # Also check for old JPG in case we are upgrading an existing library
    old_jpg = IMAGES_DIR / f"{card_id}_{image_id}.jpg"
    if old_jpg.exists() and PIL_AVAILABLE:
        # Convert existing JPG → WebP and generate thumbnail
        try:
            with PILImage.open(old_jpg) as img:
                img = img.convert("RGB")
                img.save(path, "WEBP", quality=FULL_QUALITY, method=4)
            old_jpg.unlink(missing_ok=True)  # remove the old JPG
            _ensure_thumbnail(card_id, image_id, path)
            return str(path)
        except Exception as e:
            print(f"    WARN: JPG→WebP conversion {old_jpg.name} — {e}", flush=True)
            # Fall through to re-download

    try:
        r = session.get(url, timeout=15)
        r.raise_for_status()
        if PIL_AVAILABLE:
            with PILImage.open(io.BytesIO(r.content)) as img:
                img = img.convert("RGB")
                img.save(path, "WEBP", quality=FULL_QUALITY, method=4)
        else:
            # Pillow not available — save as JPG
            path = IMAGES_DIR / f"{card_id}_{image_id}.jpg"
            path.write_bytes(r.content)
        _ensure_thumbnail(card_id, image_id, path)
        return str(path)
    except Exception as e:
        print(f"    WARN: image {url} — {e}", flush=True)
        return None


def _ensure_thumbnail(card_id: int, image_id: int, src_path: Path):
    """Create a 120px WebP thumbnail if it doesn't already exist."""
    if not PIL_AVAILABLE:
        return
    thumb = THUMBS_DIR / f"{card_id}_{image_id}.webp"
    if thumb.exists():
        return
    try:
        with PILImage.open(src_path) as img:
            ratio  = THUMB_WIDTH / img.width
            height = int(img.height * ratio)
            thumb_img = img.resize((THUMB_WIDTH, height), PILImage.LANCZOS)
            thumb_img.save(thumb, "WEBP", quality=THUMB_QUALITY, method=4)
    except Exception as e:
        print(f"    WARN: thumbnail {src_path.name} — {e}", flush=True)

# ── Card sync ─────────────────────────────────────────────────────────────────
def sync_cards(conn: sqlite3.Connection):
    print("\n=== Phase 2/6: Fetching cards from YGOPRODeck ===", flush=True)
    data = get_json(API_URL)
    if not data:
        print("ERROR: Could not fetch card data", flush=True)
        return
    cards = data.get("data", [])
    total = len(cards)
    print(f"  {total} cards received", flush=True)

    print("\n=== Phase 3/6: Upserting cards + downloading images ===", flush=True)
    for i, card in enumerate(cards, 1):
        card_id     = card["id"]
        misc        = (card.get("misc_info") or [{}])[0]
        card_images = card.get("card_images", [])
        has_alt_art = 1 if len(card_images) > 1 else 0
        archetype   = to_archetype_json(card.get("archetype"))

        conn.execute("""
            INSERT INTO cards (
                id, name, type, typeline, frameType, desc,
                atk, def, level, scale, linkval, linkmarkers,
                race, attribute, archetype, banlist_info, formats,
                ocg_date, tcg_date, genesys_points,
                md_rarity, has_effect, treated_as, has_alt_art
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
                name=excluded.name, type=excluded.type, typeline=excluded.typeline,
                frameType=excluded.frameType, desc=excluded.desc,
                atk=excluded.atk, def=excluded.def, level=excluded.level,
                scale=excluded.scale, linkval=excluded.linkval,
                linkmarkers=excluded.linkmarkers, race=excluded.race,
                attribute=excluded.attribute, archetype=excluded.archetype,
                banlist_info=excluded.banlist_info, formats=excluded.formats,
                ocg_date=excluded.ocg_date, tcg_date=excluded.tcg_date,
                genesys_points=excluded.genesys_points,
                md_rarity=excluded.md_rarity, has_effect=excluded.has_effect,
                treated_as=excluded.treated_as, has_alt_art=excluded.has_alt_art
        """, (
            card_id, card.get("name"), card.get("type"),
            json.dumps(card.get("typeline")), card.get("frameType"), card.get("desc"),
            card.get("atk"), card.get("def"), card.get("level"),
            card.get("scale"), card.get("linkval"), json.dumps(card.get("linkmarkers")),
            card.get("race"), card.get("attribute"), archetype,
            json.dumps(card.get("banlist_info")), json.dumps(misc.get("formats")),
            misc.get("ocg_date"), misc.get("tcg_date"), misc.get("genesys_points"),
            misc.get("md_rarity"), misc.get("has_effect"), misc.get("treated_as"),
            has_alt_art,
        ))

        for img in card_images:
            img_id = img["id"]
            local = save_image(card_id, img_id, img.get("image_url"))
            if local:
                conn.execute(
                    "INSERT OR IGNORE INTO card_images (card_id, image_id, local_path) VALUES (?,?,?)",
                    (card_id, img_id, local)
                )
            # Cropped images skipped — thumbnails are generated inline by save_image()

        if i % 500 == 0 or i == total:
            conn.commit()
            print(f"  [{i}/{total}] cards processed", flush=True)

    print("\n=== Phase 4/6: Upserting set entries ===", flush=True)
    conn2 = open_db()  # fresh connection for set+price upserts
    for card in cards:
        card_id = card["id"]
        for s in card.get("card_sets", []):
            conn2.execute("""
                INSERT INTO card_sets (card_id, set_name, set_code, set_rarity, set_price, collection_amount, artwork)
                VALUES (?,?,?,?,?,0,0)
                ON CONFLICT(card_id, set_code, set_rarity, artwork) DO UPDATE SET
                    set_name=excluded.set_name,
                    set_price=excluded.set_price
            """, (card_id, s.get("set_name"), s.get("set_code"), s.get("set_rarity"), s.get("set_price")))
        for p in card.get("card_prices", []):
            conn2.execute("""
                INSERT OR REPLACE INTO card_prices
                    (card_id, tcgplayer_price, ebay_price, amazon_price, cardmarket_price)
                VALUES (?,?,?,?,?)
            """, (card_id, p.get("tcgplayer_price"), p.get("ebay_price"),
                  p.get("amazon_price"), p.get("cardmarket_price")))
    conn2.commit()
    conn2.close()
    print("  Sets and prices upserted", flush=True)

# ── External scripts ──────────────────────────────────────────────────────────
def run_script(name: str, phase_label: str, extra_args: list[str] = []):
    path = BASE_DIR / name
    if not path.exists():
        print(f"  WARN: {name} not found at {path}, skipping", flush=True)
        return
    print(f"\n=== {phase_label} ===", flush=True)
    result = subprocess.run(
        [sys.executable, str(path)] + extra_args,
        capture_output=False  # let stdout/stderr flow through to our process
    )
    if result.returncode != 0:
        print(f"  WARN: {name} exited with code {result.returncode}", flush=True)

# ── Entry point ───────────────────────────────────────────────────────────────
def sync_all():
    print(f"DB: {DB_PATH}", flush=True)
    if not DB_PATH.parent.exists():
        print(f"ERROR: ressources directory not found", flush=True)
        sys.exit(1)

    conn = open_db()
    try:
        ensure_schema(conn)
        sync_cards(conn)
    finally:
        conn.close()

    run_script("update_prices.py",        "Phase 5/6: Updating prices (tcgcsv.com)",
               ["--db", str(DB_PATH)])
    # Pass correct paths to generate_thumbnails.py for any images not yet thumbed
    run_script("generate_thumbnails.py", "Phase 6/6: Generating remaining thumbnails",
               ["--img-dir", str(DB_PATH.parent / "img"),
                "--out-dir", str(DB_PATH.parent / "img_thumb")])

    print("\n=== Sync complete ===", flush=True)

if __name__ == "__main__":
    sync_all()