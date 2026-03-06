use std::collections::HashMap;
use rusqlite::named_params;

use crate::db::{open_db, normalize_img_path};
use crate::models::{CardDetail, CardSet, CardSetRarity, CardStub, RawDetailRow, RawStubRow};

#[tauri::command]
pub fn load_card_stubs(
    name: Option<String>,
    card_type: Option<String>,
    set: Option<String>,
) -> Result<Vec<CardStub>, String> {
    let conn = open_db()?;

    let sql = "
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
          AND (:card_type IS NULL OR c.type = :card_type)
          AND (:set IS NULL OR cs.set_name = :set)
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
                id:                row.get("id")?,
                name:              row.get("name")?,
                card_type:         row.get("type")?,
                has_alt_art:       row.get("has_alt_art")?,
                img_path:          row.get("local_path")?,
                image_id:          row.get("image_id")?,
                frame_type:        row.get("frameType").ok(),
                set_rarity:        row.get("set_rarity").ok(),
                collection_amount: row.get("collection_amount").ok(),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut map: HashMap<i64, CardStub> = HashMap::new();
    for r in rows {
        let r = r.map_err(|e| e.to_string())?;
        let collection_amount = r.collection_amount.unwrap_or(0);
        let stub = map.entry(r.id).or_insert_with(|| CardStub {
            id:                      r.id,
            name:                    r.name.clone(),
            card_type:               r.card_type.clone(),
            has_alt_art:             r.has_alt_art,
            img_path:                normalize_img_path(r.img_path.clone()),
            image_id:                r.image_id,
            frame_type:              r.frame_type.clone(),
            rarities:                Vec::new(),
            total_collection_amount: 0,
        });
        stub.rarities.push(r.set_rarity);
        stub.total_collection_amount += collection_amount;
    }

    Ok(map.into_values().collect())
}

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
