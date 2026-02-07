import requests
import pandas as pd
import sqlite3
import os
import json

API_URL = "http://db.ygoprodeck.com/api/v7/cardinfo.php?misc=yes&format=genesys"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DB_PATH = os.path.join(BASE_DIR, "..", "ressources", "cards.db")
DB_DIR = os.path.dirname(DB_PATH)

IMAGES_DIR = os.path.join(DB_DIR, "img")
IMAGES_CROPPED_DIR = os.path.join(DB_DIR, "img_cropped")

os.makedirs(IMAGES_DIR, exist_ok=True)
os.makedirs(IMAGES_CROPPED_DIR, exist_ok=True)

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

cursor.execute("""
CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY,
    name TEXT,
    type TEXT,
    typeline TEXT,
    frameType TEXT,
    desc TEXT,
    atk INTEGER,
    def INTEGER,
    level INTEGER,
    scale INTEGER,
    linkval INTEGER,
    linkmarkers TEXT,
    race TEXT,
    attribute TEXT,
    archetype TEXT,
    banlist_info TEXT,
    formats TEXT,
    ocg_date TEXT,
    tcg_date TEXT,
    genesys_points INTEGER,
    md_rarity TEXT, 
    has_effect INTEGER, 
    treated_as TEXT
);
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS card_images (
    card_id INTEGER,
    image_id INTEGER,
    local_path TEXT,
    PRIMARY KEY (card_id, image_id)
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS card_images_cropped (
    card_id INTEGER,
    image_cropped_id INTEGER,
    local_path TEXT,
    PRIMARY KEY (card_id, image_cropped_id)
)
""")

cursor.execute("""
    DROP TABLE IF EXISTS card_sets
""")
cursor.execute("""
CREATE TABLE IF NOT EXISTS card_sets (
    card_id INTEGER,
    set_code TEXT,
    set_name TEXT,
    set_rarity TEXT,
    set_price TEXT,
    collection_amount INTEGER,
    UNIQUE(card_id, set_code, set_rarity)
)
""")

cursor.execute("""
    DROP TABLE IF EXISTS card_prices
""")
cursor.execute("""
CREATE TABLE IF NOT EXISTS card_prices (
    card_id INTEGER,
    tcgplayer_price TEXT,
    ebay_price TEXT,
    amazon_price TEXT,
    cardmarket_price TEXT,
    collection_amount INTEGER
)
""")

conn.commit()

def migrate_add_has_alt_art_column():
    try:
        cursor.execute("ALTER TABLE cards ADD COLUMN has_alt_art INTEGER DEFAULT 0;")
        conn.commit()
        print("Column has_alt_art added.")
    except sqlite3.OperationalError:
        print("Column has_alt_art already exists.")

def migrate_set_has_alt_art():
    cursor.execute("""
        SELECT card_id, COUNT(*) 
        FROM card_images 
        GROUP BY card_id
    """)
    rows = cursor.fetchall()

    for card_id, image_count in rows:
        has_alt = 1 if image_count > 1 else 0
        cursor.execute("""
            UPDATE cards
            SET has_alt_art = ?
            WHERE id = ?
        """, (has_alt, card_id))

    conn.commit()


def card_exists(card_id):
    cursor.execute("""
        SELECT 1 FROM cards 
        WHERE id = ?
    """, (card_id,))
    return cursor.fetchone() is not None

def image_exists(card_id, image_id):
    cursor.execute("""
        SELECT 1 FROM card_images 
        WHERE card_id = ? AND image_id = ?
    """, (card_id, image_id))
    return cursor.fetchone() is not None

def image_cropped_exists(card_id, image_cropped_id):
    cursor.execute("""
        SELECT 1 FROM card_images_cropped 
        WHERE card_id = ? AND image_cropped_id = ?
    """, (card_id, image_cropped_id))
    return cursor.fetchone() is not None

def save_image_locally(card_id, image_id, image_url):
    if not image_url:
        return None
    filename = f"{card_id}_{image_id}.jpg"
    filepath = os.path.join(IMAGES_DIR, filename)

    if os.path.exists(filepath):
        return filepath  # schon vorhanden, überspringen

    try:
        r = requests.get(image_url, timeout=10)
        r.raise_for_status()
        with open(filepath, "wb") as f:
            f.write(r.content)
        return filepath
    except Exception as e:
        print(f"Error saving {image_url}: {e}")
        return None
    
def save_image_cropped_locally(card_id, image_cropped_id, image_url_cropped):
    if not image_url_cropped:
        return None
    filename = f"{card_id}_{image_cropped_id}.jpg"
    filepath = os.path.join(IMAGES_CROPPED_DIR, filename)
    
    if os.path.exists(filepath):
        return filepath  # schon vorhanden, überspringen

    try:
        r = requests.get(image_url_cropped, timeout=10)
        r.raise_for_status()
        with open(filepath, "wb") as f:
            f.write(r.content)
        return filepath
    except Exception as e:
        print(f"Error saving {image_url_cropped}: {e}")
        return None

def fetch_cards():
    print("Loading card data from YGOPRODeck API ...")
    r = requests.get(API_URL)
    if r.status_code != 200:
        raise SystemExit(f"Error with API call: {r.status_code}")
    data = r.json()
    return data.get("data", [])

cards = fetch_cards()
print(f"{len(cards)} cards found.\n")


for i, card in enumerate(cards, start=1):
    card_id = card.get("id")
    if not card_exists(card_id):
        misc = card.get("misc_info", [])

    misc = card.get("misc_info") or card.get("misc") or []
    migrate_add_has_alt_art_column()
    migrate_set_has_alt_art()
    m0 = {}
    genesys_points = None
    ocg_date = None
    tcg_date = None
    formats = None
    card_images = card.get("card_images", [])
    has_alt_art = 1 if len(card_images) > 1 else 0

    
    if misc and isinstance(misc, list):
        m0 = misc[0]
        genesys_points = m0.get("genesys_points")
        ocg_date = m0.get("ocg_date")
        tcg_date = m0.get("tcg_date")
        formats = m0.get("formats")
        md_rarity = m0.get("md_rarity")
        has_effect = m0.get("has_effect")
        treated_as = m0.get("treated_as")

    if not card_exists(card_id):
        cursor.execute("""
            INSERT INTO cards (
                id, name, type, typeline, frameType, desc,
                atk, def, level, scale, linkval, linkmarkers,
                race, attribute, archetype, banlist_info,
                formats, ocg_date, tcg_date, genesys_points,
                md_rarity, has_effect, treated_as, has_alt_art
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            card_id,
            card.get("name"),
            card.get("type"),
            json.dumps(card.get("typeline")),
            card.get("frameType"),
            card.get("desc"),
            card.get("atk"),
            card.get("def"),
            card.get("level"),
            card.get("scale"),
            card.get("linkval"),
            json.dumps(card.get("linkmarkers")),
            card.get("race"),
            card.get("attribute"),
            card.get("archetype"),
            json.dumps(card.get("banlist_info")),
            json.dumps(formats),
            ocg_date,
            tcg_date,
            genesys_points,
            md_rarity, 
            has_effect, 
            treated_as,
            has_alt_art
        ))

    else:
        cursor.execute("""
            UPDATE cards
            SET
                name = ?,
                type = ?,
                typeline = ?,
                frameType = ?,
                desc = ?,
                atk = ?,
                def = ?,
                level = ?,
                scale = ?,
                linkval = ?,
                linkmarkers = ?,
                race = ?,
                attribute = ?,
                archetype = ?,
                banlist_info = ?,
                formats = ?,
                ocg_date = ?,
                tcg_date = ?,
                genesys_points = ?,
                md_rarity = ?, 
                has_effect = ?, 
                treated_as = ?,
                has_alt_art = ?
            WHERE id = ?
        """, (
            card.get("name"),
            card.get("type"),
            json.dumps(card.get("typeline")),
            card.get("frameType"),
            card.get("desc"),
            card.get("atk"),
            card.get("def"),
            card.get("level"),
            card.get("scale"),
            card.get("linkval"),
            json.dumps(card.get("linkmarkers")),
            card.get("race"),
            card.get("attribute"),
            card.get("archetype"),
            json.dumps(card.get("banlist_info")),
            json.dumps(formats),
            ocg_date,
            tcg_date,
            genesys_points,
            card_id,
            md_rarity, 
            has_effect, 
            treated_as,
            has_alt_art
        ))

    conn.commit()

    # Images
    for img in card.get("card_images", []):
        if not image_exists(card_id, img["id"]):
            local_path = save_image_locally(card_id, img["id"], img["image_url"])
            if local_path:
                cursor.execute("""
                    INSERT OR IGNORE INTO card_images (card_id, image_id, local_path)
                    VALUES(?, ?, ?)
                """, (
                    card_id, 
                    img["id"], 
                    local_path
                ))
                conn.commit()

    # Cropped Images
    for img_cropped in card.get("card_images", []):
        if not image_cropped_exists(card_id, img_cropped["id"]):
            local_path = save_image_cropped_locally(card_id, img_cropped["id"], img_cropped["image_url_cropped"])
            if local_path:
                cursor.execute("""
                    INSERT OR IGNORE INTO card_images_cropped (card_id, image_cropped_id, local_path)
                    VALUES(?, ?, ?)
                """, (
                    card_id, 
                    img_cropped["id"], 
                    local_path
                ))
                conn.commit()

    # Sets
    for s in card.get("card_sets", []):
        cursor.execute("""
            INSERT INTO card_sets (card_id, set_name, set_code, set_rarity, set_price, collection_amount)
            VALUES(?, ?, ?, ?, ?, 0)
            ON CONFLICT(card_id, set_code, set_rarity)
            DO UPDATE SET
                set_name = excluded.set_name,
                set_price = excluded.set_price
        """, (
            card_id, 
            s.get("set_name"), 
            s.get("set_code"), 
            s.get("set_rarity"), 
            s.get("set_price")
        ))
        conn.commit()

    # Prices
    for p in card.get("card_prices", []):
        cursor.execute("""
            INSERT INTO card_prices (card_id, tcgplayer_price, ebay_price, amazon_price, cardmarket_price, collection_amount)
            VALUES(?, ?, ?, ?, ?, 0)
        """, (
            card_id, 
            p.get("tcgplayer_price"), 
            p.get("ebay_price"), 
            p.get("amazon_price"), 
            p.get("cardmarket_price")
        ))
        conn.commit()

    print(f"[{i}/{len(cards)}] Card {card.get('name')} safed.")

conn.close()
print("\nDownloaded successfully!")
