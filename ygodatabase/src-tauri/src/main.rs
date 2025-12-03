use rusqlite::{Connection, ToSql};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;

static DB_PATH: &'static str = "E:/ygodatabase/cards.db";

#[derive(Serialize)]
struct Card {
    id: i64,
    name: String,
    card_type: String,
    image_path: Option<String>,
}

#[tauri::command]
fn filter_cards(
    query: Option<String>,
    set: Option<String>,
    card_type: Option<String>,
    attribute: Option<String>,
) -> Result<Vec<Card>, String> {
    let conn = Connection::open(DB_PATH)
        .map_err(|e| format!("DB Fehler: {}", e))?;

    let mut sql = String::from(
        "SELECT DISTINCT c.id, c.name, c.type, ci.local_path
         FROM cards c
         LEFT JOIN card_images ci ON c.id = ci.card_id
         LEFT JOIN card_sets cs ON c.id = cs.card_id
         WHERE 1=1"
    );

    let mut params: Vec<Box<dyn ToSql>> = Vec::new();

    if let Some(q) = query {
        if q.len() >= 2 {
            sql.push_str(" AND c.name LIKE ?");
            params.push(Box::new(format!("%{}%", q)));
        }
    }

    if let Some(s) = set {
        if !s.is_empty() {
            sql.push_str(" AND cs.set_name = ?");
            params.push(Box::new(s));
        }
    }

    if let Some(t) = card_type {
        if !t.is_empty() {
            sql.push_str(" AND c.type = ?");
            params.push(Box::new(t));
        }
    }

    if let Some(a) = attribute {
        if !a.is_empty() {
            sql.push_str(" AND c.attribute = ?");
            params.push(Box::new(a));
        }
    }

    sql.push_str(" ORDER BY c.name LIMIT 50");

    let mut stmt = conn.prepare(&sql)
        .map_err(|e| format!("SQL Prepare Fehler: {}", e))?;

    let rows = stmt
        .query_map(rusqlite::params_from_iter(params.iter()), |row| {
            let image_path: Option<String> = row.get(3).ok();
            Ok(Card {
                id: row.get(0)?,
                name: row.get(1)?,
                card_type: row.get(2)?,
                image_path: image_path.map(|p| p.replace("\\", "/")),
            })
        })
        .map_err(|e| format!("Query Fehler: {}", e))?;

    let mut cards: Vec<Card> = vec![];

    for c in rows {
        let mut card = c.map_err(|e| format!("Row Fehler: {}", e))?;

        // Falls ein Bildpfad existiert → Base64 laden
        if let Some(path) = &card.image_path {
            if let Ok(bytes) = fs::read(path) {
                card.image_path = Some(base64::encode(bytes));
            } else {
                card.image_path = None;
            }
        }

        cards.push(card);
    }

    Ok(cards)
}

#[tauri::command]
fn get_all_sets() -> Result<Vec<String>, String> {
    let conn = Connection::open(DB_PATH)
        .map_err(|e| format!("DB Fehler: {}", e))?;

    let mut stmt = conn.prepare("SELECT DISTINCT set_name FROM card_sets ORDER BY set_name")
        .map_err(|e| format!("Query Fehler: {}", e))?;

    let rows = stmt
        .query_map([], |r| r.get(0))
        .map_err(|e| format!("Mapping Fehler: {}", e))?;

    let mut sets = vec![];
    for row in rows {
        sets.push(row.map_err(|e| e.to_string())?);
    }

    Ok(sets)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            filter_cards,
            get_all_sets
        ])
        .run(tauri::generate_context!())
        .expect("error running app");
}
