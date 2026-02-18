use rusqlite::{Connection};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use rusqlite::named_params;

// TODO : set_code anstatt image_id als identifier?
// TODO : scraper updaten, dass mehrere Karten mit alt arts vorhanden sein können

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
    set_code: Option<String>,
    has_alt_art: i64,
    img_path: Option<String>,
    image_id: Option<i64>,
    sets: Option<Vec<String>>,
    set_rarity: Option<String>,
}

#[derive(Debug)]
struct RawRow {
    id: i64,
    name: String,
    card_type: String,
    set_code: Option<String>,
    has_alt_art: i64,
    img_path: Option<String>,
    image_id: Option<i64>,
    set_name: Option<String>,
    set_rarity: Option<String>,
}

/// Normalizes a path and converts it to a Tauri asset:// URL
fn normalize_img_path(path: Option<String>) -> Option<String> {
    path.map(|p| {
        // Replace backslashes with forward slashes
        let fixed = p.replace("\\", "/");

        // Extract only "img/filename.jpg" if present
        let img_path = if let Some(idx) = fixed.find("img/") {
            fixed[idx..].to_string()
        } else {
            fixed
        };

        // Prepend "asset://" so Tauri can serve it correctly
        format!("asset://{}", img_path)
    })
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
            c.has_alt_art,
            ci.image_id,
            ci.local_path, 
            cs.set_code,
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
            id: row.get("id")?,
            name: row.get("name")?,
            card_type: row.get("type")?,
            set_code: row.get("set_code")?,
            has_alt_art: row.get("has_alt_art")?,
            img_path: row.get("local_path")?,
            image_id: row.get("image_id")?,
            set_name: row.get("set_name").ok(),
            set_rarity: row.get("set_rarity").ok(),
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
                set_code: r.set_code.clone(),
                has_alt_art: r.has_alt_art.clone(),
                img_path: normalize_img_path(r.img_path),
                image_id: r.image_id,
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
            set_code: r.set_code,
            has_alt_art: r.has_alt_art,
            img_path: normalize_img_path(r.img_path),
            image_id: r.image_id,
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
