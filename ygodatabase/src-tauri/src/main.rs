use base64::prelude::*;
use rusqlite::{Connection, Result};
use serde::Serialize;
use std::fs;
use rusqlite::named_params;

static DB_PATH: &'static str = "E:/ygodatabase/cards.db";

#[derive(Serialize)]
struct Card {
    id: i64,
    name: String,
    card_type: String,
    img_base64: Option<String>,
}

#[derive(Serialize)]
struct Set {
    set_name: String,
}

#[tauri::command]
fn load_cards_with_images(name: Option<String>, card_type: Option<String>, set: Option<String>) 
    -> Result<Vec<Card>, String> {
    let conn = Connection::open(DB_PATH).map_err(|e| e.to_string())?;

    let mut stmt = String::from(
        "SELECT DISTINCT c.id, c.name, c.type, ci.local_path
         FROM cards c
         LEFT JOIN card_images ci ON c.id = ci.card_id
         LEFT JOIN card_sets cs ON c.id = cs.card_id
         WHERE 1=1
            AND (:name IS NULL OR c.name LIKE :name)
            AND (:card_type IS NULL OR c.type = :card_type)
            AND (:set IS NULL OR cs.set_name = :set)
        "
    );

    if name.is_some() {
        stmt.push_str(" AND name LIKE :name");
    }
    if card_type.is_some() {
        stmt.push_str(" AND card_type = :card_type");
    }
    if set.is_some() {
        stmt.push_str(" AND set_name = :set");
    }

    stmt.push_str(" LIMIT 50");

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

            let img_b64 = path.as_ref().and_then(|p| {
                let fixed = p.replace("\\", "/");
                let full_path = format!("E:/ygodatabase/{}", fixed);

                match fs::read(&full_path) {
                    Ok(bytes) => Some(BASE64_STANDARD.encode(bytes)),
                    Err(_) => None,
                }
            });

            Ok(Card {
                id,
                name,
                card_type,
                img_base64: img_b64,
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
    let conn = Connection::open(DB_PATH).map_err(|e| e.to_string())?;
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
