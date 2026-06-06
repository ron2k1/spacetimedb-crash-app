use std::fs;
use std::io::Write;
use std::path::PathBuf;

/// Writes a connector key into ~/Crash/.secrets/connectors.json (0o600 on unix).
/// The key arrives over Tauri IPC, NEVER over the WebSocket. Nothing here is logged.
#[tauri::command]
pub fn set_connector_key(connector_id: String, key: String) -> Result<(), String> {
    if connector_id.is_empty() || key.is_empty() {
        return Err("invalid_input".into()); // synthetic code, never the value
    }
    let home = dirs::home_dir().ok_or_else(|| "no_home".to_string())?;
    let dir: PathBuf = home.join("Crash").join(".secrets");
    fs::create_dir_all(&dir).map_err(|e| e.kind().to_string())?;
    let file = dir.join("connectors.json");

    let mut map: serde_json::Map<String, serde_json::Value> = if file.exists() {
        serde_json::from_str(&fs::read_to_string(&file).map_err(|e| e.kind().to_string())?)
            .unwrap_or_default()
    } else {
        serde_json::Map::new()
    };
    map.insert(connector_id, serde_json::Value::String(key));

    let body = serde_json::to_string(&map).map_err(|_| "serialize_failed".to_string())?;
    let mut opts = fs::OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let mut f = opts.open(&file).map_err(|e| e.kind().to_string())?;
    f.write_all(body.as_bytes()).map_err(|e| e.kind().to_string())?;
    Ok(())
}
