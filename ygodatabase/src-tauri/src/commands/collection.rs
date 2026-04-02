use std::collections::HashMap;
use rusqlite::named_params;

use crate::db::{open_db, normalize_img_path, normalize_thumb_path};
use crate::models::{CardDetail, CardSet, CardSetRarity, CardStub, RawDetailRow, RawStubRow};

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------
#[tauri::command]
pub fn load_card_stubs(
    name: Option<String>,
    set: Option<String>,
    category: Option<String>,   // "monster" | "spell" | "trap"
    frame_type: Option<String>,   // exact DB frameType (subcategory); overrides category
    attribute: Option<String>,
    race: Option<String>,
    level: Option<i64>,
    scale: Option<i64>,
    atk: Option<i64>,
    def: Option<i64>,
    ban_status: Option<String>,
    archetype: Option<String>,
    genesys_points_min: Option<i64>,   // inclusive lower bound (genesys format)
    genesys_points_max: Option<i64>,   // inclusive upper bound (genesys format)
    sort: Option<String>,
) -> Result<Vec<CardStub>, String> {
    let conn = open_db()?;

    // Monster frame types for category="monster" IN-clause
    const MONSTER_FRAMES: &[&str] = &[
        "normal", "effect", "ritual", "fusion", "synchro", "xyz", "link",
        "normal_pendulum", "effect_pendulum", "ritual_pendulum",
        "fusion_pendulum", "synchro_pendulum", "xyz_pendulum",
    ];

    let frame_clause = if let Some(ref ft) = frame_type {
        format!("AND c.frameType = '{}'", ft.replace('\'', "''"))
    } else if let Some(ref cat) = category {
        match cat.as_str() {
            "monster" => {
                let list = MONSTER_FRAMES.iter()
                    .map(|f| format!("'{}'", f))
                    .collect::<Vec<_>>().join(", ");
                format!("AND c.frameType IN ({})", list)
            }
            "spell" => "AND c.frameType = 'spell'".to_string(),
            "trap"  => "AND c.frameType = 'trap'".to_string(),
            _       => String::new(),
        }
    } else {
        String::new()
    };

    // ── ORDER BY ─────────────────────────────────────────────────────────────
    // "set"  → sort by set_code ascending (groups cards within a set by their
    //           collector number, which is embedded in the code e.g. DUNE-EN056)
    // "type" → monster / spell / trap bucket first, then frameType order within
    //          monsters (normal < effect < ritual < fusion < fusion_pendulum <
    //          synchro < synchro_pendulum < xyz < xyz_pendulum < link),
    //          then level/rank/rating DESC, then name ASC.
    //          Spells and traps sort only by name ASC.
    let order_clause = match sort.as_deref().unwrap_or("type") {
        "set" => "ORDER BY cs.set_code ASC, c.name ASC".to_string(),
        _ => "ORDER BY
            CASE c.frameType
                WHEN 'normal' THEN 100
                WHEN 'effect' THEN 110
                WHEN 'normal_pendulum' THEN 120
                WHEN 'effect_pendulum' THEN 130
                WHEN 'ritual' THEN 140
                WHEN 'ritual_pendulum' THEN 150
                WHEN 'fusion' THEN 160
                WHEN 'fusion_pendulum' THEN 170
                WHEN 'synchro' THEN 180
                WHEN 'synchro_pendulum' THEN 190
                WHEN 'xyz' THEN 200
                WHEN 'xyz_pendulum' THEN 210
                WHEN 'link' THEN 220
                WHEN 'spell' THEN 300
                WHEN 'trap' THEN 400
                ELSE 500
            END ASC,
            COALESCE(c.level, c.linkval, 0) DESC,
            c.name ASC".to_string(),
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
            cs.collection_amount,
            c.level,
            cs.set_code,
            COALESCE(c.genesys_points, 0) as genesys_points
        FROM cards c
        LEFT JOIN card_images ci ON c.id = ci.card_id
        LEFT JOIN card_sets cs ON c.id = cs.card_id
        WHERE (:name IS NULL OR c.name LIKE :name)
          AND (:set IS NULL OR cs.set_name = :set)
          {frame_clause}
          AND (:attribute  IS NULL OR c.attribute = :attribute)
          AND (:race IS NULL OR c.race = :race)
          AND (:level IS NULL OR c.level = :level)
          AND (:scale IS NULL OR c.scale = :scale)
          AND (:atk IS NULL OR c.atk = :atk)
          AND (:def IS NULL OR c.def = :def)
          AND (:ban_status IS NULL OR (
                LOWER(json_extract(c.banlist_info, '$.ban_tcg')) = LOWER(:ban_status)
              ))
          AND (:archetype IS NULL OR (
                c.archetype IS NOT NULL AND
                EXISTS (
                    SELECT 1 FROM json_each(c.archetype)
                    WHERE LOWER(value) = LOWER(:archetype)
                )
              ))
          AND (:genesys_points_min IS NULL OR COALESCE(c.genesys_points, 0) >= :genesys_points_min)
          AND (:genesys_points_max IS NULL OR COALESCE(c.genesys_points, 0) <= :genesys_points_max)
        {order_clause}
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
        ":archetype": archetype.as_ref(),
        ":genesys_points_min": genesys_points_min,
        ":genesys_points_max": genesys_points_max,
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
                level: row.get("level").ok(),
                set_code: row.get("set_code").ok(),
                genesys_points: row.get("genesys_points").unwrap_or(0),
            })
        })
        .map_err(|e| e.to_string())?;

    // Collapse duplicate rows (one per set×rarity) into a single stub per card.
    // The ORDER BY is applied before this collapse, so the first row seen for
    // each card already has the correct sort position — we preserve insertion
    // order by using an IndexMap-style approach with a Vec for ordering.
    let mut order: Vec<i64> = Vec::new();
    let mut map: HashMap<i64, CardStub> = HashMap::new();
    for r in rows {
        let r = r.map_err(|e| e.to_string())?;
        let collection_amount = r.collection_amount.unwrap_or(0);
        if !map.contains_key(&r.id) {
            order.push(r.id);
            let thumb = normalize_thumb_path(r.img_path.as_ref());
            map.insert(r.id, CardStub {
                id: r.id,
                name: r.name.clone(),
                card_type: r.card_type.clone(),
                has_alt_art: r.has_alt_art,
                img_path: normalize_img_path(r.img_path.clone()),
                img_thumb_path: thumb,
                image_id: r.image_id,
                frame_type: r.frame_type.clone(),
                rarities: Vec::new(),
                total_collection_amount: 0,
                level: r.level,
                set_code: r.set_code.clone(),
                genesys_points: r.genesys_points,
            });
        }
        let stub = map.get_mut(&r.id).unwrap();
        stub.rarities.push(r.set_rarity);
        stub.total_collection_amount += collection_amount;
    }

    // Return in sorted order (order vec preserves first-seen position per card)
    Ok(order.into_iter().filter_map(|id| map.remove(&id)).collect())
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
        LEFT JOIN card_sets cs ON c.id = cs.card_id
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
                set_price: row.get::<_, Option<String>>("set_price").ok().flatten()
                    .and_then(|s| s.parse::<f64>().ok())
                    .filter(|&v| v > 0.0),
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
// Archetypes
// ---------------------------------------------------------------------------

/// Returns all distinct archetype names across all cards, sorted alphabetically.
/// The archetype column stores a JSON array, so we use json_each to expand it.
#[tauri::command]
pub fn get_all_archetypes() -> Result<Vec<String>, String> {
    let conn = open_db()?;
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT je.value
             FROM cards c, json_each(c.archetype) je
             WHERE c.archetype IS NOT NULL
               AND c.archetype != 'null'
               AND je.value IS NOT NULL
               AND je.value != ''
             ORDER BY je.value COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

    let mut archetypes = Vec::new();
    for r in rows {
        archetypes.push(r.map_err(|e| e.to_string())?);
    }
    Ok(archetypes)
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