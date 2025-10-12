import requests
import pandas as pd
import sqlite3
import time
import os
#
# TODO: image_url_cropped abrufen, local speichern, falls nicht vorhanden
# TODO: Sets abrufen, Preise da abspeichern ()
#
# === Rate-Limit-Konfiguration ===
MAX_REQUESTS_PER_SECOND = 20
DELAY = 1 / MAX_REQUESTS_PER_SECOND  # = 0.05 Sek. Pause zwischen Requests

# === Beispiel: mehrere Karten-IDs (du kannst diese Liste erweitern oder dynamisch erzeugen) ===
card_ids = [46986414, 89631139, 74677422, 83764718, 44508094, 24094653, 17441953]

# === SQLite-DB-Verbindung ===
conn = sqlite3.connect(r"E:\ygodatabase\karten.db")

# === Container für alle Ergebnisse ===
karten_records, bilder_records, sets_records, preise_records = [], [], [], []

# === Funktion zum Abrufen einer einzelnen Karte ===
def fetch_card(card_id):
    url = f"https://db.ygoprodeck.com/api/v7/cardinfo.php?id={card_id}"
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        data = r.json().get("data", [])[0]
        return data
    except Exception as e:
        print(f"⚠️ Fehler beim Abruf von Karte {card_id}: {e}")
        return None

# === Hauptschleife mit Rate Limit ===
for i, card_id in enumerate(card_ids, start=1):
    card = fetch_card(card_id)
    if card:
        # Hauptkarte
        karten_records.append({
            "id": card.get("id"),
            "name": card.get("name"),
            "type": card.get("type"),
            "desc": card.get("desc"),
            "atk": card.get("atk"),
            "def": card.get("def"),
            "level": card.get("level"),
            "race": card.get("race"),
            "attribute": card.get("attribute"),
            "archetype": card.get("archetype")
        })

        # Bilder
        for img in card.get("card_images", []):
            bilder_records.append({
                "card_id": card.get("id"),
                "id": img.get("id"),
                "image_url_cropped": img.get("image_url_cropped")
            })

        # Sets
        for s in card.get("card_sets", []):
            sets_records.append({
                "card_id": card.get("id"),
                "set_name": s.get("set_name"),
                "set_code": s.get("set_code"),
                "set_rarity": s.get("set_rarity"),
                "set_price": s.get("set_price")
            })

        # Preise
        for p in card.get("card_prices", []):
            preise_records.append({
                "card_id": card.get("id"),
                "tcgplayer_price": p.get("tcgplayer_price"),
                "ebay_price": p.get("ebay_price"),
                "amazon_price": p.get("amazon_price"),
                "cardmarket_price": p.get("cardmarket_price"),
            })

        print(f"✅ [{i}/{len(card_ids)}] Karte {card.get('name')} gespeichert.")
        print("Aktuelles Arbeitsverzeichnis:", os.getcwd())
        print("Datenbankpfad:", os.path.abspath("karten.db"))

    # Warten, um Limit einzuhalten
    time.sleep(DELAY)

# === Daten speichern ===
if karten_records:
    pd.DataFrame(karten_records).to_sql("karten", conn, if_exists="replace", index=False)
if bilder_records:
    pd.DataFrame(bilder_records).to_sql("karten_bilder", conn, if_exists="replace", index=False)
if sets_records:
    pd.DataFrame(sets_records).to_sql("karten_sets", conn, if_exists="replace", index=False)
if preise_records:
    pd.DataFrame(preise_records).to_sql("karten_preise", conn, if_exists="replace", index=False)

conn.close()
print("\n💾 Alle Daten erfolgreich in 'karten.db' gespeichert!")
