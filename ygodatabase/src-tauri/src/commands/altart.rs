use serde::Serialize;
use crate::db::open_db;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// One image variant for an alt-art card.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkVariant {
    pub artwork_index: i64, // 0 = base, 1 = first alt, etc.
    pub image_id: i64,
    pub img_path: String, // asset:// URL
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
    pub artwork: i64, // current artwork index (0 = base)
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Ensure the `artwork` column exists on `card_sets` (idempotent migration).
#[tauri::command]
pub fn ensure_artwork_column() -> Result<(), String> {
    let conn = open_db()?;
    // ADD COLUMN IF NOT EXISTS is not supported in old SQLite — use a try/ignore pattern
    let _ = conn.execute(
        "ALTER TABLE card_sets ADD COLUMN artwork INTEGER NOT NULL DEFAULT 0",
        [],
    );
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
                    set_code: row.get(0)?,
                    set_name: row.get(1)?,
                    set_rarity: row.get(2)?,
                    artwork: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<_, _>>()
            .map_err(|e: rusqlite::Error| e.to_string())?;

        result.push(AltArtCard { id: card_id, name, artworks, set_entries });
    }

    Ok(result)
}

/// Update the artwork index for a specific (card_id, set_code) row.
#[tauri::command]
pub fn set_set_artwork(card_id: i64, set_code: String, artwork: i64) -> Result<(), String> {
    let conn = open_db()?;
    conn.execute(
        "UPDATE card_sets SET artwork = ?1 WHERE card_id = ?2 AND set_code = ?3",
        (artwork, card_id, set_code),
    ).map_err(|e| e.to_string())?;
    Ok(())
}