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
    add_set_entry,
    remove_set_entry,
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
            // Migrate card_sets: update unique key to include artwork so the same
            // rarity can exist in multiple artworks of the same set.
            // Detects old schema by checking whether the unique constraint already
            // includes artwork — if not, recreates the table with the correct key.
            let table_sql: String = conn
                .query_row(
                    "SELECT sql FROM sqlite_master WHERE type='table' AND name='card_sets'",
                    [],
                    |row| row.get(0),
                )
                .unwrap_or_default();
            // Old schema: UNIQUE(card_id, set_code, set_rarity) — no artwork in key
            // New schema: UNIQUE(card_id, set_code, set_rarity, artwork)
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
            add_set_entry,
            remove_set_entry,
            exit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error running app");
}