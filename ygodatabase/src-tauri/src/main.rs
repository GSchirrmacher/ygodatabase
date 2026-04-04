mod db;
mod models;
mod commands;

use db::{create_indexes, get_db_path};
use rusqlite::Connection;
use commands::collection::{
    get_all_sets,
    get_all_archetypes,
    load_card_detail,
    load_card_stubs,
    update_collection_amount,
};
use commands::altart::{
    ensure_artwork_column,
    get_alt_art_cards,
    set_set_artwork,
};
use commands::deck::{
    get_ban_list,
    get_genesys_points,
    get_collection_amounts,
    get_collection_value,
    sync_banlist_from_db,
    list_decks,
    save_deck,
    delete_deck,
    load_deck,
};

// TODO : Fix alt arts in database
// TODO : Fix slow loading times
// TODO : UI stuff

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
            // Add artwork column — nullable with default 0, compatible with SQLite < 3.37
            // Silently ignored if column already exists.
            let _ = conn.execute_batch(
                "ALTER TABLE card_sets ADD COLUMN artwork INTEGER DEFAULT 0;"
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_card_stubs,
            load_card_detail,
            get_all_sets,
            get_all_archetypes,
            get_genesys_points,
            update_collection_amount,
            get_ban_list,
            get_collection_amounts,
            get_collection_value,
            sync_banlist_from_db,
            list_decks,
            save_deck,
            delete_deck,
            load_deck,
            ensure_artwork_column,
            get_alt_art_cards,
            set_set_artwork,
            exit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error running app");
}