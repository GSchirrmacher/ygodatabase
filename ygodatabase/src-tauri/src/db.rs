use rusqlite::{Connection, Result};
use std::path::PathBuf;

pub fn get_project_root() -> PathBuf {
    let mut exe = std::env::current_exe().expect("Failed to get exe path");
    exe.pop(); // ygodatabase.exe
    exe.pop(); // debug
    exe.pop(); // target
    exe
}

pub fn get_db_path() -> PathBuf {
    let mut root = get_project_root();
    root.push("ressources");
    root.push("cards.db");
    root
}

/// Opens the database with a 5-second busy timeout so concurrent
/// reads and writes don't immediately return SQLITE_BUSY.
pub fn open_db() -> Result<Connection, String> {
    let conn = Connection::open(get_db_path()).map_err(|e| e.to_string())?;
    conn.busy_timeout(std::time::Duration::from_secs(5)).map_err(|e| e.to_string())?;
    Ok(conn)
}

/// Creates query indexes on first run. IF NOT EXISTS makes this a no-op
/// on subsequent startups.
pub fn create_indexes(conn: &Connection) -> Result<()> {
    conn.execute_batch("
        CREATE INDEX IF NOT EXISTS idx_cards_name
            ON cards(name);
        CREATE INDEX IF NOT EXISTS idx_cards_type
            ON cards(type);
        CREATE INDEX IF NOT EXISTS idx_card_sets_card_id
            ON card_sets(card_id);
        CREATE INDEX IF NOT EXISTS idx_card_sets_set_name
            ON card_sets(set_name);
        CREATE INDEX IF NOT EXISTS idx_card_sets_code_rarity
            ON card_sets(card_id, set_code, set_rarity);
        CREATE INDEX IF NOT EXISTS idx_card_images_card_id
            ON card_images(card_id);
    ")
}

/// Normalizes a local file path to a Tauri asset:// URL.
pub fn normalize_img_path(path: Option<String>) -> Option<String> {
    path.map(|p| {
        let fixed = p.replace("\\", "/");
        let img_path = if let Some(idx) = fixed.find("img/") {
            fixed[idx..].to_string()
        } else {
            fixed
        };
        format!("asset://{}", img_path)
    })
}

/// Derives the thumbnail asset URL from a full image path.
/// img/12345_12345.jpg  →  asset://img_thumb/12345_12345.webp
/// Returns None if no img path is available.
pub fn normalize_thumb_path(path: Option<&String>) -> Option<String> {
    let p = path?;
    let fixed = p.replace("\\", "/");
    let stem = if let Some(idx) = fixed.find("img/") {
        let after = &fixed[idx + 4..]; // skip "img/"
        // strip extension
        if let Some(dot) = after.rfind('.') { &after[..dot] } else { after }
    } else {
        return None;
    };
    Some(format!("asset://img_thumb/{}.webp", stem))
}