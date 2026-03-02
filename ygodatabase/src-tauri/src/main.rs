use rusqlite::{Connection, Result};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use rusqlite::named_params;


// TODO : Fix alternate Rares in Sets showing up while there are none (needs to be fixed in database since it is nowhere stated there)
// TODO : Add collection view
// TODO : Add prices/pricing of collection
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Card {
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

#[derive(Debug)]
struct RawRow {
    id: i64,
    name: String,
    card_type: String,
    set_code: Option<String>,
    has_alt_art: i64,
    img_path: Option<String>,
    image_id: Option<i64>,
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
    set_price: Option<i64>
}

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


#[tauri::command]
fn load_cards_with_images(
    name: Option<String>,
    card_type: Option<String>,
    set: Option<String>,
) -> Result<Vec<Card>, String> {
    let db_path = get_db_path();
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

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
        LEFT JOIN card_sets cs ON c.id = cs.card_id
        WHERE (:name IS NULL OR c.name LIKE :name)
        AND (:card_type IS NULL OR c.type = :card_type)
        AND (:set IS NULL OR cs.set_name = :set)
    ";


    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;

    let params = named_params! {
        ":name": name.as_ref().map(|v| format!("%{}%", v)),
        ":card_type": card_type.as_ref(),
        ":set": set.as_ref(),
    };

    let rows = stmt
    .query_map(params, |row| {
        Ok(RawRow {
            id: row.get("id")?,
            name: row.get("name")?,
            card_type: row.get("type")?,
            set_code: row.get("set_code")?,
            has_alt_art: row.get("has_alt_art")?,
            img_path: row.get("local_path")?,
            image_id: row.get("image_id")?,
            set_name: row.get("set_name").ok(),
            set_rarity: row.get("set_rarity").ok(),
            frame_type: row.get("frameType").ok(),
            attribute: row.get("attribute").ok(),
            desc: row.get("desc").ok(),
            level: row.get("level").ok(),
            atk: row.get("atk").ok(),
            def: row.get("def").ok(),
            race: row.get("race").ok(),
            scale: row.get("scale").ok(),
            linkval: row.get("linkval").ok(),
            typeline: row
                .get::<_, Option<String>>("typeline")?
                .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok()),
            collection_amount: row.get("collection_amount").ok(),
            set_price: row.get("set_price").ok(),
        })
    })
    .map_err(|e| e.to_string())?;


    let mut raw_rows = Vec::new();
    for r in rows {
        raw_rows.push(r.map_err(|e| e.to_string())?);
    }

    let grouped_mode = set.is_none();

    let mut map: HashMap<i64, Card> = HashMap::new();

for r in raw_rows {

    let card = map.entry(r.id).or_insert_with(|| Card {
        id: r.id,
        name: r.name.clone(),
        card_type: r.card_type.clone(),
        has_alt_art: r.has_alt_art,
        img_path: normalize_img_path(r.img_path.clone()),
        image_id: r.image_id,

        frame_type: r.frame_type.clone(),
        attribute: r.attribute.clone(),
        desc: r.desc.clone(),

        level: r.level,
        atk: r.atk,
        def: r.def,
        race: r.race.clone(),
        scale: r.scale,
        linkval: r.linkval,
        typeline: r.typeline.clone(),

        sets: Vec::new(),
    });

    if let Some(set_code) = &r.set_code {

        let set_index = card
            .sets
            .iter()
            .position(|s| s.set_code.as_ref() == Some(set_code));

        let set_ref = if let Some(i) = set_index {
            &mut card.sets[i]
        } else {
            card.sets.push(CardSet {
                set_code: r.set_code.clone(),
                set_name: r.set_name.clone(),
                rarities: Vec::new(),
            });
            card.sets.last_mut().unwrap()
        };

        set_ref.rarities.push(CardSetRarity {
            rarity: r.set_rarity.clone(),
            collection_amount: r.collection_amount,
            set_price: r.set_price,
        });
    }
}

Ok(map.into_values().collect())
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
        .invoke_handler(tauri::generate_handler![
            load_cards_with_images,
            get_all_sets,
            update_collection_amount
        ])
        .run(tauri::generate_context!())
        .expect("error running app");
}
