#!/usr/bin/env python3
"""
update_prices.py — Refresh card prices in cards.db from tcgcsv.com (TCGplayer data).

What it does:
1. Fetches all YuGiOh groups (sets) from tcgcsv.com/tcgplayer/2/groups
2. For each group, fetches products + prices in parallel (capped workers)
3. Joins on (set_code, rarity) → card_sets rows in your DB
4. Converts USD → EUR using live exchange rate from frankfurter.app
5. Writes the new price (as a decimal string) back to set_price

Usage:
    python update_prices.py --db path/to/cards.db

Options:
    --db        Path to cards.db (default: ./ressources/cards.db)
    --workers   Parallel HTTP workers (default: 8, be gentle with the server)
    --dry-run   Print matches without writing to the DB

Limitations:
    - tcgcsv.com prices are TCGplayer market prices (USD), not Cardmarket (EUR).
      We convert using the live USD/EUR rate — close enough for collection value.
    - Only Near Mint prices are returned (tcgcsv does not expose per-condition data).
    - Groups/products are cached in memory for the run; re-run to refresh.
"""

import argparse
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

BASE = "https://tcgcsv.com/tcgplayer"
YUGIOH_ID = 2

# ── Helpers ──────────────────────────────────────────────────────────────────

session = requests.Session()
session.headers.update({"User-Agent": "ygo-collection-manager/1.0 (price updater)"})

def get_json(url: str, retries: int = 3) -> dict | list | None:
    for attempt in range(retries):
        try:
            r = session.get(url, timeout=20)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            if attempt == retries - 1:
                print(f"  WARN: failed {url} — {e}", flush=True)
                return None
            time.sleep(1.5 ** attempt)

def get_exchange_rate() -> float:
    """Fetch live USD→EUR rate from frankfurter.app (free, no key needed)."""
    data = get_json("https://api.frankfurter.app/latest?from=USD&to=EUR")
    if data and "rates" in data and "EUR" in data["rates"]:
        rate = data["rates"]["EUR"]
        print(f"Exchange rate: 1 USD = {rate:.4f} EUR", flush=True)
        return rate
    print("WARN: Could not fetch exchange rate, using fallback 0.92", flush=True)
    return 0.92

# ── Fetching ─────────────────────────────────────────────────────────────────

def fetch_groups() -> list[dict]:
    data = get_json(f"{BASE}/{YUGIOH_ID}/groups")
    if not data:
        return []
    results = data.get("results", data) if isinstance(data, dict) else data
    print(f"Found {len(results)} YuGiOh groups (sets)", flush=True)
    return results

def fetch_group_data(group: dict) -> tuple[int, str, list[dict]]:
    """Returns (groupId, groupName, list of {number, rarity, marketPrice})."""
    gid = group["groupId"]
    gname = group.get("name", str(gid))

    products_data = get_json(f"{BASE}/{YUGIOH_ID}/{gid}/products")
    prices_data   = get_json(f"{BASE}/{YUGIOH_ID}/{gid}/prices")

    if not products_data or not prices_data:
        return gid, gname, []

    prods = products_data.get("results", products_data) if isinstance(products_data, dict) else products_data
    prices = prices_data.get("results", prices_data) if isinstance(prices_data, dict) else prices_data

    # Build price lookup: productId → marketPrice
    price_map: dict[int, float] = {}
    for p in prices:
        pid = p.get("productId")
        # mid price preferred, fall back to market/low
        price = p.get("midPrice") or p.get("marketPrice") or p.get("lowPrice")
        if pid and price:
            price_map[pid] = float(price)

    rows = []
    for prod in prods:
        pid = prod.get("productId")
        if pid not in price_map:
            continue

        # Extract number (set code) and rarity from extendedData
        ext = {e["name"]: e["value"] for e in prod.get("extendedData", [])}
        number = ext.get("Number", "").strip()   # e.g. "STBL-EN082"
        rarity = ext.get("Rarity", "").strip()   # e.g. "Rare"
        if not number or not rarity:
            continue

        rows.append({
            "number": number,
            "rarity": rarity,
            "usd": price_map[pid],
        })

    return gid, gname, rows

# ── DB ────────────────────────────────────────────────────────────────────────

def load_db_entries(db_path: Path) -> dict[tuple[str,str], list]:
    """Returns {(set_code, set_rarity): [(rowid, current_price), ...]}"""
    conn = sqlite3.connect(db_path)
    rows = conn.execute(
        "SELECT rowid, set_code, set_rarity, set_price FROM card_sets"
    ).fetchall()
    conn.close()

    index: dict[tuple[str,str], list] = {}
    for rowid, code, rarity, price in rows:
        if code and rarity:
            key = (code.strip(), rarity.strip())
            index.setdefault(key, []).append((rowid, price))
    return index

def normalize_rarity(r: str) -> str:
    """Normalize rarity strings for fuzzy matching."""
    return r.lower().replace("-", " ").replace("'", "").strip()

def build_rarity_index(db_index: dict) -> dict[tuple[str,str], list]:
    """Secondary index keyed on (set_code, normalized_rarity)."""
    out: dict[tuple[str,str], list] = {}
    for (code, rarity), entries in db_index.items():
        out[(code, normalize_rarity(rarity))] = entries
    return out

# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    script_dir    = Path(__file__).parent

    parser = argparse.ArgumentParser()
    parser.add_argument("--db",      default=str(script_dir / "cards.db"))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"ERROR: DB not found at {db_path}", flush=True)
        return

    print(f"Loading DB: {db_path}", flush=True)
    db_index   = load_db_entries(db_path)
    norm_index = build_rarity_index(db_index)
    print(f"  {len(db_index)} distinct (set_code, rarity) entries in DB", flush=True)

    print("\nFetching exchange rate...", flush=True)
    rate = get_exchange_rate()

    print("\nFetching YuGiOh groups from tcgcsv.com...", flush=True)
    groups = fetch_groups()
    if not groups:
        print("ERROR: No groups returned", flush=True)
        return

    print(f"\nFetching products + prices for {len(groups)} groups ({args.workers} workers)...", flush=True)

    updates: list[tuple[str, int]] = []   # [(new_price_str, rowid)]
    matched = 0
    unmatched = 0

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(fetch_group_data, g): g for g in groups}
        done = 0
        for future in as_completed(futures):
            gid, gname, rows = future.result()
            done += 1
            if rows:
                print(f"  [{done}/{len(groups)}] {gname} — {len(rows)} priced cards", flush=True)

            for row in rows:
                code   = row["number"]
                rarity = row["rarity"]
                usd    = row["usd"]
                eur    = round(usd * rate, 2)

                # Try exact match first
                key = (code, rarity)
                entries = db_index.get(key)

                # Try normalized match if exact fails
                if not entries:
                    nkey = (code, normalize_rarity(rarity))
                    entries = norm_index.get(nkey)

                if entries:
                    for (rowid, _) in entries:
                        updates.append((f"{eur:.2f}", rowid))
                    matched += 1
                else:
                    unmatched += 1

    print(f"\nMatched: {matched} | Unmatched: {unmatched} | Updates to write: {len(updates)}", flush=True)

    if args.dry_run:
        print("Dry run — not writing to DB", flush=True)
        # Show a sample
        for price_str, rowid in updates[:10]:
            print(f"  rowid={rowid}  new_price={price_str} EUR", flush=True)
        return

    if not updates:
        print("Nothing to update.", flush=True)
        return

    print(f"\nWriting {len(updates)} price updates to DB...", flush=True)
    conn = sqlite3.connect(db_path)
    conn.execute("BEGIN")
    try:
        conn.executemany(
            "UPDATE card_sets SET set_price = ? WHERE rowid = ?",
            updates
        )
        conn.commit()
        print(f"Done. {len(updates)} rows updated.", flush=True)
    except Exception as e:
        conn.rollback()
        print(f"ERROR during write: {e}", flush=True)
    finally:
        conn.close()

if __name__ == "__main__":
    main()