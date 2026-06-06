mod secrets;
mod sidecar;

/// Build the single "main" window (the label the `default` capability is scoped to).
///
/// In a packaged build we inject the engine's connection descriptor as window.__CRASH_BOOT__
/// via an initialization script that runs before the renderer boots -- the renderer reads it
/// once at module load with no retry, so it must already be present. In dev the Vite
/// `crash-boot-inject` plugin supplies the global instead, so `boot_script` is `None`.
fn build_main_window(app: &tauri::AppHandle, boot_script: Option<String>) {
    let mut builder = tauri::WebviewWindowBuilder::new(
        app,
        "main",
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("Crash")
    .inner_size(1280.0, 800.0)
    .min_inner_size(1024.0, 720.0)
    .resizable(true);

    if let Some(script) = boot_script {
        builder = builder.initialization_script(script);
    }

    if let Err(e) = builder.build() {
        // A failed window build leaves the app with no UI; surface a non-secret marker.
        eprintln!("[crash] failed to create main window: {e}");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            sidecar::set_provider_preference,
            sidecar::restart_app,
            secrets::set_connector_key
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            // Build the window on a worker thread. On Windows, creating a WebviewWindow
            // synchronously inside `setup` can deadlock WebView2 (per the WebviewWindowBuilder
            // docs); the same thread also performs the bounded blocking wait for the engine's
            // socket.json, so the main thread is never blocked.
            std::thread::spawn(move || {
                let boot_script = if cfg!(debug_assertions) {
                    // DEV (`tauri dev` is a debug build): the Vite crash-boot-inject plugin
                    // supplies window.__CRASH_BOOT__ and the engine is launched manually.
                    None
                } else {
                    // PACKAGED (release bundle): no Vite serve step, so spawn the engine sidecar
                    // and resolve its boot descriptor before building the window.
                    sidecar::spawn_engine_and_resolve_boot(&handle)
                };
                build_main_window(&handle, boot_script);
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
