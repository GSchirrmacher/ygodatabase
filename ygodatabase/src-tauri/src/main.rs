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
use commands::deck::{
    get_ban_list,
    get_genesys_points,
    get_collection_amounts,
    sync_banlist_from_db,
    list_decks,
    save_deck,
    delete_deck,
    load_deck,
};

// TODO : Fix alt arts in database
// TODO : Fix slow loading times
// TODO : Add other formats
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
            sync_banlist_from_db,
            list_decks,
            save_deck,
            delete_deck,
            load_deck,
            exit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error running app");
}