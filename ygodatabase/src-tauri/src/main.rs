mod db;
mod models;
mod commands;

use db::{create_indexes, get_db_path};
use rusqlite::Connection;
use commands::collection::{
    get_all_sets,
    load_card_detail,
    load_card_stubs,
    update_collection_amount,
};
use commands::deck::get_ban_list;

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

fn main() {
    tauri::Builder::default()
        .setup(|_app| {
            let conn = Connection::open(get_db_path())
                .expect("Failed to open DB during setup");
            create_indexes(&conn)
                .expect("Failed to create database indexes");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_card_stubs,
            load_card_detail,
            get_all_sets,
            update_collection_amount,
            get_ban_list,
            exit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error running app");
}
