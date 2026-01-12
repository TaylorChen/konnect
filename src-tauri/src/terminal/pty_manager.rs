use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PtyConfig {
    pub id: String,
    pub shell: String,
    pub cols: u16,
    pub rows: u16,
}

pub struct PtySession {
    id: String,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    pair: Arc<Mutex<PtyPair>>,  // 保留完整的 pair，用于 resize
    _child: Box<dyn portable_pty::Child + Send>,
}

impl PtySession {
    pub fn new(config: PtyConfig, app_handle: AppHandle) -> Result<Self, Box<dyn std::error::Error>> {
        debug_log!("[PTY] Creating new session: id={}, shell={}, cols={}, rows={}", 
            config.id, config.shell, config.cols, config.rows);
        
        let pty_system = native_pty_system();
        
        // 创建 PTY 对
        let pair = pty_system.openpty(PtySize {
            rows: config.rows,
            cols: config.cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        debug_log!("[PTY] PTY pair created successfully");

        // 构建 Shell 命令 - 使用 -i 参数强制交互模式
        debug_log!("[PTY] Starting shell: {} -i", config.shell);
        let mut cmd = CommandBuilder::new(&config.shell);
        cmd.arg("-i");
        
        // 设置环境变量
        cmd.env("TERM", "xterm-256color");
        
        // 继承必要的环境变量
        for (key, value) in  std::env::vars() {
            if matches!(key.as_str(), "HOME" | "PATH" | "USER" | "SHELL" | "LANG" | "LC_ALL") {
                cmd.env(key, value);
            }
        }
        
        debug_log!("[PTY] Spawning shell process...");
        let child = pair.slave.spawn_command(cmd)?;
        debug_log!("[PTY] Shell process spawned successfully");

        // 关键：只调用一次 take_writer 和 try_clone_reader
        // 先 take writer
        let writer = Arc::new(Mutex::new(pair.master.take_writer()?));
        
        // 然后 clone reader（此时 master 的 writer 已经被取走）
        let reader = pair.master.try_clone_reader()?;
        
        // 保存整个 pair 用于 resize
        let pair = Arc::new(Mutex::new(pair));

        let terminal_id = config.id.clone();
        let app = app_handle.clone();

        debug_log!("[PTY] Starting reader thread for terminal: {}", terminal_id);
        
        // 启动读取线程
        std::thread::spawn(move || {
            let mut reader = reader;
            let mut buf = [0u8; 8192];
            let mut read_count = 0;
            
            debug_log!("[PTY-READ] terminal={} - Reader thread started", terminal_id);
            
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        debug_log!("[PTY-READ] terminal={} - Read 0 bytes, PTY closed", terminal_id);
                        let _ = app.emit(&format!("terminal-exit-{}", terminal_id), ());
                        break;
                    }
                    Ok(n) => {
                        read_count += 1;
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        debug_log!("[PTY-READ #{}] terminal={}, bytes={}, data preview: {:?}", 
                            read_count, terminal_id, n, 
                            if data.len() > 50 { &data[..50] } else { &data });
                        let _ = app.emit(&format!("terminal-output-{}", terminal_id), data);
                    }
                    Err(e) => {
                        debug_log!("[PTY-READ] terminal={} - Read error: {}", terminal_id, e);
                        let _ = app.emit(&format!("terminal-exit-{}", terminal_id), ());
                        break;
                    }
                }
            }
            debug_log!("[PTY-READ] terminal={} - Reader thread exiting", terminal_id);
        });

        debug_log!("[PTY] Session created successfully for terminal: {}", config.id);

        Ok(Self {
            id: config.id,
            writer,
            pair,
            _child: child,
        })
    }

    pub fn write(&self, data: &[u8]) -> Result<(), Box<dyn std::error::Error>> {
        debug_log!("[PTY-WRITE] id={}, bytes={}, data: {:?}", 
            self.id, 
            data.len(), 
            String::from_utf8_lossy(data));
        
        // 直接使用已保存的 writer
        let mut writer = self.writer.lock().unwrap();
        writer.write_all(data)?;
        writer.flush()?;
        Ok(())
    }

    pub fn resize(&mut self, rows: u16, cols: u16) -> Result<(), Box<dyn std::error::Error>> {
        let pair = self.pair.lock().unwrap();
        pair.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;
        Ok(())
    }
}

pub type SessionMap = Arc<Mutex<HashMap<String, PtySession>>>;

pub fn create_session_map() -> SessionMap {
    Arc::new(Mutex::new(HashMap::new()))
}
