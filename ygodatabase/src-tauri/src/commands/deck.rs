use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;

use crate::db::{get_db_path, normalize_img_path, normalize_thumb_path, open_db};

// Raw shape of the banlist_info JSON column
#[derive(Deserialize)]
struct BanlistInfo {
    ban_tcg:  Option<String>,
    ban_ocg:  Option<String>,
    ban_goat: Option<String>,
}

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedDeck {
    pub name: String,
    pub main: Vec<DeckStub>,
    pub extra: Vec<DeckStub>,
    pub side: Vec<DeckStub>,
}

/// Minimal card data needed to reconstruct a DeckEntry on the frontend.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeckStub {
    pub id: i64,
    pub name: String,
    pub img_path: Option<String>,
    pub img_thumb_path: Option<String>,
    pub frame_type: Option<String>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
fn decks_dir() -> std::path::PathBuf {
    let mut path = get_db_path();
    path.pop();           // remove cards.db → ressources/
    path.push("decks");   // ressources/decks/
    path
}

fn deck_path(name: &str) -> std::path::PathBuf {
    let mut p = decks_dir();
    p.push(format!("{}.ydk", name));
    p
}

/// Fetch minimal card data for a list of IDs in a single query.
fn fetch_stubs_by_ids(ids: &[i64]) -> Result<HashMap<i64, DeckStub>, String> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let conn = open_db()?;

    // Build a parameterised IN clause: (?1,?2,?3,...)
    let placeholders: Vec<String> = (1..=ids.len()).map(|i| format!("?{}", i)).collect();
    let sql = format!(
        "SELECT c.id, c.name, ci.local_path, c.frameType
         FROM cards c
         LEFT JOIN card_images ci ON c.id = ci.card_id
         WHERE c.id IN ({})",
        placeholders.join(",")
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    // rusqlite requires &dyn ToSql slice — build it from the ids
    let params: Vec<&dyn rusqlite::types::ToSql> = ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();

    let rows = stmt
        .query_map(params.as_slice(), |row| {
            Ok(DeckStub {
                id: row.get(0)?,
                name: row.get(1)?,
                img_path: row.get(2)?,
                img_thumb_path: None, // filled in below
                frame_type: row.get(3).ok(),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut map = HashMap::new();
    for r in rows {
        let mut stub = r.map_err(|e| e.to_string())?;
        stub.img_thumb_path = normalize_thumb_path(stub.img_path.as_ref());
        stub.img_path = normalize_img_path(stub.img_path);
        map.insert(stub.id, stub);
    }
    Ok(map)
}

/// Resolve an ordered list of IDs into DeckStub entries, preserving duplicates.
fn resolve_ids(ids: &[i64], map: &HashMap<i64, DeckStub>) -> Vec<DeckStub> {
    ids.iter()
        .filter_map(|id| map.get(id).cloned())
        .collect()
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
/// Reads `ressources/banlist.json`. Returns empty BanList if file is missing.
#[tauri::command]
pub fn get_ban_list() -> Result<BanList, String> {
    let mut path = get_db_path();
    path.pop();
    path.push("banlist.json");

    let contents = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return Ok(BanList::default()),
    };

    serde_json::from_str::<BanList>(&contents)
        .map_err(|e| format!("banlist.json parse error: {}", e))
}

/// Returns a map of card_id → total collection amount for every card that has
/// at least 1 copy owned. Cards with 0 owned are omitted (treat missing as 0).
#[tauri::command]
pub fn get_collection_amounts() -> Result<std::collections::HashMap<i64, i64>, String> {
    let conn = open_db()?;
    let mut stmt = conn
        .prepare(
            "SELECT card_id, SUM(collection_amount) as total
             FROM card_sets
             WHERE collection_amount > 0
             GROUP BY card_id",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)))
        .map_err(|e| e.to_string())?;

    let mut map = std::collections::HashMap::new();
    for r in rows {
        let (id, total) = r.map_err(|e| e.to_string())?;
        map.insert(id, total);
    }
    Ok(map)
}


#[tauri::command]
pub fn list_decks() -> Result<Vec<String>, String> {
    let dir = decks_dir();
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut names = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("ydk") {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                names.push(stem.to_string());
            }
        }
    }
    names.sort();
    Ok(names)
}

/// Saves a deck as `ressources/decks/{name}.ydk`. Overwrites if it already exists.
#[tauri::command]
pub fn save_deck(
    name: String,
    main_ids: Vec<i64>,
    extra_ids: Vec<i64>,
    side_ids: Vec<i64>,
) -> Result<(), String> {
    let dir = decks_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut content = String::new();
    content.push_str("#created by Player\n");
    content.push_str("#main\n");
    for id in &main_ids  { content.push_str(&format!("{}\n", id)); }
    content.push_str("#extra\n");
    for id in &extra_ids { content.push_str(&format!("{}\n", id)); }
    content.push_str("!side\n");
    for id in &side_ids  { content.push_str(&format!("{}\n", id)); }

    fs::write(deck_path(&name), content).map_err(|e| e.to_string())
}

/// Deletes `ressources/decks/{name}.ydk`.
#[tauri::command]
pub fn delete_deck(name: String) -> Result<(), String> {
    let path = deck_path(&name);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Reads `banlist_info` from every card in the DB, extracts the status for the
/// requested format ("tcg", "ocg", or "goat"), and overwrites `banlist.json`.
///
/// Rows with a NULL or unparseable `banlist_info` are silently skipped (the card
/// is unrestricted and doesn't need to appear in the file).
#[tauri::command]
pub fn sync_banlist_from_db(format: String) -> Result<(), String> {
    let conn = open_db()?;

    let mut stmt = conn
        .prepare("SELECT id, banlist_info FROM cards WHERE banlist_info IS NOT NULL")
        .map_err(|e| e.to_string())?;

    let mut ban = BanList::default();

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (id, json_str) = row.map_err(|e| e.to_string())?;

        // Skip rows whose banlist_info isn't valid JSON — don't abort the whole sync
        let info: BanlistInfo = match serde_json::from_str(&json_str) {
            Ok(v)  => v,
            Err(_) => continue,
        };

        // Pick the relevant field based on the requested format
        let status: Option<&str> = match format.to_lowercase().as_str() {
            "tcg" => info.ban_tcg.as_deref(),
            "ocg" => info.ban_ocg.as_deref(),
            "goat" => info.ban_goat.as_deref(),
            other  => return Err(format!("Unknown format '{}'. Use tcg, ocg, or goat.", other)),
        };

        match status {
            Some(s) if s.eq_ignore_ascii_case("Forbidden") => ban.forbidden.push(id),
            Some(s) if s.eq_ignore_ascii_case("Limited") => ban.limited.push(id),
            Some(s) if s.eq_ignore_ascii_case("Semi-Limited") => ban.semi_limited.push(id),
            _ => {} // unrestricted or absent — not included in banlist.json
        }
    }

    // Sort for deterministic output
    ban.forbidden.sort();
    ban.limited.sort();
    ban.semi_limited.sort();

    // Write banlist.json next to cards.db
    let mut path = get_db_path();
    path.pop();
    path.push("banlist.json");

    let json = serde_json::to_string_pretty(&ban).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;

    Ok(())
}

/// Loads a saved .ydk file and resolves card IDs to full DeckStub objects.
#[tauri::command]
pub fn load_deck(name: String) -> Result<LoadedDeck, String> {
    let content = fs::read_to_string(deck_path(&name))
        .map_err(|e| format!("Could not read deck '{}': {}", name, e))?;

    let mut main_ids: Vec<i64> = Vec::new();
    let mut extra_ids: Vec<i64> = Vec::new();
    let mut side_ids: Vec<i64> = Vec::new();

    #[derive(PartialEq)]
    enum Section { None, Main, Extra, Side }
    let mut section = Section::None;

    for line in content.lines() {
        let line = line.trim();
        match line {
            "#main" => { section = Section::Main;  continue; }
            "#extra" => { section = Section::Extra; continue; }
            "!side" => { section = Section::Side;  continue; }
            _ if line.starts_with('#') => continue, // e.g. #created by Player
            _ if line.is_empty() => continue,
            _ => {}
        }
        if let Ok(id) = line.parse::<i64>() {
            match section {
                Section::Main => main_ids.push(id),
                Section::Extra => extra_ids.push(id),
                Section::Side => side_ids.push(id),
                Section::None => {}
            }
        }
    }

    // Single DB round-trip for all unique IDs across all sections
    let all_ids: Vec<i64> = {
        let mut v = main_ids.clone();
        v.extend_from_slice(&extra_ids);
        v.extend_from_slice(&side_ids);
        v.sort();
        v.dedup();
        v
    };

    let map = fetch_stubs_by_ids(&all_ids)?;

    Ok(LoadedDeck {
        name,
        main: resolve_ids(&main_ids, &map),
        extra: resolve_ids(&extra_ids, &map),
        side: resolve_ids(&side_ids, &map),
    })
}