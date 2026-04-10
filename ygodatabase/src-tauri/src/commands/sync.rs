use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

use crate::db::get_db_path;

/// Finds the project root from the exe path.
/// In dev: exe is at target/debug/app.exe → pop 3 times → project root
/// Scripts live at <project_root>/src-tauri/scripts/
fn find_script(name: &str) -> Option<std::path::PathBuf> {
    let db = get_db_path(); // <root>/ressources/cards.db
    let ressources = db.parent()?;   // <root>/ressources
    let root = ressources.parent()?; // <root>

    // Try src-tauri/scripts/ first (dev layout)
    let dev = root.join("src-tauri").join("scripts").join(name);
    if dev.exists() { return Some(dev); }

    // Try scripts/ at root (alternative layout)
    let alt = root.join("scripts").join(name);
    if alt.exists() { return Some(alt); }

    // Try same directory as the DB
    let sibling = ressources.join("scripts").join(name);
    if sibling.exists() { return Some(sibling); }

    None
}

/// Find a working Python executable on this system.
/// Windows often only has "py" (the launcher) or "python", not "python3".
fn find_python() -> Option<String> {
    let candidates: &[&str] = if cfg!(windows) {
        &["py", "python", "python3"]
    } else {
        &["python3", "python"]
    };
    for &cmd in candidates {
        let ok = Command::new(cmd)
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if ok {
            return Some(cmd.to_string());
        }
    }
    None
}

/// Runs ygoprodeckscraper.py in a background thread, streaming each stdout/stderr
/// line as a "sync-progress" event. Emits "sync-done" ("ok" | "error") when finished.
///
/// The command returns immediately — the actual work happens asynchronously.
/// The frontend should listen to "sync-progress" and "sync-done".
#[tauri::command]
pub fn run_sync(app: AppHandle) -> Result<(), String> {
    let script = find_script("ygoprodeckscraper.py")
        .ok_or_else(|| {
            "ygoprodeckscraper.py not found. Expected at src-tauri/scripts/ygoprodeckscraper.py".to_string()
        })?;

    let python = find_python()
        .ok_or_else(|| {
            "Python not found. Install Python 3 and make sure it is on your PATH.".to_string()
        })?;

    let _ = app.emit("sync-progress", format!("Starting sync with {} {}", python, script.display()));

    let mut child = Command::new(&python)
        .arg(&script)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn Python: {}", e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    // Stream stdout in a background thread
    let app_out = app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().flatten() {
            let _ = app_out.emit("sync-progress", &line);
        }
    });

    // Stream stderr in another background thread
    let app_err = app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().flatten() {
            // Only emit non-empty stderr lines, prefix so frontend can colour them
            if !line.trim().is_empty() {
                let _ = app_err.emit("sync-progress", format!("[warn] {}", line));
            }
        }
    });

    // Wait for the process in a third thread so we don't block the Tauri command handler
    std::thread::spawn(move || {
        match child.wait() {
            Ok(status) if status.success() => {
                let _ = app.emit("sync-done", "ok");
            }
            Ok(status) => {
                let _ = app.emit("sync-progress", format!("Process exited with status {}", status));
                let _ = app.emit("sync-done", "error");
            }
            Err(e) => {
                let _ = app.emit("sync-progress", format!("Wait error: {}", e));
                let _ = app.emit("sync-done", "error");
            }
        }
    });

    Ok(()) // Return immediately — sync runs in background threads
}