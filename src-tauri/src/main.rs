use rusqlite::{Connection, Result};
use serde::Serialize;

#[derive(Serialize)]
struct Card {
    id: i64,
    name: String,
    card_type: String,
}

#[tauri::command]
fn get_first_cards() -> Result<Vec<Card>, String> {
    let conn = Connection::open("E:/ygodatabase/cards.db")
        .map_err(|e| format!("DB Fehler: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT id, name, type FROM cards LIMIT 10")
        .map_err(|e| format!("Query Fehler: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Card {
                id: row.get(0)?,
                name: row.get(1)?,
                card_type: row.get(2)?,
            })
        })
        .map_err(|e| format!("Mapping Fehler: {}", e))?;

    let mut cards = vec![];
    for row in rows {
        cards.push(row.map_err(|e| format!("Row Fehler: {}", e))?);
    }

    Ok(cards)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_first_cards])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
