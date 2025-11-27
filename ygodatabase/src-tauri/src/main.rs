use base64::prelude::*;
use rusqlite::{Connection, Result};
use serde::Serialize;
use std::fs;

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

#[derive(Default)]
struct MyState {
  s: std::sync::Mutex<String>,
  t: std::sync::Mutex<std::collections::HashMap<String, String>>,
}

#[tauri::command]
fn get_all_sets() -> Result<Vec<String>, String> {
    let db_path = "E:/ygodatabase/cards.db";
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

#[tauri::command]
fn get_cards_by_set(set_name: String) -> Result<Vec<Card>, String> {
    let db_path = "E:/ygodatabase/cards.db";
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT c.id, c.name, c.type, ci.local_path
            FROM cards c
            JOIN card_sets cs ON c.id = cs.card_id
            LEFT JOIN card_images ci ON c.id = ci.card_id
            WHERE cs.set_name = ?
            ORDER BY set_code
            "
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([set_name], |row| {
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

    let mut cards = vec![];
    for card in rows {
        cards.push(card.map_err(|e| e.to_string())?);
    }

    Ok(cards)
}

#[tauri::command]
fn load_cards_with_images() -> Result<Vec<Card>, String> {
    let db_path = "E:/ygodatabase/cards.db";
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.name, c.type, ci.local_path
             FROM cards c
             LEFT JOIN card_images ci ON c.id = ci.card_id
             LIMIT 10;"
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![load_cards_with_images, get_all_sets, get_cards_by_set])
        .run(tauri::generate_context!())
        .expect("error running app");
}
