#!/usr/bin/env python3
"""
update_archetypes.py
====================
Queries Yugipedia SMW for each known archetype and builds a complete
card → [archetypes] mapping, then writes it to cards.db.

Strategy: query [[Archseries::X]] for every archetype X in the DB.
Each query returns all cards in that archetype. A card appearing in
multiple queries gets all its archetypes merged. This avoids the
[[Archseries::+]] pagination loop and gives complete coverage.

Usage:
    python update_archetypes.py [--db path/to/cards.db] [--dry-run] [--resume]
    python update_archetypes.py --debug-card "Tearlaments Kashtira"

Requirements:
    pip install requests
"""

import argparse
import json
import time
from pathlib import Path
import sqlite3

try:
    import requests
except ImportError:
    print("ERROR: 'requests' not found. Run: pip install requests")
    raise SystemExit(1)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
YUGIPEDIA_API = "https://yugipedia.com/api.php"
USER_AGENT    = "YGOArchetypeUpdater/1.0 (local db maintenance)"
RATE_LIMIT    = 0.6
PROGRESS_FILE = "archetype_progress.json"
SMW_PROPERTY  = "Archseries"

session = requests.Session()
session.headers.update({"User-Agent": USER_AGENT})


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

def api_get(params: dict) -> dict:
    params.setdefault("format", "json")
    while True:
        try:
            r = session.get(YUGIPEDIA_API, params=params, timeout=30)
            r.raise_for_status()
            return r.json()
        except requests.exceptions.RequestException as e:
            print(f"  [warn] {e} — retrying in 5s")
            time.sleep(5)


def query_archseries(archseries: str) -> list[str]:
    """
    Return all card page titles that have Archseries == archseries.
    Paginates if needed (some large archetypes exceed 500 cards).
    """
    titles: list[str] = []
    offset = 0
    seen_offsets: set[int] = set()

    while True:
        if offset in seen_offsets:
            break
        seen_offsets.add(offset)

        data = api_get({
            "action":      "ask",
            "format":      "json",
            "api_version": "3",
            "query":       f"[[{SMW_PROPERTY}::{archseries}]]|?{SMW_PROPERTY}|limit=500|offset={offset}",
        })

        block = data.get("query", {}).get("results", {})
        if not block:
            break

        items = list(block.values()) if isinstance(block, dict) else block
        for item in items:
            if not isinstance(item, dict):
                continue
            if "fulltext" in item:
                titles.append(item["fulltext"])
            else:
                inner = next(iter(item.values()), None)
                if isinstance(inner, dict):
                    ft = inner.get("fulltext", "")
                    if ft:
                        titles.append(ft)

        if len(items) < 500:
            break  # last page
        cont = data.get("query-continue-offset")
        if cont is None:
            break
        offset = cont
        time.sleep(RATE_LIMIT)

    return titles


def fetch_single_card(card_name: str) -> list[str]:
    """Single-card Archseries lookup for debug mode."""
    data = api_get({
        "action":      "ask",
        "format":      "json",
        "api_version": "3",
        "query":       f"[[{card_name}]]|?{SMW_PROPERTY}|limit=1",
    })
    block = data.get("query", {}).get("results", {})
    if not block:
        return []
    items = list(block.values()) if isinstance(block, dict) else block
    if not items:
        return []
    item = items[0]
    if "printouts" not in item:
        item = next(iter(item.values()), {})
    return [
        v.get("fulltext", v) if isinstance(v, dict) else v
        for v in item.get("printouts", {}).get(SMW_PROPERTY, [])
    ]


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def load_archetypes_from_db(conn: sqlite3.Connection) -> list[str]:
    """Return all distinct archetype values currently in the DB."""
    rows = conn.execute(
        "SELECT DISTINCT archetype FROM cards "
        "WHERE archetype IS NOT NULL AND archetype != ''"
    ).fetchall()
    archetypes: list[str] = []
    seen: set[str] = set()
    for (val,) in rows:
        # Handle both old plain strings and already-migrated JSON arrays
        try:
            parsed = json.loads(val)
            items = parsed if isinstance(parsed, list) else [val]
        except (json.JSONDecodeError, TypeError):
            items = [val]
        for a in items:
            if a and a not in seen:
                seen.add(a)
                archetypes.append(a)
    return archetypes


def load_card_name_map(conn: sqlite3.Connection) -> dict[str, int]:
    return {name.lower(): cid for cid, name in conn.execute("SELECT id, name FROM cards")}


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------

def build_card_archetype_map(
    archetypes: list[str],
    name_map:   dict[str, int],
    progress:   dict,
) -> dict[int, set[str]]:
    """
    For each archetype query its members from SMW, accumulate into
    card_id → set of archetypes.  Saves progress after each archetype.
    """
    card_archetypes: dict[int, set[str]] = {}

    # Restore from progress
    for arch, titles in progress.get("fetched", {}).items():
        for title in titles:
            cid = name_map.get(title.lower())
            if cid is not None:
                card_archetypes.setdefault(cid, set()).add(arch)

    done  = set(progress.get("fetched", {}).keys())
    todo  = [a for a in archetypes if a not in done]
    total = len(archetypes)
    n     = len(done)

    for arch in todo:
        n += 1
        print(f"  [{n}/{total}] {arch!r}", end="", flush=True)
        time.sleep(RATE_LIMIT)

        titles  = query_archseries(arch)
        matched = 0
        for title in titles:
            cid = name_map.get(title.lower())
            if cid is not None:
                card_archetypes.setdefault(cid, set()).add(arch)
                matched += 1

        print(f" → {len(titles)} results, {matched} in DB")
        progress.setdefault("fetched", {})[arch] = titles

    return card_archetypes


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    script_dir    = Path(__file__).parent
    progress_file = script_dir / PROGRESS_FILE

    parser = argparse.ArgumentParser()
    parser.add_argument("--db",      default=str(script_dir / "cards.db"))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--resume",  action="store_true",
                        help=f"Resume using {PROGRESS_FILE}")
    parser.add_argument("--debug-card", metavar="NAME",
                        help="Print Archseries for one card and exit")
    args = parser.parse_args()

    if args.debug_card:
        vals = fetch_single_card(args.debug_card)
        print(f"{args.debug_card!r} → {SMW_PROPERTY}: {vals}")
        return

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"ERROR: DB not found at {db_path}")
        raise SystemExit(1)

    conn     = sqlite3.connect(str(db_path))
    name_map = load_card_name_map(conn)
    print(f"Loaded {len(name_map)} cards from DB.")

    archetypes = load_archetypes_from_db(conn)
    print(f"Found {len(archetypes)} distinct archetypes in DB.")

    # ── Load progress ─────────────────────────────────────────────────────────
    progress: dict = {}
    if args.resume and progress_file.exists():
        with open(progress_file, encoding="utf-8") as f:
            progress = json.load(f)
        already = len(progress.get("fetched", {}))
        print(f"Resuming — {already}/{len(archetypes)} archetypes already cached.")

    # ── Fetch ─────────────────────────────────────────────────────────────────
    print("Querying Yugipedia SMW per archetype…")
    card_archetypes = build_card_archetype_map(archetypes, name_map, progress)

    with open(progress_file, "w", encoding="utf-8") as f:
        json.dump(progress, f, ensure_ascii=False, indent=2)
    print(f"Progress saved to {progress_file}")

    # ── Stats ─────────────────────────────────────────────────────────────────
    multi  = sum(1 for s in card_archetypes.values() if len(s) > 1)
    single = sum(1 for s in card_archetypes.values() if len(s) == 1)
    print(f"\n{len(card_archetypes)} cards with archetypes ({single} single, {multi} multi-archetype)")

    if args.dry_run:
        print("\n--dry-run: skipping DB write. Multi-archetype sample:")
        id_to_name = {v: k for k, v in name_map.items()}
        shown = 0
        for cid, archs in card_archetypes.items():
            if len(archs) > 1:
                print(f"  {id_to_name.get(cid,'?')} → {sorted(archs)}")
                shown += 1
                if shown >= 20:
                    break
        return

    # ── Write DB ──────────────────────────────────────────────────────────────
    print("\nWriting to database…")
    cursor = conn.cursor()

    updated = 0
    for cid, archs in card_archetypes.items():
        cursor.execute(
            "UPDATE cards SET archetype = ? WHERE id = ?",
            (json.dumps(sorted(archs), ensure_ascii=False), cid),
        )
        updated += 1

    # Cards not found on wiki: wrap any existing plain-string archetype as array
    wiki_ids = set(card_archetypes.keys())
    for cid, in conn.execute("SELECT id FROM cards WHERE archetype IS NOT NULL AND archetype NOT LIKE '[%'"):
        if cid not in wiki_ids:
            row = conn.execute("SELECT archetype FROM cards WHERE id=?", (cid,)).fetchone()
            if row and row[0]:
                cursor.execute(
                    "UPDATE cards SET archetype = ? WHERE id = ?",
                    (json.dumps([row[0]], ensure_ascii=False), cid),
                )

    # Null out any remaining plain strings
    cursor.execute(
        "UPDATE cards SET archetype = NULL "
        "WHERE archetype IS NOT NULL AND archetype NOT LIKE '[%'"
    )

    conn.commit()
    conn.close()
    print(f"Done. {updated} cards updated.")
    print(f"Progress kept at {progress_file} — delete it to start fresh.")


if __name__ == "__main__":
    main()