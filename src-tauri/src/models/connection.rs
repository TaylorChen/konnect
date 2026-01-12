use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ConnectionType {
    Local,
    Ssh,
    Telnet,
    Serial,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: SshAuth,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SshAuth {
    Password(String),
    PublicKey {
        private_key_path: String,
        passphrase: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connection {
    pub id: String,
    pub name: String,
    pub connection_type: ConnectionType,
    pub ssh_config: Option<SshConfig>,
    // 其他协议配置可以后续添加
    // pub telnet_config: Option<TelnetConfig>,
    // pub serial_config: Option<SerialConfig>,
}

impl Connection {
    pub fn new_local(name: String) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            connection_type: ConnectionType::Local,
            ssh_config: None,
        }
    }

    pub fn new_ssh(name: String, ssh_config: SshConfig) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            connection_type: ConnectionType::Ssh,
            ssh_config: Some(ssh_config),
        }
    }
}
