// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
/*#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}*/

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri_plugin_log::{Builder, Target, TargetKind};

fn main() {
    tauri::Builder::default()
        .plugin(
            Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                ])
                .build()
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}