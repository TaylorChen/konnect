use crate::models::{SshConfig, Connection};
use crate::ssh::SshSession;
use tauri::{AppHandle, State};
use std::sync::Arc;
use tokio::sync::Mutex;
use std::collections::HashMap;

pub type SshSessionMap = Arc<Mutex<HashMap<String, SshSession>>>;

// MFA 响应通道类型：用于等待前端提交的 MFA 响应
pub type MfaResponseMap = Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<Vec<String>>>>>;

/// 创建 MFA 响应通道管理器
pub fn create_mfa_response_map() -> MfaResponseMap {
    Arc::new(Mutex::new(HashMap::new()))
}

#[tauri::command]
pub async fn create_ssh_terminal(
    config: Connection,
    sessions: State<'_, SshSessionMap>,
    mfa_channels: State<'_, MfaResponseMap>,
    app_handle: AppHandle,
) -> Result<(), String> {
    debug_log!("[CMD] create_ssh_terminal called for connection: {}", config.name);

    // 检查是否已存在
    {
        let sessions_guard = sessions.lock().await;
        if sessions_guard.contains_key(&config.id) {
            debug_log!("[CMD] SSH terminal {} already exists, skipping creation", config.id);
            return Ok(());
        }
    }

    // 获取 SSH 配置
    let ssh_config = config.ssh_config
        .ok_or("SSH config is required for SSH connection")?;

    // 创建 SSH 会话（传入 MFA 通道用于 keyboard-interactive 认证）
    let mfa_channels_clone = mfa_channels.inner().clone();
    let session = SshSession::new(ssh_config, config.id.clone(), app_handle, mfa_channels_clone)
        .await
        .map_err(|e| format!("Failed to create SSH session: {}", e))?;

    // 保存会话
    let session_id = config.id.clone();
    sessions.lock().await.insert(session_id.clone(), session);
    
    debug_log!("[CMD] create_ssh_terminal completed successfully for id: {}", session_id);
    debug_log!("[CMD] Session stored in map with id: {}", session_id);
    
    Ok(())
}

#[tauri::command]
pub async fn test_ssh_connection(config: SshConfig) -> Result<String, String> {
    debug_log!("[CMD] test_ssh_connection to {}@{}:{}", config.username, config.host, config.port);

    // TODO: 实现真正的连接测试
    // 由于需要 AppHandle，暂时返回未实现
    Err("Connection test not implemented yet. Use create_ssh_terminal to test.".to_string())
}

#[tauri::command]
pub async fn write_to_ssh_terminal(
    id: String,
    data: String,
    sessions: State<'_, SshSessionMap>,
) -> Result<(), String> {
    debug_log!("[SSH-CMD] write_to_ssh_terminal: id={}, data_len={}, data_preview={:?}", 
        id, 
        data.len(),
        if data.len() > 20 { &data[..20] } else { &data }
    );
    
    let sessions = sessions.lock().await;
    if let Some(session) = sessions.get(&id) {
        debug_log!("[SSH-CMD] Found session {}, calling write", id);
        session
            .write(data.as_bytes())
            .await
            .map_err(|e| {
                debug_log!("[SSH-CMD] Write failed for {}: {}", id, e);
                format!("Write failed: {}", e)
            })?;
        debug_log!("[SSH-CMD] Write successful for {}", id);
    } else {
        debug_log!("[SSH-CMD] Session {} not found!", id);
        return Err(format!("Session {} not found", id));
    }
    Ok(())
}

#[tauri::command]
pub async fn resize_ssh_terminal(
    id: String,
    rows: u16,
    cols: u16,
    sessions: State<'_, SshSessionMap>,
) -> Result<(), String> {
    let sessions = sessions.lock().await;
    if let Some(session) = sessions.get(&id) {
        session
            .resize(rows, cols)
            .await
            .map_err(|e| format!("Resize failed: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn close_ssh_terminal(
    id: String,
    sessions: State<'_, SshSessionMap>,
) -> Result<(), String> {
    sessions.lock().await.remove(&id);
    Ok(())
}

/// 提交 MFA 响应
/// 前端在用户输入验证码后调用此命令，将响应发送给等待中的 SSH 认证流程
#[tauri::command]
pub async fn submit_ssh_mfa_response(
    terminal_id: String,
    responses: Vec<String>,
    mfa_channels: State<'_, MfaResponseMap>,
) -> Result<(), String> {
    debug_log!("[SSH-MFA] Received MFA response for terminal: {}", terminal_id);
    
    let mut channels = mfa_channels.lock().await;
    if let Some(sender) = channels.remove(&terminal_id) {
        sender.send(responses).map_err(|_| "Failed to send MFA response: channel closed".to_string())?;
        debug_log!("[SSH-MFA] MFA response sent successfully for terminal: {}", terminal_id);
    } else {
        debug_log!("[SSH-MFA] No pending MFA channel found for terminal: {}", terminal_id);
        return Err(format!("No pending MFA request for terminal: {}", terminal_id));
    }
    Ok(())
}

/// 取消 MFA 认证
/// 当用户点击取消按钮时调用此命令
#[tauri::command]
pub async fn cancel_ssh_mfa(
    terminal_id: String,
    mfa_channels: State<'_, MfaResponseMap>,
) -> Result<(), String> {
    debug_log!("[SSH-MFA] Cancelling MFA for terminal: {}", terminal_id);
    
    // 移除通道，sender 会被 drop，导致接收端收到错误
    mfa_channels.lock().await.remove(&terminal_id);
    Ok(())
}
