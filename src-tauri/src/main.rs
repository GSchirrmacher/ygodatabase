// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
use tauri::State;
use rusqlite::{Connection, OpenFlags};

#[derive(Serialize)]
struct CardImage {
    card_id: i32,
    base64: String,
}

struct DbConn(Mutex<Connection>);

#[tauri::command]
fn get_first_10_card_images(db: State<DbConn>) -> Result<Vec<CardImage>, String> {
    let conn = db.0.lock().unwrap();

    let mut stmt = conn
        .prepare("SELECT card_id, url FROM card_images ORDER BY card_id LIMIT 10")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let id: i32 = row.get(0)?;
            let filename: String = row.get(1)?;
            Ok((id, filename))
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();

    for row in rows {
        let (card_id, filename) = row.map_err(|e| e.to_string())?;

        // Bildpfad zusammenbauen
        let img_path = PathBuf::from("../ygodatabase/").join(&filename);

        // Datei lesen
        let bytes = fs::read(&img_path)
            .map_err(|e| format!("Konnte Bild nicht lesen {}: {}", filename, e))?;

        // Base64
        let encoded = general_purpose::STANDARD.encode(bytes);

        result.push(CardImage {
            card_id,
            base64: encoded,
        });
    }

    Ok(result)
}
fn main() {
    let conn = Connection::open_with_flags(
        "/ygodatabase/cards.db",
        rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE
            | rusqlite::OpenFlags::SQLITE_OPEN_CREATE
            | rusqlite::OpenFlags::SQLITE_OPEN_FULL_MUTEX,
    )
    .expect("Datenbank konnte nicht geöffnet werden");

    tauri::Builder::default()
        .manage(DbConn(Mutex::new(conn)))
        .invoke_handler(tauri::generate_handler![get_first_10_card_images])
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten");
}
