use tauri::{AppHandle, State};
use super::pty_manager::{PtyConfig, PtySession, SessionMap};

#[tauri::command]
pub async fn create_terminal(
    config: PtyConfig,
    sessions: State<'_, SessionMap>,
    app_handle: AppHandle,
) -> Result<(), String> {
    debug_log!("[CMD] create_terminal called with config: {:?}", config);
    
    // 防止重复创建：如果该 ID 已存在，直接返回成功
    {
        let sessions_guard = sessions.lock().unwrap();
        if sessions_guard.contains_key(&config.id) {
            debug_log!("[CMD] Terminal {} already exists, skipping creation", config.id);
            return Ok(());
        }
    }
    
    let session = PtySession::new(config.clone(), app_handle)
        .map_err(|e| {
            let err_msg = format!("Failed to create terminal: {}", e);
            debug_log!("[CMD] Error: {}", err_msg);
            err_msg
        })?;
    
    sessions.lock().unwrap().insert(config.id.clone(), session);
    debug_log!("[CMD] create_terminal completed successfully for id: {}", config.id);
    Ok(())
}

#[tauri::command]
pub async fn write_to_terminal(
    id: String,
    data: String,
    sessions: State<'_, SessionMap>,
) -> Result<(), String> {
    let sessions = sessions.lock().unwrap();
    if let Some(session) = sessions.get(&id) {
        session.write(data.as_bytes())
            .map_err(|e| format!("Write failed: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn resize_terminal(
    id: String,
    rows: u16,
    cols: u16,
    sessions: State<'_, SessionMap>,
) -> Result<(), String> {
    let mut sessions = sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&id) {
        session.resize(rows, cols)
            .map_err(|e| format!("Resize failed: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn close_terminal(
    id: String,
    sessions: State<'_, SessionMap>,
) -> Result<(), String> {
    sessions.lock().unwrap().remove(&id);
    Ok(())
}
