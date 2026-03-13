use std::collections::HashMap;
use rusqlite::named_params;

use crate::db::{open_db, normalize_img_path};
use crate::models::{CardDetail, CardSet, CardSetRarity, CardStub, RawDetailRow, RawStubRow};

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------
#[tauri::command]
pub fn load_card_stubs(
    name: Option<String>,
    set: Option<String>,
    category: Option<String>,
    frame_type: Option<String>,
    attribute: Option<String>,
    race: Option<String>,
    level: Option<i64>,
    scale: Option<i64>,
    atk: Option<i64>,
    def: Option<i64>,
    ban_status: Option<String>,
) -> Result<Vec<CardStub>, String> {
    let conn = open_db()?;

    // Monster frame types — used when category="monster" but no specific frame_type chosen
    const MONSTER_FRAMES: &[&str] = &[
        "normal", "effect", "ritual", "fusion", "synchro", "xyz", "link",
        "normal_pendulum", "effect_pendulum", "ritual_pendulum",
        "fusion_pendulum", "synchro_pendulum", "xyz_pendulum",
    ];

    // Build the frameType clause dynamically:
    //   - specific frame_type selected  → exact match
    //   - category="monster", no frame_type → IN (all monster frames)
    //   - category="spell"/"trap"        → exact match on that value
    //   - nothing selected               → no clause
    let frame_clause = if let Some(ref ft) = frame_type {
        // specific subcategory chosen — exact match
        format!("AND c.frameType = '{}'", ft.replace('\'', "''"))
    } else if let Some(ref cat) = category {
        match cat.as_str() {
            "monster" => {
                let list = MONSTER_FRAMES
                    .iter()
                    .map(|f| format!("'{}'", f))
                    .collect::<Vec<_>>()
                    .join(", ");
                format!("AND c.frameType IN ({})", list)
            }
            "spell" => "AND c.frameType = 'spell'".to_string(),
            "trap"  => "AND c.frameType = 'trap'".to_string(),
            _       => String::new(),
        }
    } else {
        String::new()
    };

    let sql = format!("
        SELECT
            c.id,
            c.name,
            c.type,
            c.has_alt_art,
            ci.image_id,
            ci.local_path,
            c.frameType,
            cs.set_rarity,
            cs.collection_amount
        FROM cards c
        LEFT JOIN card_images ci ON c.id = ci.card_id
        LEFT JOIN card_sets cs ON c.id = cs.card_id
        WHERE (:name IS NULL OR c.name LIKE :name)
          AND (:set IS NULL OR cs.set_name  = :set)
          {frame_clause}
          AND (:attribute IS NULL OR c.attribute  = :attribute)
          AND (:race IS NULL OR c.race = :race)
          AND (:level IS NULL OR c.level = :level)
          AND (:scale IS NULL OR c.scale = :scale)
          AND (:atk IS NULL OR c.atk = :atk)
          AND (:def IS NULL OR c.def = :def)
          AND (:ban_status IS NULL OR (
                LOWER(json_extract(c.banlist_info, '$.ban_tcg')) = LOWER(:ban_status)
              ))
    ");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let params = named_params! {
        ":name": name.as_ref().map(|v| format!("%{}%", v)),
        ":set": set.as_ref(),
        ":attribute": attribute.as_ref(),
        ":race": race.as_ref(),
        ":level": level,
        ":scale": scale,
        ":atk": atk,
        ":def": def,
        ":ban_status": ban_status.as_ref(),
    };

    let rows = stmt
        .query_map(params, |row| {
            Ok(RawStubRow {
                id: row.get("id")?,
                name: row.get("name")?,
                card_type: row.get("type")?,
                has_alt_art: row.get("has_alt_art")?,
                img_path: row.get("local_path")?,
                image_id: row.get("image_id")?,
                frame_type: row.get("frameType").ok(),
                set_rarity: row.get("set_rarity").ok(),
                collection_amount: row.get("collection_amount").ok(),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut map: HashMap<i64, CardStub> = HashMap::new();
    for r in rows {
        let r = r.map_err(|e| e.to_string())?;
        let collection_amount = r.collection_amount.unwrap_or(0);
        let stub = map.entry(r.id).or_insert_with(|| CardStub {
            id: r.id,
            name: r.name.clone(),
            card_type: r.card_type.clone(),
            has_alt_art: r.has_alt_art,
            img_path: normalize_img_path(r.img_path.clone()),
            image_id: r.image_id,
            frame_type: r.frame_type.clone(),
            rarities: Vec::new(),
            total_collection_amount: 0,
        });
        stub.rarities.push(r.set_rarity);
        stub.total_collection_amount += collection_amount;
    }

    Ok(map.into_values().collect())
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------
#[tauri::command]
pub fn load_card_detail(card_id: i64, set_name: Option<String>) -> Result<CardDetail, String> {
    let conn = open_db()?;

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
          AND (:set_name IS NULL OR cs.set_name = :set_name)
    ";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(named_params! { ":card_id": card_id, ":set_name": set_name }, |row| {
            Ok(RawDetailRow {
                id: row.get("id")?,
                name: row.get("name")?,
                card_type: row.get("type")?,
                has_alt_art: row.get("has_alt_art")?,
                img_path: row.get("local_path")?,
                image_id: row.get("image_id")?,
                set_code: row.get("set_code")?,
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

    let mut detail: Option<CardDetail> = None;

    for r in rows {
        let r = r.map_err(|e| e.to_string())?;

        let d = detail.get_or_insert_with(|| CardDetail {
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
                rarity: r.set_rarity.clone(),
                collection_amount: r.collection_amount,
                set_price: r.set_price,
            });
        }
    }

    detail.ok_or_else(|| format!("No card found with id {}", card_id))
}

// ---------------------------------------------------------------------------
// Sets
// ---------------------------------------------------------------------------
#[tauri::command]
pub fn get_all_sets() -> Result<Vec<String>, String> {
    let conn = open_db()?;
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT set_name
             FROM card_sets
             WHERE set_name IS NOT NULL
             ORDER BY set_name",
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

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------
#[tauri::command]
pub fn update_collection_amount(
    card_id: i64,
    set_code: String,
    rarity: String,
    amount: i64,
) -> Result<(), String> {
    let conn = open_db()?;
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