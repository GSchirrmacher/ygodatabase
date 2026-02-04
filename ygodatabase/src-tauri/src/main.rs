use base64::prelude::*;
use rusqlite::{Connection};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use rusqlite::named_params;

fn get_project_root() -> PathBuf {
    let mut exe = std::env::current_exe().expect("Failed to get exe path");

    exe.pop(); // ygodatabase.exe
    exe.pop(); // debug
    exe.pop(); // target

    exe
}

fn get_db_path() -> PathBuf {
    let mut root = get_project_root();
    root.push("ressources");
    root.push("cards.db");
    root
}

#[derive(Serialize)]
struct Card {
    id: i64,
    name: String,
    card_type: String,
    img_base64: Option<String>,
    image_id: Option<i64>,
    is_alt_art: bool,
    sets: Option<Vec<String>>,
    set_rarity: Option<String>,
}

#[derive(Debug)]
struct RawRow {
    id: i64,
    name: String,
    card_type: String,
    img_path: Option<String>,
    image_id: Option<i64>,
    set_name: Option<String>,
    set_rarity: Option<String>,
}

fn load_image_base64(path: &Option<String>) -> Option<String> {
    path.as_ref().and_then(|p| {
        let fixed = p.replace("\\", "/");

        let mut full_path = get_project_root();
        full_path.push("ressources");
        full_path.push(fixed);   // e.g. img/12345.jpg

        fs::read(full_path)
            .ok()
            .map(|bytes| BASE64_STANDARD.encode(bytes))
    })
}

fn is_alt_art(card_id: i64, image_id: Option<i64>) -> bool {
    match image_id {
        Some(img_id) => img_id != card_id,
        None => false,
    }
}

#[tauri::command]
fn load_cards_with_images(
    name: Option<String>,
    card_type: Option<String>,
    set: Option<String>,
) -> Result<Vec<Card>, String> {
    let db_path = get_db_path();
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let sql = "
        SELECT 
            c.id, 
            c.name, 
            c.type, 
            ci.local_path, 
            ci.image_id,
            c.set_code
            cs.set_name, 
            cs.set_rarity
        FROM cards c
        LEFT JOIN card_images ci ON c.id = ci.card_id
        LEFT JOIN card_sets cs ON c.id = cs.card_id
        WHERE (:name IS NULL OR c.name LIKE :name)
        AND (:card_type IS NULL OR c.type = :card_type)
        AND (:set IS NULL OR cs.set_name = :set)
        LIMIT 50
    ";


    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;

    let params = named_params! {
        ":name": name.as_ref().map(|v| format!("%{}%", v)),
        ":card_type": card_type.as_ref(),
        ":set": set.as_ref(),
    };

    let rows = stmt
    .query_map(params, |row| {
        Ok(RawRow {
            id: row.get(0)?,
            name: row.get(1)?,
            card_type: row.get(2)?,
            img_path: row.get(3)?,
            image_id: row.get(4).ok(),
            set_name: row.get(5).ok(),
            set_rarity: row.get(6).ok(),
        })
    })
    .map_err(|e| e.to_string())?;


    let mut raw_rows = Vec::new();
    for r in rows {
        raw_rows.push(r.map_err(|e| e.to_string())?);
    }

    let grouped_mode = set.is_none();

    if grouped_mode {
        // GROUPED MODE (no set filter)
        let mut map: HashMap<i64, Card> = HashMap::new();

        for r in raw_rows {
            let entry = map.entry(r.id).or_insert_with(|| Card {
                id: r.id,
                name: r.name.clone(),
                card_type: r.card_type.clone(),
                img_base64: load_image_base64(&r.img_path),
                image_id: r.image_id,
                is_alt_art: is_alt_art(r.id, r.image_id),
                sets: Some(Vec::new()),
                set_rarity: None,
            });

            if let Some(set_name) = r.set_name {
                if let Some(ref mut sets) = entry.sets {
                    if !sets.contains(&set_name) {
                        sets.push(set_name);
                    }
                }
            }
        }

        Ok(map.into_values().collect())
    } else {
        // SET FILTER MODE (flat list)
        let cards = raw_rows
        .into_iter()
        .map(|r| Card {
            id: r.id,
            name: r.name,
            card_type: r.card_type,
            img_base64: load_image_base64(&r.img_path),
            image_id: r.image_id,
            is_alt_art: is_alt_art(r.id, r.image_id),
            sets: None,
            set_rarity: r.set_rarity,
        })
        .collect();


        Ok(cards)
    }
}

#[tauri::command]
fn get_all_sets() -> Result<Vec<String>, String> {
    let db_path = get_db_path();
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT set_name
             FROM card_sets
             WHERE set_name IS NOT NULL
             ORDER BY set_name"
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

    let mut sets = Vec::new();
    for s in rows {
        sets.push(s.map_err(|e| e.to_string())?);
    }

    Ok(sets)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_cards_with_images,
            get_all_sets
        ])
        .run(tauri::generate_context!())
        .expect("error running app");
}
