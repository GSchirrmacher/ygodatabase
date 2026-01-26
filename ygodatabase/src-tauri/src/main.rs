use base64::prelude::*;
use rusqlite::{Connection, Result};
use serde::Serialize;
use std::fs;
//use std::path::Path;
use std::path::PathBuf;
use rusqlite::named_params;

#[derive(Serialize)]
struct Card {
    id: i64,
    name: String,
    card_type: String,
    img_base64: Option<String>,
    sets: Option<Vec<String>>,
    set_rarity: Option<String>,
}

#[derive(Debug)]
struct RawRow {
    id: i64,
    name: String,
    card_type: String,
    img: Option<String>,
    set_name: Option<String>,
    set_rarity: Option<String>,
}

fn get_db_path() -> PathBuf {
    let mut exe = std::env::current_exe().expect("Failed to get exe path");

    // exe = .../src-tauri/target/debug/ygodatabase.exe
    exe.pop(); // remove ygodatabase.exe
    exe.pop(); // remove debug
    exe.pop(); // remove target

    exe.push("src");
    exe.push("cards.db");

    exe

    /*if cfg!(debug_assertions) { // all for later uses
        let mut exe = std::env::current_exe().unwrap();
        exe.pop(); exe.pop(); exe.pop();
        exe.push("src/cards.db");
        exe
    } else {
        let mut exe = std::env::current_exe().unwrap();
        exe.pop();
        exe.push("cards.db");
        exe
    }*/
}


#[tauri::command]
fn load_cards_with_images(name: Option<String>, card_type: Option<String>, set: Option<String>) 
    -> Result<Vec<Card>, String> {
    let db_path = get_db_path();
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let grouped_mode = set.is_none();

    let stmt = String::from(
        "SELECT c.id, c.name, c.type, ci.local_path, cs.set_rarity
         FROM cards c
         LEFT JOIN card_images ci ON c.id = ci.card_id
         LEFT JOIN card_sets cs ON c.id = cs.card_id
         WHERE 1=1
            AND (:name IS NULL OR c.name LIKE :name)
            AND (:card_type IS NULL OR c.type = :card_type)
            AND (:set IS NULL OR cs.set_name = :set)
        LIMIT 50"
    );

    let mut stmt = conn.prepare(&stmt).map_err(|e| e.to_string())?;

    let params = named_params! {
        ":name": name.as_ref().map(|v| format!("%{}%", v)),
        ":card_type": card_type.as_ref(),
        ":set": set.as_ref(),
    };

    let rows = stmt
        .query_map(params, |row| {
            let id: i64 = row.get(0)?;
            let name: String = row.get(1)?;
            let card_type: String = row.get(2)?;
            let path: Option<String> = row.get(3)?;
            let set_rarity: Option<String> = row.get(4)?;


            let img_b64 = path.as_ref().and_then(|p| {
                let fixed = p.replace("\\", "/");

                let mut base = get_db_path();
                base.pop(); // remove cards.db → now points to src-tauri/src/

                let full_path = base.join(fixed);

                match fs::read(&full_path) {
                    Ok(bytes) => Some(BASE64_STANDARD.encode(bytes)),
                    Err(e) => {
                        eprintln!("Failed to read image {:?}: {}", full_path, e);
                        None
                    }   
                }
            });

            Ok(Card {
                id,
                name,
                card_type,
                img_base64: img_b64,
                set_rarity,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut cards = Vec::new();
    for card in rows {
        cards.push(card.map_err(|e| e.to_string())?);
    }

    Ok(cards)
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
            ORDER BY set_name
            "
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let set_name: String = row.get(0)?;
            Ok(set_name)
        })
        .map_err(|e| e.to_string())?;

    let mut card_sets = vec![];
    for card_set in rows {
        card_sets.push(card_set.map_err(|e| e.to_string())?);
    }
    Ok(card_sets)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![load_cards_with_images, get_all_sets])
        .run(tauri::generate_context!())
        .expect("error running app");
}
