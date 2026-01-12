use crate::models::{SshConfig, SshAuth};
use russh::*;
use russh::keys::key::PrivateKeyWithHashAlg;
use russh::keys::PublicKey;
use russh_sftp::client::SftpSession;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::io::AsyncWriteExt;

/// SFTP 会话包装器，用于管理 SFTP 连接
pub struct SftpSessionWrapper {
    pub id: String,
    pub sftp: Arc<Mutex<SftpSession>>,
}

impl SftpSessionWrapper {
    /// 创建新的 SFTP 会话
    pub async fn new(
        config: SshConfig,
        session_id: String,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        debug_log!("[SFTP] ===== Starting SFTP Connection =====");
        debug_log!("[SFTP] Target: {}@{}:{}", config.username, config.host, config.port);

        // 创建 SSH 配置
        let ssh_config = client::Config {
            inactivity_timeout: Some(std::time::Duration::from_secs(3600)),
            ..Default::default()
        };

        // SSH 客户端处理器
        struct Client {}

        impl client::Handler for Client {
            type Error = russh::Error;

            fn check_server_key(
                &mut self,
                _server_public_key: &PublicKey,
            ) -> impl std::future::Future<Output = Result<bool, Self::Error>> + Send {
                async { Ok(true) }
            }
        }

        // 创建客户端并连接
        let mut session = client::connect(
            Arc::new(ssh_config),
            (config.host.as_str(), config.port),
            Client {},
        ).await.map_err(|e| format!("Connection failed: {}", e))?;

        debug_log!("[SFTP] ✅ TCP connection established");

        // 认证
        let auth_result = match &config.auth {
            SshAuth::Password(password) => {
                session.authenticate_password(config.username.clone(), password.clone()).await
                    .map_err(|e| format!("Authentication error: {}", e))?
            }
            SshAuth::PublicKey { private_key_path, passphrase } => {
                let key_pair = russh::keys::decode_secret_key(
                    &std::fs::read_to_string(private_key_path)?,
                    passphrase.as_deref(),
                )?;
                // russh 0.56 需要使用 PrivateKeyWithHashAlg
                let key_with_alg = PrivateKeyWithHashAlg::new(
                    Arc::new(key_pair),
                    session.best_supported_rsa_hash().await?.flatten(),
                );
                session.authenticate_publickey(config.username.clone(), key_with_alg).await?
            }
        };

        if !auth_result.success() {
            return Err("SSH authentication failed".into());
        }

        debug_log!("[SFTP] ✅ Authenticated successfully");

        // 打开 SFTP 子系统通道
        let channel = session.channel_open_session().await
            .map_err(|e| format!("Failed to open channel: {}", e))?;

        debug_log!("[SFTP] Requesting SFTP subsystem...");
        channel.request_subsystem(false, "sftp").await
            .map_err(|e| format!("Failed to request SFTP subsystem: {}", e))?;

        debug_log!("[SFTP] ✅ SFTP subsystem requested");

        // 创建 SFTP 会话
        let sftp = SftpSession::new(channel.into_stream()).await
            .map_err(|e| format!("Failed to create SFTP session: {}", e))?;

        debug_log!("[SFTP] ===== SFTP Session Established =====");

        Ok(Self {
            id: session_id,
            sftp: Arc::new(Mutex::new(sftp)),
        })
    }

    /// 列出目录内容
    pub async fn list_dir(&self, path: &str) -> Result<Vec<FileEntry>, Box<dyn std::error::Error + Send + Sync>> {
        let sftp = self.sftp.lock().await;
        let read_dir = sftp.read_dir(path).await
            .map_err(|e| format!("Failed to read directory: {}", e))?;

        let mut entries = Vec::new();
        for entry in read_dir {
            let file_name = entry.file_name();
            let attrs = entry.metadata();
            entries.push(FileEntry {
                name: file_name,
                is_dir: attrs.is_dir(),
                size: attrs.size.unwrap_or(0),
                permissions: attrs.permissions.map(|p| format!("{:o}", p)),
                modified: attrs.mtime.map(|t| t as u64),
            });
        }

        Ok(entries)
    }

    /// 读取文件内容
    pub async fn read_file(&self, path: &str) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
        let sftp = self.sftp.lock().await;
        let data = sftp.read(path).await
            .map_err(|e| format!("Failed to read file: {}", e))?;
        Ok(data)
    }

    /// 写入文件内容（创建或覆盖）
    pub async fn write_file(&self, path: &str, data: &[u8]) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let sftp = self.sftp.lock().await;
        // 使用 create 方法创建文件（会创建新文件或截断已存在的文件）
        let mut file = sftp.create(path).await
            .map_err(|e| format!("Failed to create file: {}", e))?;
        // 写入数据
        file.write_all(data).await
            .map_err(|e| format!("Failed to write data: {}", e))?;
        // 文件会在 drop 时自动关闭
        Ok(())
    }

    /// 删除文件
    pub async fn remove_file(&self, path: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let sftp = self.sftp.lock().await;
        sftp.remove_file(path).await
            .map_err(|e| format!("Failed to remove file: {}", e))?;
        Ok(())
    }

    /// 删除目录
    pub async fn remove_dir(&self, path: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let sftp = self.sftp.lock().await;
        sftp.remove_dir(path).await
            .map_err(|e| format!("Failed to remove directory: {}", e))?;
        Ok(())
    }

    /// 创建目录
    pub async fn create_dir(&self, path: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let sftp = self.sftp.lock().await;
        sftp.create_dir(path).await
            .map_err(|e| format!("Failed to create directory: {}", e))?;
        Ok(())
    }
}

/// 文件条目信息
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub permissions: Option<String>,
    pub modified: Option<u64>,
}
