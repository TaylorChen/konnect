use tauri::Manager;

// Debug logging macro module
#[macro_use]
pub mod debug;

// 模块声明
pub mod terminal;
pub mod models;
pub mod config;
pub mod ssh;
pub mod sftp;



use terminal::commands;
use ssh::commands as ssh_commands;
use config::commands as config_commands;
use sftp::commands as sftp_commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // 初始化本地终端会话管理
            let sessions = terminal::create_session_map(); // Original was `terminal::create_session_map()`, new is `terminal::pty_manager::create_session_map()`
            app.manage(sessions);
            
            // 初始化 SSH 会话管理
            let ssh_sessions = std::sync::Arc::new(tokio::sync::Mutex::new(
                std::collections::HashMap::<String, ssh::SshSession>::new()
            ));
            app.manage(ssh_sessions);
            
            // 初始化连接配置存储
            let storage = config::ConnectionStorage::new()
                .expect("Failed to initialize connection storage");
            let storage_state = std::sync::Arc::new(tokio::sync::Mutex::new(storage));
            app.manage(storage_state);
            
            // 初始化 SFTP 会话管理
            let sftp_sessions = sftp::commands::create_sftp_session_map();
            app.manage(sftp_sessions);
            
            // 初始化 SSH MFA 响应通道管理
            let mfa_channels = ssh::create_mfa_response_map();
            app.manage(mfa_channels);
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 本地终端命令
            commands::create_terminal,
            commands::write_to_terminal,
            commands::resize_terminal,
            commands::close_terminal,
            // SSH 命令
            ssh_commands::create_ssh_terminal,
            ssh_commands::test_ssh_connection,
            ssh_commands::write_to_ssh_terminal,
            ssh_commands::resize_ssh_terminal,
            ssh_commands::close_ssh_terminal,
            // SSH MFA 命令
            ssh_commands::submit_ssh_mfa_response,
            ssh_commands::cancel_ssh_mfa,
            // 配置管理命令
            config_commands::save_connection,
            config_commands::load_connections,
            config_commands::delete_connection,
            config_commands::update_connection,
            // SFTP 命令
            sftp_commands::sftp_connect,
            sftp_commands::sftp_list_dir,
            sftp_commands::sftp_download_file,
            sftp_commands::sftp_upload_file,
            sftp_commands::sftp_remove,
            sftp_commands::sftp_create_dir,
            sftp_commands::sftp_disconnect,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
