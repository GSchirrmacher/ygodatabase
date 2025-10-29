// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri_plugin_log::{LogTarget, Builder};

fn main() {
    tauri::Builder::default()
        .plugin(
            Builder::default()
                .targets([LogTarget::LogDir, LogTarget::Stdout])
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}