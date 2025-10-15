import requests
import pandas as pd
import sqlite3
import time
import os

API_URL = "http://db.ygoprodeck.com/api/v7/cardinfo.php"
MAX_REQUESTS_PER_SECOND = 20
DELAY = 1 / MAX_REQUESTS_PER_SECOND  # = 0.05 Sek. Pause zwischen Requests
IMAGES_DIR = "img"
IMAGES_CROPPED_DIR = "img_cropped"

os.makedirs(IMAGES_DIR, exist_ok=True)
os.makedirs(IMAGES_CROPPED_DIR, exist_ok=True)
conn = sqlite3.connect(r"E:\ygodatabase\cards.db")
cursor = conn.cursor()

cursor.execute("""
CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY,
    name TEXT,
    type TEXT,
    frameType TEXT,
    desc TEXT,
    atk INTEGER,
    def INTEGER,
    level INTEGER,
    race TEXT,
    attribute TEXT,
    archetype TEXT
)
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
CREATE TABLE IF NOT EXISTS card_sets (
    card_id INTEGER,
    set_name TEXT,
    set_code TEXT,
    set_rarity TEXT,
    set_price TEXT
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS card_prices (
    card_id INTEGER,
    tcgplayer_price TEXT,
    ebay_price TEXT,
    amazon_price TEXT,
    cardmarket_price TEXT
)
""")

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
        # Cards
        cursor.execute("""
            INSERT INTO cards (id, name, type, frameType, desc, atk, def, level, race, attribute, archetype)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            card_id,
            card.get("name"),
            card.get("type"),
            card.get("frameType"),
            card.get("desc"),
            card.get("atk"),
            card.get("def"),
            card.get("level"),
            card.get("race"),
            card.get("attribute"),
            card.get("archetype")
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
            INSERT INTO card_sets (card_id, set_name, set_code, set_rarity, set_price)
            VALUES(?, ?, ?, ?, ?)
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
            INSERT INTO card_prices (card_id, tcgplayer_price, ebay_price, amazon_price, cardmarket_price)
            VALUES(?, ?, ?, ?, ?)
        """, (
            card_id, 
            p.get("tcgplayer_price"), 
            p.get("ebay_price"), 
            p.get("amazon_price"), 
            p.get("cardmarket_price")
        ))
        conn.commit()

    print(f"[{i}/{len(cards)}] Card {card.get('name')} safed.")

    # Rate limit
    if i % 100 == 0:
        print(f"{i} cards done...")
    time.sleep(DELAY)


conn.close()
print("\nDownloaded successfully!")
