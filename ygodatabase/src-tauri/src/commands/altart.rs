use rusqlite::named_params;
use serde::{Deserialize, Serialize};
use crate::db::open_db;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// One image variant for an alt-art card.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkVariant {
    pub artwork_index: i64,  // 0 = base, 1 = first alt, etc.
    pub image_id: i64,
    pub img_path: String,    // asset:// URL
    pub img_thumb_path: Option<String>,
}

/// Full detail needed for the alt-art editor panel.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AltArtCard {
    pub id: i64,
    pub name: String,
    pub artworks: Vec<ArtworkVariant>,
    /// All set entries for this card with their current artwork assignment.
    pub set_entries: Vec<AltArtSetEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AltArtSetEntry {
    pub set_code: String,
    pub set_name: Option<String>,
    pub set_rarity: Option<String>,
    pub artwork: i64,        // current artwork index (0 = base)
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Migrates `card_sets` so that:
/// 1. The `artwork` column exists (INTEGER DEFAULT 0).
/// 2. The unique key is (card_id, set_code, set_rarity, artwork) instead of
///    (card_id, set_code, set_rarity) — this allows the same rarity to appear
///    in both artwork 0 and artwork 1 of the same set.
///
/// Idempotent: checks whether the migration is already done before acting.
#[tauri::command]
pub fn ensure_artwork_column() -> Result<(), String> {
    let conn = open_db()?;

    // Check if the artwork column already exists
    let has_artwork: bool = conn
        .prepare("SELECT artwork FROM card_sets LIMIT 1")
        .is_ok();

    // Check whether the unique constraint already includes artwork
    // by inspecting the table definition
    let table_sql: String = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='card_sets'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_default();

    let needs_migration = !table_sql.contains("set_rarity, artwork")
        && !table_sql.contains("set_rarity,artwork");

    if !needs_migration {
        return Ok(());
    }

    // Recreate the table with the correct schema:
    // UNIQUE(card_id, set_code, set_rarity, artwork)
    conn.execute_batch("
        BEGIN;

        CREATE TABLE IF NOT EXISTS card_sets_new (
            card_id           INTEGER,
            set_code          TEXT,
            set_name          TEXT,
            set_rarity        TEXT,
            set_price         TEXT,
            collection_amount INTEGER DEFAULT 0,
            artwork           INTEGER DEFAULT 0,
            UNIQUE(card_id, set_code, set_rarity, artwork)
        );

        INSERT OR IGNORE INTO card_sets_new
            (card_id, set_code, set_name, set_rarity, set_price, collection_amount, artwork)
        SELECT
            card_id, set_code, set_name, set_rarity, set_price,
            COALESCE(collection_amount, 0),
            COALESCE(artwork, 0)
        FROM card_sets;

        DROP TABLE card_sets;
        ALTER TABLE card_sets_new RENAME TO card_sets;

        COMMIT;
    ").map_err(|e| e.to_string())?;

    Ok(())
}

/// Returns all cards with has_alt_art = 1, with their artwork variants and set entries.
#[tauri::command]
pub fn get_alt_art_cards() -> Result<Vec<AltArtCard>, String> {
    let conn = open_db()?;

    // Collect all alt-art card IDs + names
    let mut card_stmt = conn
        .prepare("SELECT id, name FROM cards WHERE has_alt_art = 1 ORDER BY name")
        .map_err(|e| e.to_string())?;

    let cards: Vec<(i64, String)> = card_stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e: rusqlite::Error| e.to_string())?;

    let mut result = Vec::new();

    for (card_id, name) in cards {
        // Artworks: image_id sorted ascending; index = image_id - card_id
        let mut img_stmt = conn
            .prepare("SELECT image_id, local_path FROM card_images WHERE card_id = ?1 ORDER BY image_id ASC")
            .map_err(|e| e.to_string())?;

        let artworks: Vec<ArtworkVariant> = img_stmt
            .query_map([card_id], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?
            .enumerate()
            .map(|(idx, r)| {
                r.map_err(|e: rusqlite::Error| e.to_string()).map(|(image_id, local_path)| {
                    let fixed = local_path.replace('\\', "/");
                    let img_path = if let Some(i) = fixed.find("img/") {
                        format!("asset://{}", &fixed[i..])
                    } else {
                        format!("asset://{}", fixed)
                    };
                    // Thumb path
                    let thumb = if let Some(i) = fixed.find("img/") {
                        let after = &fixed[i + 4..];
                        let stem = if let Some(d) = after.rfind('.') { &after[..d] } else { after };
                        Some(format!("asset://img_thumb/{}.webp", stem))
                    } else { None };

                    ArtworkVariant {
                        artwork_index: idx as i64,
                        image_id,
                        img_path,
                        img_thumb_path: thumb,
                    }
                })
            })
            .collect::<Result<_, _>>()?;

        // Set entries with current artwork
        let mut set_stmt = conn
            .prepare(
                "SELECT set_code, set_name, set_rarity, COALESCE(artwork, 0)
                 FROM card_sets WHERE card_id = ?1 ORDER BY set_code"
            )
            .map_err(|e| e.to_string())?;

        let set_entries: Vec<AltArtSetEntry> = set_stmt
            .query_map([card_id], |row| {
                Ok(AltArtSetEntry {
                    set_code:  row.get(0)?,
                    set_name:  row.get(1)?,
                    set_rarity: row.get(2)?,
                    artwork:   row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<_, _>>()
            .map_err(|e: rusqlite::Error| e.to_string())?;

        result.push(AltArtCard { id: card_id, name, artworks, set_entries });
    }

    Ok(result)
}

/// Update the artwork index for a specific (card_id, set_code, set_rarity) row.
#[tauri::command]
pub fn set_set_artwork(card_id: i64, set_code: String, set_rarity: String, artwork: i64) -> Result<(), String> {
    let conn = open_db()?;
    conn.execute(
        "UPDATE card_sets SET artwork = ?1 WHERE card_id = ?2 AND set_code = ?3 AND set_rarity = ?4",
        (artwork, card_id, set_code, set_rarity),
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Remove a specific (card_id, set_code, set_rarity, artwork) row from card_sets.
#[tauri::command]
pub fn remove_set_entry(card_id: i64, set_code: String, set_rarity: String, artwork: i64) -> Result<(), String> {
    let conn = open_db()?;
    conn.execute(
        "DELETE FROM card_sets WHERE card_id = ?1 AND set_code = ?2 AND set_rarity = ?3 AND artwork = ?4",
        (card_id, &set_code, &set_rarity, artwork),
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Insert a new card_sets row. The unique key is (card_id, set_code, set_rarity, artwork)
/// so the same rarity can exist in both artwork 0 and artwork 1 of the same set.
#[tauri::command]
pub fn add_set_entry(card_id: i64, set_code: String, set_name: String, set_rarity: String, artwork: i64) -> Result<(), String> {
    let conn = open_db()?;
    // Check it doesn't already exist
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM card_sets WHERE card_id=?1 AND set_code=?2 AND set_rarity=?3 AND artwork=?4",
            (card_id, &set_code, &set_rarity, artwork),
            |row| row.get::<_, i64>(0),
        )
        .map(|n| n > 0)
        .unwrap_or(false);
    if exists {
        return Err(format!("Entry ({}, {}, artwork={}) already exists", set_code, set_rarity, artwork));
    }
    conn.execute(
        "INSERT INTO card_sets (card_id, set_code, set_name, set_rarity, set_price, collection_amount, artwork)
         VALUES (?1, ?2, ?3, ?4, '0', 0, ?5)",
        (card_id, &set_code, &set_name, &set_rarity, artwork),
    ).map_err(|e| e.to_string())?;
    Ok(())
}