use rusqlite::{Connection, Result};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use rusqlite::named_params;


// TODO : Fix alternate Rares in Sets showing up while there are none (needs to be fixed in database since it is nowhere stated there)
// TODO : Add collection view
// TODO : Add prices/pricing of collection

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CardSetRarity {
    rarity: Option<String>,
    collection_amount: Option<i64>,
    set_price: Option<i64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CardSet {
    set_code: Option<String>,
    set_name: Option<String>,
    rarities: Vec<CardSetRarity>,
}

// ---------------------------------------------------------------------------
// CardStub — lightweight struct for the grid view.
// Only carries what is needed to render a card tile and its rarity border/icon.
// ---------------------------------------------------------------------------
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CardStub {
    id: i64,
    name: String,
    card_type: String,
    has_alt_art: i64,
    img_path: Option<String>,
    image_id: Option<i64>,
    frame_type: Option<String>,
    // All rarities across all sets — needed for the border colour and overlay icons
    // on the grid tile. We keep just rarity strings, not full set detail.
    rarities: Vec<Option<String>>,
}

// ---------------------------------------------------------------------------
// CardDetail — full struct returned only when a card is selected.
// ---------------------------------------------------------------------------
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CardDetail {
    id: i64,
    name: String,
    card_type: String,
    has_alt_art: i64,
    img_path: Option<String>,
    image_id: Option<i64>,

    frame_type: Option<String>,
    attribute: Option<String>,
    desc: Option<String>,

    level: Option<i64>,
    atk: Option<i64>,
    def: Option<i64>,
    race: Option<String>,
    scale: Option<i64>,
    linkval: Option<i64>,
    typeline: Option<Vec<String>>,

    sets: Vec<CardSet>,
}

// ---------------------------------------------------------------------------
// Raw row helpers
// ---------------------------------------------------------------------------
#[derive(Debug)]
struct RawStubRow {
    id: i64,
    name: String,
    card_type: String,
    has_alt_art: i64,
    img_path: Option<String>,
    image_id: Option<i64>,
    frame_type: Option<String>,
    set_rarity: Option<String>,
}

#[derive(Debug)]
struct RawDetailRow {
    id: i64,
    name: String,
    card_type: String,
    has_alt_art: i64,
    img_path: Option<String>,
    image_id: Option<i64>,
    set_code: Option<String>,
    set_name: Option<String>,
    set_rarity: Option<String>,
    frame_type: Option<String>,
    attribute: Option<String>,
    desc: Option<String>,
    level: Option<i64>,
    atk: Option<i64>,
    def: Option<i64>,
    race: Option<String>,
    scale: Option<i64>,
    linkval: Option<i64>,
    typeline: Option<Vec<String>>,
    collection_amount: Option<i64>,
    set_price: Option<i64>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
fn get_project_root() -> PathBuf {
    let mut exe = std::env::current_exe().expect("Failed to get exe path");

    exe.pop(); // ygodatabase.exe
    exe.pop(); // debug
    exe.pop(); // target

    exe
}


fn get_db_path() -> PathBuf {
    let mut root = get_project_root();
    root.push("ressources");
    root.push("cards.db");
    root
}

fn create_indexes(conn: &Connection) -> Result<()> {
    conn.execute_batch("
        -- Speeds up name LIKE searches (partial benefit; SQLite can use this for prefix matches)
        CREATE INDEX IF NOT EXISTS idx_cards_name
            ON cards(name);

        -- Speeds up filtering by card type
        CREATE INDEX IF NOT EXISTS idx_cards_type
            ON cards(type);

        -- Speeds up the JOIN from cards -> card_sets
        CREATE INDEX IF NOT EXISTS idx_card_sets_card_id
            ON card_sets(card_id);

        -- Speeds up set_name filter and the get_all_sets DISTINCT query
        CREATE INDEX IF NOT EXISTS idx_card_sets_set_name
            ON card_sets(set_name);

        -- Speeds up the UPDATE lookup in update_collection_amount
        CREATE INDEX IF NOT EXISTS idx_card_sets_code_rarity
            ON card_sets(card_id, set_code, set_rarity);

        -- Speeds up the JOIN from cards -> card_images
        CREATE INDEX IF NOT EXISTS idx_card_images_card_id
            ON card_images(card_id);
    ")
}

/// Normalizes a path and converts it to a Tauri asset:// URL
fn normalize_img_path(path: Option<String>) -> Option<String> {
    path.map(|p| {
        // Replace backslashes with forward slashes
        let fixed = p.replace("\\", "/");

        // Extract only "img/filename.jpg" if present
        let img_path = if let Some(idx) = fixed.find("img/") {
            fixed[idx..].to_string()
        } else {
            fixed
        };

        // Prepend "asset://" so Tauri can serve it correctly
        format!("asset://{}", img_path)
    })
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Returns lightweight stubs for every card matching the filters.
/// Only fetches the columns needed to render the grid — no stats, no set detail.
#[tauri::command]
fn load_card_stubs(
    name: Option<String>,
    card_type: Option<String>,
    set: Option<String>,
) -> Result<Vec<CardStub>, String> {
    let conn = Connection::open(get_db_path()).map_err(|e| e.to_string())?;

    // One row per (card, rarity) combination — we collapse later in Rust to collect
    // all rarity strings onto a single stub. The query is intentionally narrow:
    // no desc, no stats, no attribute, no typeline.
    let sql = "
        SELECT
            c.id,
            c.name,
            c.type,
            c.has_alt_art,
            ci.image_id,
            ci.local_path,
            c.frameType,
            cs.set_rarity
        FROM cards c
        LEFT JOIN card_images ci ON c.id = ci.card_id
        LEFT JOIN card_sets cs   ON c.id = cs.card_id
        WHERE (:name      IS NULL OR c.name      LIKE :name)
          AND (:card_type IS NULL OR c.type       = :card_type)
          AND (:set       IS NULL OR cs.set_name  = :set)
    ";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;

    let params = named_params! {
        ":name":      name.as_ref().map(|v| format!("%{}%", v)),
        ":card_type": card_type.as_ref(),
        ":set":       set.as_ref(),
    };

    let rows = stmt
        .query_map(params, |row| {
            Ok(RawStubRow {
                id:          row.get("id")?,
                name:        row.get("name")?,
                card_type:   row.get("type")?,
                has_alt_art: row.get("has_alt_art")?,
                img_path:    row.get("local_path")?,
                image_id:    row.get("image_id")?,
                frame_type:  row.get("frameType").ok(),
                set_rarity:  row.get("set_rarity").ok(),
            })
        })
        .map_err(|e| e.to_string())?;

    // Collapse duplicate card rows (one per rarity) into a single stub
    let mut map: HashMap<i64, CardStub> = HashMap::new();
    for r in rows {
        let r = r.map_err(|e| e.to_string())?;
        let stub = map.entry(r.id).or_insert_with(|| CardStub {
            id:          r.id,
            name:        r.name.clone(),
            card_type:   r.card_type.clone(),
            has_alt_art: r.has_alt_art,
            img_path:    normalize_img_path(r.img_path.clone()),
            image_id:    r.image_id,
            frame_type:  r.frame_type.clone(),
            rarities:    Vec::new(),
        });
        stub.rarities.push(r.set_rarity);
    }

    Ok(map.into_values().collect())
}

/// Returns the full detail for a single card by ID, including all stats and sets.
/// Called only when the user clicks a card in the grid.
#[tauri::command]
fn load_card_detail(card_id: i64) -> Result<CardDetail, String> {
    let conn = Connection::open(get_db_path()).map_err(|e| e.to_string())?;

    let sql = "
        SELECT
            c.id,
            c.name,
            c.type,
            c.has_alt_art,
            ci.image_id,
            ci.local_path,
            cs.set_code,
            cs.set_name,
            cs.set_rarity,
            c.frameType,
            c.attribute,
            c.desc,
            c.level,
            c.atk,
            c.def,
            c.race,
            c.scale,
            c.linkval,
            c.typeline,
            cs.collection_amount,
            cs.set_price
        FROM cards c
        LEFT JOIN card_images ci ON c.id = ci.card_id
        LEFT JOIN card_sets cs   ON c.id = cs.card_id
        WHERE c.id = :card_id
    ";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(named_params! { ":card_id": card_id }, |row| {
            Ok(RawDetailRow {
                id:                row.get("id")?,
                name:              row.get("name")?,
                card_type:         row.get("type")?,
                has_alt_art:       row.get("has_alt_art")?,
                img_path:          row.get("local_path")?,
                image_id:          row.get("image_id")?,
                set_code:          row.get("set_code")?,
                set_name:          row.get("set_name").ok(),
                set_rarity:        row.get("set_rarity").ok(),
                frame_type:        row.get("frameType").ok(),
                attribute:         row.get("attribute").ok(),
                desc:              row.get("desc").ok(),
                level:             row.get("level").ok(),
                atk:               row.get("atk").ok(),
                def:               row.get("def").ok(),
                race:              row.get("race").ok(),
                scale:             row.get("scale").ok(),
                linkval:           row.get("linkval").ok(),
                typeline:          row
                    .get::<_, Option<String>>("typeline")?
                    .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok()),
                collection_amount: row.get("collection_amount").ok(),
                set_price:         row.get("set_price").ok(),
            })
        })
        .map_err(|e| e.to_string())?;

    // Build the detail, collapsing one row per (set_code, rarity) into sets
    let mut detail: Option<CardDetail> = None;

    for r in rows {
        let r = r.map_err(|e| e.to_string())?;

        let d = detail.get_or_insert_with(|| CardDetail {
            id:          r.id,
            name:        r.name.clone(),
            card_type:   r.card_type.clone(),
            has_alt_art: r.has_alt_art,
            img_path:    normalize_img_path(r.img_path.clone()),
            image_id:    r.image_id,
            frame_type:  r.frame_type.clone(),
            attribute:   r.attribute.clone(),
            desc:        r.desc.clone(),
            level:       r.level,
            atk:         r.atk,
            def:         r.def,
            race:        r.race.clone(),
            scale:       r.scale,
            linkval:     r.linkval,
            typeline:    r.typeline.clone(),
            sets:        Vec::new(),
        });

        if let Some(set_code) = &r.set_code {
            let set_index = d.sets.iter().position(|s| s.set_code.as_ref() == Some(set_code));

            let set_ref = if let Some(i) = set_index {
                &mut d.sets[i]
            } else {
                d.sets.push(CardSet {
                    set_code: r.set_code.clone(),
                    set_name: r.set_name.clone(),
                    rarities: Vec::new(),
                });
                d.sets.last_mut().unwrap()
            };

            set_ref.rarities.push(CardSetRarity {
                rarity:            r.set_rarity.clone(),
                collection_amount: r.collection_amount,
                set_price:         r.set_price,
            });
        }
    }

    detail.ok_or_else(|| format!("No card found with id {}", card_id))
}



#[tauri::command]
fn get_all_sets() -> Result<Vec<String>, String> {
    let db_path = get_db_path();
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT set_name
             FROM card_sets
             WHERE set_name IS NOT NULL
             ORDER BY set_name"
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

    let mut sets = Vec::new();
    for s in rows {
        sets.push(s.map_err(|e| e.to_string())?);
    }

    Ok(sets)
}

#[tauri::command]
fn update_collection_amount(
    card_id: i64,
    set_code: String,
    rarity: String,
    amount: i64,
) -> Result<(), String> {

    let conn = Connection::open(get_db_path()).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE card_sets
         SET collection_amount = ?1
         WHERE card_id = ?2
         AND set_code = ?3
         AND set_rarity = ?4",
        (amount, card_id, set_code, rarity),
    ).map_err(|e| e.to_string())?;

    Ok(())
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
            update_collection_amount
        ])
        .run(tauri::generate_context!())
        .expect("error running app");
}
