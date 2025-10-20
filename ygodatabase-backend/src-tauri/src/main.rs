// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{params, Connection, Result};
use tauri::command;

#[command]
fn get_users()->Result<Vec<String>, String>{
    let conn = Connection::open("data/mydb.sqlite").map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT name FROM users").map_err(|e| e.to_string())?;
    let users = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<String>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(users)
}

#[command]
fn add_user(name:String) -> Result<(), String>{
    let conn = Connection::open("data/mydb.sqlite").map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO users (name) VALUES (?1)", params![name])
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_users, add_user])
        .run(tauri::generate_context!())
        .expect("error while running tauri app")
}
