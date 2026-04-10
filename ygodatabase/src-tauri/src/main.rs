mod db;
mod models;
mod commands;

use db::{create_indexes, get_db_path};
use rusqlite::Connection;

use commands::altart::{
    ensure_artwork_column,
    get_alt_art_cards,
    set_set_artwork,
    add_set_entry,
    remove_set_entry,
};
use commands::collection::{
    get_all_sets,
    get_all_archetypes,
    load_card_detail,
    load_card_stubs,
    update_collection_amount,
};
use commands::deck::{
    get_ban_list,
    get_collection_amounts,
    get_collection_value,
    get_genesys_points,
    sync_banlist_from_db,
    list_decks,
    save_deck,
    delete_deck,
    load_deck,
};
use commands::sync::run_sync;

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
            // Migrate card_sets: add artwork column and fix UNIQUE key to include
            // artwork so the same rarity can appear in multiple artworks of a set.
            let table_sql: String = conn
                .query_row(
                    "SELECT sql FROM sqlite_master WHERE type='table' AND name='card_sets'",
                    [],
                    |row| row.get(0),
                )
                .unwrap_or_default();
            let needs_migration = !table_sql.contains("set_rarity, artwork")
                && !table_sql.contains("set_rarity,artwork");
            if needs_migration {
                conn.execute_batch("
                    BEGIN;
                    CREATE TABLE IF NOT EXISTS card_sets_new (
                        card_id           INTEGER,
                        set_code          TEXT,
                        set_name          TEXT,
                        set_rarity        TEXT,
                        set_price         TEXT,
                        collection_amount INTEGER DEFAULT 0,
                        artwork           INTEGER DEFAULT 0,
                        UNIQUE(card_id, set_code, set_rarity, artwork)
                    );
                    INSERT OR IGNORE INTO card_sets_new
                        (card_id, set_code, set_name, set_rarity, set_price, collection_amount, artwork)
                    SELECT card_id, set_code, set_name, set_rarity, set_price,
                           COALESCE(collection_amount, 0), COALESCE(artwork, 0)
                    FROM card_sets;
                    DROP TABLE card_sets;
                    ALTER TABLE card_sets_new RENAME TO card_sets;
                    COMMIT;
                ").expect("Failed to migrate card_sets schema");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Collection
            load_card_stubs,
            load_card_detail,
            get_all_sets,
            get_all_archetypes,
            update_collection_amount,
            get_collection_value,
            // Deck / ban list
            get_ban_list,
            get_collection_amounts,
            get_genesys_points,
            sync_banlist_from_db,
            list_decks,
            save_deck,
            delete_deck,
            load_deck,
            // Alt art editor
            ensure_artwork_column,
            get_alt_art_cards,
            set_set_artwork,
            add_set_entry,
            remove_set_entry,
            // Sync
            run_sync,
            // App
            exit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error running app");
}