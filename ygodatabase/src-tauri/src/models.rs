use serde::Serialize;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CardSetRarity {
    pub rarity: Option<String>,
    pub collection_amount: Option<i64>,
    pub set_price: Option<f64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CardSet {
    pub set_code: Option<String>,
    pub set_name: Option<String>,
    pub rarities: Vec<CardSetRarity>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardStub {
    pub id: i64,
    pub name: String,
    pub card_type: String,
    pub has_alt_art: i64,
    pub img_path: Option<String>,
    pub image_id: Option<i64>,
    pub frame_type: Option<String>,
    pub rarities: Vec<Option<String>>,
    pub total_collection_amount: i64,
    pub level: Option<i64>,       // for deck-builder type-sort within monster group
    pub set_code: Option<String>, // first set_code seen; used for set-sort display
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardDetail {
    pub id: i64,
    pub name: String,
    pub card_type: String,
    pub has_alt_art: i64,
    pub img_path: Option<String>,
    pub image_id: Option<i64>,

    pub frame_type: Option<String>,
    pub attribute: Option<String>,
    pub desc: Option<String>,

    pub level: Option<i64>,
    pub atk: Option<i64>,
    pub def: Option<i64>,
    pub race: Option<String>,
    pub scale: Option<i64>,
    pub linkval: Option<i64>,
    pub typeline: Option<Vec<String>>,

    pub sets: Vec<CardSet>,
}

// Raw query row helpers — not serialized, used only internally

#[derive(Debug)]
pub struct RawStubRow {
    pub id: i64,
    pub name: String,
    pub card_type: String,
    pub has_alt_art: i64,
    pub img_path: Option<String>,
    pub image_id: Option<i64>,
    pub frame_type: Option<String>,
    pub set_rarity: Option<String>,
    pub collection_amount: Option<i64>,
    pub level: Option<i64>,
    pub set_code: Option<String>,
}

#[derive(Debug)]
pub struct RawDetailRow {
    pub id: i64,
    pub name: String,
    pub card_type: String,
    pub has_alt_art: i64,
    pub img_path: Option<String>,
    pub image_id: Option<i64>,
    pub set_code: Option<String>,
    pub set_name: Option<String>,
    pub set_rarity: Option<String>,
    pub frame_type: Option<String>,
    pub attribute: Option<String>,
    pub desc: Option<String>,
    pub level: Option<i64>,
    pub atk: Option<i64>,
    pub def: Option<i64>,
    pub race: Option<String>,
    pub scale: Option<i64>,
    pub linkval: Option<i64>,
    pub typeline: Option<Vec<String>>,
    pub collection_amount: Option<i64>,
    pub set_price: Option<f64>,
}