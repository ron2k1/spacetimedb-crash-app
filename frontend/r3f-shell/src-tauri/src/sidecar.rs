// Spawns the headless Crash engine as a Tauri sidecar and resolves its boot descriptor.
//
// In `tauri dev` the Vite `crash-boot-inject` plugin reads <workspace>/.runtime/socket.json
// and injects window.__CRASH_BOOT__ for us. A PACKAGED build has no Vite serve step, so the
// Rust shell must own that step: spawn binaries/crash-engine, wait for the engine to write
// socket.json (it does so itself, mode 0600), then forward ONLY the five connection fields to
// the webview as an initialization script that runs BEFORE the renderer's boot resolver
// (src/net/boot.ts) executes -- the renderer reads window.__CRASH_BOOT__ exactly once at module
// load with no retry, so the global must already be present when its bundle runs.
//
// SECURITY: the engine prints its per-session token on stdout (the `engine.ready` line) and
// writes it into socket.json. We NEVER log stdout/stderr and NEVER print the descriptor; the
// token reaches only the app's own webview, exactly as the dev-mode Vite plugin delivers it.

#[cfg(not(test))]
use std::net::{TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::sync::mpsc::{self, RecvTimeoutError};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

/// Strip the Windows verbatim / extended-length prefix (`\\?\`) from a path. On a PACKAGED Windows
/// build, `current_exe()` and `resource_dir()` can return a `\\?\C:\...` path. `CreateProcessW`
/// (under std::process spawn) treats the `\\?\` as a UNC root (`\\server\share`), fails to resolve
/// the phantom "server", and returns ERROR_PATH_NOT_FOUND (os error 3) -- so the sidecar never
/// spawns. A drive path well under MAX_PATH never needs the prefix, so removing it here is always
/// safe. No-op on a non-verbatim path (and on non-Windows, where the prefix never appears).
fn strip_verbatim_prefix(p: &std::path::Path) -> PathBuf {
    let s = p.as_os_str().to_string_lossy();
    if let Some(rest) = s.strip_prefix(r"\\?\") {
        // `\\?\UNC\server\share` is a real network path -- fold it back to `\\server\share`.
        if let Some(unc) = rest.strip_prefix("UNC\\") {
            return PathBuf::from(format!(r"\\{unc}"));
        }
        return PathBuf::from(rest);
    }
    p.to_path_buf()
}

/// Resolve the engine sidecar binary that sits next to the main executable, with any verbatim
/// prefix stripped so the result is a path `CreateProcess` can parse. This mirrors how the shell
/// plugin's own `sidecar()` builds `<exe_dir>/crash-engine[.exe]` -- minus the `\\?\` prefix that
/// makes its spawn fail on a packaged Windows build (see `strip_verbatim_prefix`).
fn engine_exe_path() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    let mut p = dir.join("crash-engine");
    if cfg!(windows) {
        p.set_extension("exe");
    }
    Some(strip_verbatim_prefix(&p))
}

/// `<workspace>/.runtime/socket.json`, mirroring backend/src/workspace/paths.ts:
/// CRASH_WORKSPACE ?? os.homedir()/Crash (Windows: %USERPROFILE%\Crash).
fn socket_json_path() -> PathBuf {
    let root = std::env::var("CRASH_WORKSPACE")
        .ok()
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            let home = std::env::var("USERPROFILE")
                .or_else(|_| std::env::var("HOME"))
                .unwrap_or_default();
            PathBuf::from(home).join("Crash")
        });
    root.join(".runtime").join("socket.json")
}

/// `<app_config_dir>/provider` -- the caregiver's chosen engine provider for the NEXT launch
/// (e.g. %APPDATA%\com.ron2k1.crash\provider on Windows). Stores ONLY the enum string
/// ("claude-code" | "codex"); a token or credential NEVER goes here.
fn provider_pref_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("provider"))
}

/// Accept a provider string ONLY if it is one of the two known CLIs. This is the security gate that
/// keeps a hand-edited or corrupt preference file from injecting an arbitrary value into the
/// engine's CRASH_PROVIDER environment. Returns the trimmed canonical string.
fn validate_provider(raw: &str) -> Option<&str> {
    match raw.trim() {
        v @ ("claude-code" | "codex") => Some(v),
        _ => None,
    }
}

/// Read the saved provider preference, if any, validated against the known enum.
fn read_provider_pref(app: &AppHandle) -> Option<String> {
    let raw = std::fs::read_to_string(provider_pref_path(app)?).ok()?;
    validate_provider(&raw).map(str::to_owned)
}

/// Persist the caregiver's provider choice so the engine launches on it next start. Validates the
/// value (enum only) and writes it to <app_config_dir>/provider. Invoked from the UI's provider
/// popover; the argument is an enum string, NEVER a token. Note: this only takes effect on a
/// PACKAGED launch (where spawn_engine_and_resolve_boot reads it); in `tauri dev` the engine is
/// launched manually, so the dev operator still controls CRASH_PROVIDER themselves.
#[tauri::command]
pub fn set_provider_preference(app: AppHandle, provider: String) -> Result<(), String> {
    let value = validate_provider(&provider).ok_or_else(|| "invalid_provider".to_string())?;
    let path = provider_pref_path(&app).ok_or_else(|| "no_config_dir".to_string())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|_| "mkdir_failed".to_string())?;
    }
    std::fs::write(&path, value).map_err(|_| "write_failed".to_string())?;
    Ok(())
}

/// Relaunch Crash so a newly persisted provider choice becomes the live engine provider without
/// requiring the user to manually close and reopen the desktop app.
#[tauri::command]
pub fn restart_app(app: AppHandle) -> Result<(), String> {
    app.request_restart();
    Ok(())
}

/// Spawn the engine sidecar and block (on the caller's worker thread) until THIS child reports its
/// `engine.ready` descriptor, returning the `window.__CRASH_BOOT__ = {...};` init script. Returns
/// `None` if the engine cannot be spawned or fails to report within the timeout, in which case the
/// window is built without the script and the renderer honestly shows "waiting for engine".
pub fn spawn_engine_and_resolve_boot(app: &AppHandle) -> Option<String> {
    let socket_path = socket_json_path();

    // Delete any stale descriptor from a previous run so we only ever accept THIS engine's
    // token/port (the engine overwrites socket.json on boot but not until after it binds).
    let _ = std::fs::remove_file(&socket_path);

    // The externalBin source is binaries/crash-engine; Tauri flattens the packaged sidecar beside
    // crash.exe (crash-engine.exe). We resolve that path OURSELVES via engine_exe_path() and launch
    // through command() instead of the shell plugin's sidecar(). The two take the identical Rust
    // spawn path with no ACL difference; sidecar() only adds a current_exe()-derived path that on a
    // packaged Windows build carries the `\\?\` verbatim prefix CreateProcess can't parse (os error 3
    // -- the engine never spawns, so the webview gets ERR_CONNECTION_REFUSED). engine_exe_path()
    // strips that prefix. The engine boots a 127.0.0.1 WS server on an ephemeral port and writes
    // socket.json itself -- no args needed.
    //
    // The marketplace catalog ships as a bundled resource (bundle.resources in tauri.conf.json,
    // staged by installer/build-engine-exe.mjs). Point the engine at it via CRASH_CATALOG_ROOT so
    // backend/src/marketplace/catalog.ts resolves it -- a single-exe engine has no module-relative
    // path to backend/catalog, so without this the packaged marketplace would silently be empty.
    let engine_path = match engine_exe_path() {
        Some(p) => p,
        None => return None,
    };
    let mut cmd = app.shell().command(&engine_path);
    if let Ok(resource_dir) = app.path().resource_dir() {
        // Strip the verbatim prefix here too so the engine (Node) gets a clean catalog path.
        let catalog = strip_verbatim_prefix(&resource_dir.join("catalog"));
        cmd = cmd.env("CRASH_CATALOG_ROOT", catalog);
    }
    // The caregiver may have chosen a provider in the UI (ProviderSwitcher "Use next start"). Read
    // that persisted, enum-validated choice and export it as CRASH_PROVIDER so backend/src/host.ts
    // boots the engine on the chosen CLI. Absent or invalid -> the engine resolves its own default.
    if let Some(pref) = read_provider_pref(app) {
        cmd = cmd.env("CRASH_PROVIDER", pref);
    }
    let (mut rx, child) = match cmd.spawn() {
        Ok(v) => v,
        // The engine has not run at this point, so the spawn error carries no per-session token;
        // even so we discard it rather than log it, and the renderer honestly shows "waiting".
        Err(_) => return None,
    };
    let (ready_tx, ready_rx) = mpsc::channel::<String>();

    // Drain the child's output so its stdout pipe never fills and blocks the engine. Also consume
    // THIS child process's `engine.ready` stdout line, which is the freshest descriptor available.
    // Do NOT log output: the `engine.ready` line and any stderr may carry the per-session token.
    tauri::async_runtime::spawn(async move {
        let _child = child; // hold the handle for the app's lifetime; Tauri reaps sidecars on exit
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    if let Some(script) = boot_script_from_descriptor(text.trim()) {
                        let _ = ready_tx.send(script);
                    }
                }
                CommandEvent::Terminated(_) => break,
                CommandEvent::Stderr(_) | CommandEvent::Error(_) => {}
                _ => {}
            }
        }
    });

    // Prefer stdout from the child we just spawned. Keep socket.json as a fallback for older builds
    // or unusual shell behavior, but only accept it after the advertised loopback socket is reachable
    // so a stale descriptor can no longer point the UI at a dead or previous port.
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        match ready_rx.recv_timeout(Duration::from_millis(100)) {
            Ok(script) => return Some(script),
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }
        if let Ok(text) = std::fs::read_to_string(&socket_path) {
            if let Some(script) = boot_script_from_socket_file(&text) {
                return Some(script);
            }
        }
        if Instant::now() >= deadline {
            break;
        }
    }
    None
}

#[cfg(not(test))]
fn descriptor_socket_is_reachable(text: &str) -> bool {
    let v: serde_json::Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let host = match v.get("host").and_then(|v| v.as_str()) {
        Some(host) => host,
        None => return false,
    };
    let port = match v.get("port").and_then(|v| v.as_u64()) {
        Some(port) if port <= u16::MAX as u64 => port as u16,
        _ => return false,
    };
    let Ok(addrs) = (host, port).to_socket_addrs() else {
        return false;
    };
    for addr in addrs {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(150)).is_ok() {
            return true;
        }
    }
    false
}

#[cfg(test)]
fn descriptor_socket_address(text: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(text).ok()?;
    let host = v.get("host")?.as_str()?;
    let port = v.get("port")?.as_u64()?;
    if port > u16::MAX as u64 {
        return None;
    }
    Some(format!("{host}:{port}"))
}

#[cfg(test)]
fn boot_script_from_stdout_line(text: &str) -> Option<String> {
    boot_script_from_descriptor(text.trim())
}

#[cfg(test)]
fn boot_script_from_socket_file(text: &str) -> Option<String> {
    if descriptor_socket_address(text).is_some() {
        boot_script_from_descriptor(text)
    } else {
        None
    }
}

#[cfg(not(test))]
fn boot_script_from_socket_file(text: &str) -> Option<String> {
    if descriptor_socket_is_reachable(text) {
        boot_script_from_descriptor(text)
    } else {
        None
    }
}

/// Build a script that sets window.__CRASH_BOOT__ to EXACTLY the five connection fields
/// (host, port, token, protocolVersion, provider) -- never the whole descriptor file. Returns
/// `None` if the JSON is incomplete (e.g. a torn read mid-write), so the caller keeps polling.
fn boot_script_from_descriptor(text: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(text).ok()?;
    let boot = serde_json::json!({
        "host": v.get("host")?,
        "port": v.get("port")?,
        "token": v.get("token")?,
        "protocolVersion": v.get("protocolVersion")?,
        "provider": v.get("provider")?,
    });
    // serde_json::to_string emits a valid JS object literal with all values escaped; the engine
    // is the sole source of these values (loopback host, numeric port, hex token, enum provider),
    // so there is no untrusted content and no </script>-breakout surface in an init script.
    Some(format!(
        "window.__CRASH_BOOT__ = {};",
        serde_json::to_string(&boot).ok()?
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn forwards_exactly_the_five_fields() {
        let descriptor = r#"{
            "host": "127.0.0.1", "port": 51234, "token": "deadbeef",
            "protocolVersion": 3, "provider": "claude-code", "workspace": "C:/Users/x/Crash"
        }"#;
        let script = boot_script_from_descriptor(descriptor).expect("valid descriptor");
        // The workspace field (a local path) must NOT leak into the webview.
        assert!(!script.contains("workspace"));
        assert!(script.starts_with("window.__CRASH_BOOT__ = {"));
        for key in ["host", "port", "token", "protocolVersion", "provider"] {
            assert!(script.contains(key), "missing {key}");
        }
    }

    #[test]
    fn rejects_torn_or_incomplete_descriptor() {
        // A mid-write read missing `token` must not yield a script (keep polling instead).
        let partial = r#"{"host":"127.0.0.1","port":51234,"protocolVersion":3,"provider":"claude"}"#;
        assert!(boot_script_from_descriptor(partial).is_none());
        assert!(boot_script_from_descriptor("not json").is_none());
    }

    #[test]
    fn accepts_current_child_ready_stdout_line() {
        let descriptor = r#"{"event":"engine.ready","host":"127.0.0.1","port":51234,"token":"deadbeef","protocolVersion":3,"provider":"codex"}"#;
        let script = boot_script_from_stdout_line(descriptor).expect("valid ready line");

        assert!(script.contains("\"provider\":\"codex\""));
        assert!(!script.contains("engine.ready"));
    }

    #[test]
    fn socket_file_fallback_rejects_invalid_address() {
        let bad_port = r#"{"host":"127.0.0.1","port":70000,"token":"deadbeef","protocolVersion":3,"provider":"codex"}"#;
        assert!(descriptor_socket_address(bad_port).is_none());
        assert!(boot_script_from_socket_file(bad_port).is_none());
    }

    #[test]
    fn validate_provider_accepts_only_known_clis() {
        assert_eq!(validate_provider("codex"), Some("codex"));
        assert_eq!(validate_provider("claude-code"), Some("claude-code"));
        // Tolerates surrounding whitespace from a file read (a trailing newline, say).
        assert_eq!(validate_provider(" codex\n"), Some("codex"));
        // Everything else is rejected so it can never reach CRASH_PROVIDER: 'offline' (a host.ts
        // mode the UI never offers), an injection attempt, or an empty/garbage file.
        assert!(validate_provider("offline").is_none());
        assert!(validate_provider("claude-code; rm -rf /").is_none());
        assert!(validate_provider("").is_none());
    }

    #[test]
    fn strip_verbatim_prefix_removes_extended_length_prefix() {
        use std::path::Path;
        // A packaged Windows current_exe() can look like this; CreateProcess can't parse the
        // `\\?\` prefix and fails with os error 3, so the engine never spawns. Stripping it fixes
        // the packaged-launch ERR_CONNECTION_REFUSED.
        let verbatim = Path::new(r"\\?\C:\Users\x\AppData\Local\Crash\crash-engine.exe");
        assert_eq!(
            strip_verbatim_prefix(verbatim),
            PathBuf::from(r"C:\Users\x\AppData\Local\Crash\crash-engine.exe")
        );
        // `\\?\UNC\server\share` is a real network path; fold it back to `\\server\share`.
        let unc = Path::new(r"\\?\UNC\server\share\crash-engine.exe");
        assert_eq!(
            strip_verbatim_prefix(unc),
            PathBuf::from(r"\\server\share\crash-engine.exe")
        );
        // A clean drive path is returned unchanged (no-op).
        let clean = Path::new(r"C:\Users\x\crash-engine.exe");
        assert_eq!(strip_verbatim_prefix(clean), clean.to_path_buf());
    }
}
