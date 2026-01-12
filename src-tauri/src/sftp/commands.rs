use crate::models::Connection;
use crate::sftp::{SftpSessionWrapper, session::FileEntry};
use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::collections::HashMap;

pub type SftpSessionMap = Arc<Mutex<HashMap<String, SftpSessionWrapper>>>;

/// 创建 SFTP 会话映射
pub fn create_sftp_session_map() -> SftpSessionMap {
    Arc::new(Mutex::new(HashMap::new()))
}

/// 创建 SFTP 会话
#[tauri::command]
pub async fn sftp_connect(
    config: Connection,
    sessions: State<'_, SftpSessionMap>,
) -> Result<(), String> {
    debug_log!("[SFTP-CMD] sftp_connect called for connection: {}", config.name);

    // 检查是否已存在
    {
        let sessions_guard = sessions.lock().await;
        if sessions_guard.contains_key(&config.id) {
            debug_log!("[SFTP-CMD] SFTP session {} already exists", config.id);
            return Ok(());
        }
    }

    // 获取 SSH 配置
    let ssh_config = config.ssh_config
        .ok_or("SSH config is required for SFTP connection")?;

    // 创建 SFTP 会话
    let session = SftpSessionWrapper::new(ssh_config, config.id.clone())
        .await
        .map_err(|e| format!("Failed to create SFTP session: {}", e))?;

    // 保存会话
    sessions.lock().await.insert(config.id.clone(), session);
    
    debug_log!("[SFTP-CMD] sftp_connect completed successfully for id: {}", config.id);
    Ok(())
}

/// 列出目录内容
#[tauri::command]
pub async fn sftp_list_dir(
    id: String,
    path: String,
    sessions: State<'_, SftpSessionMap>,
) -> Result<Vec<FileEntry>, String> {
    debug_log!("[SFTP-CMD] sftp_list_dir: id={}, path={}", id, path);
    
    let sessions = sessions.lock().await;
    let session = sessions.get(&id)
        .ok_or_else(|| format!("SFTP session {} not found", id))?;

    let entries = session.list_dir(&path).await
        .map_err(|e| format!("Failed to list directory: {}", e))?;

    debug_log!("[SFTP-CMD] Listed {} entries in {}", entries.len(), path);
    Ok(entries)
}

/// 下载文件
#[tauri::command]
pub async fn sftp_download_file(
    id: String,
    remote_path: String,
    local_path: String,
    sessions: State<'_, SftpSessionMap>,
) -> Result<(), String> {
    debug_log!("[SFTP-CMD] sftp_download_file: id={}, remote={}, local={}", id, remote_path, local_path);
    
    let sessions = sessions.lock().await;
    let session = sessions.get(&id)
        .ok_or_else(|| format!("SFTP session {} not found", id))?;

    let data = session.read_file(&remote_path).await
        .map_err(|e| format!("Failed to read remote file: {}", e))?;

    std::fs::write(&local_path, &data)
        .map_err(|e| format!("Failed to write local file: {}", e))?;

    debug_log!("[SFTP-CMD] Downloaded {} bytes to {}", data.len(), local_path);
    Ok(())
}

/// 上传文件
#[tauri::command]
pub async fn sftp_upload_file(
    id: String,
    local_path: String,
    remote_path: String,
    sessions: State<'_, SftpSessionMap>,
) -> Result<(), String> {
    debug_log!("[SFTP-CMD] sftp_upload_file: id={}, local={}, remote={}", id, local_path, remote_path);
    
    let data = std::fs::read(&local_path)
        .map_err(|e| format!("Failed to read local file: {}", e))?;

    let sessions = sessions.lock().await;
    let session = sessions.get(&id)
        .ok_or_else(|| format!("SFTP session {} not found", id))?;

    session.write_file(&remote_path, &data).await
        .map_err(|e| format!("Failed to write remote file: {}", e))?;

    debug_log!("[SFTP-CMD] Uploaded {} bytes to {}", data.len(), remote_path);
    Ok(())
}

/// 删除文件或目录
#[tauri::command]
pub async fn sftp_remove(
    id: String,
    path: String,
    is_dir: bool,
    sessions: State<'_, SftpSessionMap>,
) -> Result<(), String> {
    debug_log!("[SFTP-CMD] sftp_remove: id={}, path={}, is_dir={}", id, path, is_dir);
    
    let sessions = sessions.lock().await;
    let session = sessions.get(&id)
        .ok_or_else(|| format!("SFTP session {} not found", id))?;

    if is_dir {
        session.remove_dir(&path).await
            .map_err(|e| format!("Failed to remove directory: {}", e))?;
    } else {
        session.remove_file(&path).await
            .map_err(|e| format!("Failed to remove file: {}", e))?;
    }

    debug_log!("[SFTP-CMD] Removed {}", path);
    Ok(())
}

/// 创建目录
#[tauri::command]
pub async fn sftp_create_dir(
    id: String,
    path: String,
    sessions: State<'_, SftpSessionMap>,
) -> Result<(), String> {
    debug_log!("[SFTP-CMD] sftp_create_dir: id={}, path={}", id, path);
    
    let sessions = sessions.lock().await;
    let session = sessions.get(&id)
        .ok_or_else(|| format!("SFTP session {} not found", id))?;

    session.create_dir(&path).await
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    debug_log!("[SFTP-CMD] Created directory {}", path);
    Ok(())
}

/// 关闭 SFTP 会话
#[tauri::command]
pub async fn sftp_disconnect(
    id: String,
    sessions: State<'_, SftpSessionMap>,
) -> Result<(), String> {
    debug_log!("[SFTP-CMD] sftp_disconnect: id={}", id);
    sessions.lock().await.remove(&id);
    Ok(())
}
