use serde::{Deserialize, Serialize};
use std::fs;

use crate::db::get_db_path;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BanList {
    #[serde(default)]
    pub forbidden: Vec<i64>,
    #[serde(default)]
    pub limited: Vec<i64>,
    #[serde(default)]
    pub semi_limited: Vec<i64>,
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Reads `ressources/banlist.json` next to the database.
/// Returns an empty BanList (all cards at 3 copies) if the file is missing
/// or malformed — so the deckbuilder works fine without a ban list file.
///
/// Expected file format:
/// {
///   "forbidden":   [card_id, ...],
///   "limited":     [card_id, ...],
///   "semiLimited": [card_id, ...]
/// }
#[tauri::command]
pub fn get_ban_list() -> Result<BanList, String> {
    let mut path = get_db_path();
    path.pop();                  // remove cards.db
    path.push("banlist.json");   // ressources/banlist.json

    let contents = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return Ok(BanList::default()), // file missing → all cards legal at 3
    };

    serde_json::from_str::<BanList>(&contents)
        .map_err(|e| format!("banlist.json parse error: {}", e))
}
