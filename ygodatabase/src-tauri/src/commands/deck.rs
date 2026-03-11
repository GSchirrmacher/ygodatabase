use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;

use crate::db::{get_db_path, normalize_img_path, open_db};

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
                id:         row.get(0)?,
                name:       row.get(1)?,
                img_path:   row.get(2)?,
                frame_type: row.get(3).ok(),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut map = HashMap::new();
    for r in rows {
        let mut stub = r.map_err(|e| e.to_string())?;
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

/// Returns the names (without .ydk extension) of all saved decks, sorted alphabetically.
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

/// Loads a saved .ydk file and resolves card IDs to full DeckStub objects.
#[tauri::command]
pub fn load_deck(name: String) -> Result<LoadedDeck, String> {
    let content = fs::read_to_string(deck_path(&name))
        .map_err(|e| format!("Could not read deck '{}': {}", name, e))?;

    let mut main_ids:  Vec<i64> = Vec::new();
    let mut extra_ids: Vec<i64> = Vec::new();
    let mut side_ids:  Vec<i64> = Vec::new();

    #[derive(PartialEq)]
    enum Section { None, Main, Extra, Side }
    let mut section = Section::None;

    for line in content.lines() {
        let line = line.trim();
        match line {
            "#main"  => { section = Section::Main;  continue; }
            "#extra" => { section = Section::Extra; continue; }
            "!side"  => { section = Section::Side;  continue; }
            _ if line.starts_with('#') => continue, // e.g. #created by Player
            _ if line.is_empty()       => continue,
            _ => {}
        }
        if let Ok(id) = line.parse::<i64>() {
            match section {
                Section::Main  => main_ids.push(id),
                Section::Extra => extra_ids.push(id),
                Section::Side  => side_ids.push(id),
                Section::None  => {}
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
        main:  resolve_ids(&main_ids,  &map),
        extra: resolve_ids(&extra_ids, &map),
        side:  resolve_ids(&side_ids,  &map),
    })
}
