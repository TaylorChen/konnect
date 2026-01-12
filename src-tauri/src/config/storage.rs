use crate::models::Connection;
use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct ConnectionsConfig {
    connections: Vec<Connection>,
}

pub struct ConnectionStorage {
    config_path: PathBuf,
}

impl ConnectionStorage {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let config_dir = dirs::config_dir()
            .ok_or("无法获取配置目录")?
            .join("konnect");
        
        // 确保配置目录存在
        fs::create_dir_all(&config_dir)?;
        
        let config_path = config_dir.join("connections.toml");
        
        Ok(Self { config_path })
    }

    pub fn load_connections(&self) -> Result<Vec<Connection>, Box<dyn std::error::Error>> {
        if !self.config_path.exists() {
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(&self.config_path)?;
        let config: ConnectionsConfig = toml::from_str(&content)?;
        Ok(config.connections)
    }

    pub fn save_connections(&self, connections: &[Connection]) -> Result<(), Box<dyn std::error::Error>> {
        let config = ConnectionsConfig {
            connections: connections.to_vec(),
        };
        
        let content = toml::to_string_pretty(&config)?;
        fs::write(&self.config_path, content)?;
        Ok(())
    }

    pub fn add_connection(&self, connection: Connection) -> Result<(), Box<dyn std::error::Error>> {
        let mut connections = self.load_connections()?;
        connections.push(connection);
        self.save_connections(&connections)
    }

    pub fn remove_connection(&self, id: &str) -> Result<(), Box<dyn std::error::Error>> {
        let mut connections = self.load_connections()?;
        connections.retain(|c| c.id != id);
        self.save_connections(&connections)
    }

    pub fn update_connection(&self, connection: Connection) -> Result<(), Box<dyn std::error::Error>> {
        let mut connections = self.load_connections()?;
        if let Some(pos) = connections.iter().position(|c| c.id == connection.id) {
            connections[pos] = connection;
            self.save_connections(&connections)?;
        }
        Ok(())
    }

    pub fn get_connection(&self, id: &str) -> Result<Option<Connection>, Box<dyn std::error::Error>> {
        let connections = self.load_connections()?;
        Ok(connections.into_iter().find(|c| c.id == id))
    }
}
