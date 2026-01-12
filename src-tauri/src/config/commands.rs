use crate::models::Connection;
use crate::config::storage::ConnectionStorage;
use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;

pub type ConnectionStorageState = Arc<Mutex<ConnectionStorage>>;

#[tauri::command]
pub async fn save_connection(
    connection: Connection,
    storage: State<'_, ConnectionStorageState>,
) -> Result<(), String> {
    debug_log!("[CONFIG] Saving connection: {} ({})", connection.name, connection.id);
    
    let storage = storage.lock().await;
    storage
        .add_connection(connection)
        .map_err(|e| format!("Failed to save connection: {}", e))
}

#[tauri::command]
pub async fn load_connections(
    storage: State<'_, ConnectionStorageState>,
) -> Result<Vec<Connection>, String> {
    debug_log!("[CONFIG] Loading all connections");
    
    let storage = storage.lock().await;
    storage
        .load_connections()
        .map_err(|e| format!("Failed to load connections: {}", e))
}

#[tauri::command]
pub async fn delete_connection(
    id: String,
    storage: State<'_, ConnectionStorageState>,
) -> Result<(), String> {
    debug_log!("[CONFIG] Deleting connection: {}", id);
    
    let storage = storage.lock().await;
    storage
        .remove_connection(&id)
        .map_err(|e| format!("Failed to delete connection: {}", e))
}

#[tauri::command]
pub async fn update_connection(
    connection: Connection,
    storage: State<'_, ConnectionStorageState>,
) -> Result<(), String> {
    debug_log!("[CONFIG] Updating connection: {} ({})", connection.name, connection.id);
    
    let storage = storage.lock().await;
    storage
        .update_connection(connection)
        .map_err(|e| format!("Failed to update connection: {}", e))
}
