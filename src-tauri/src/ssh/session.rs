use crate::models::{SshConfig, SshAuth};
use crate::ssh::mfa::{MfaPromptPayload, MfaPrompt};
use crate::ssh::commands::MfaResponseMap;
use russh::*;
use russh::client::KeyboardInteractiveAuthResponse;
use russh::keys::key::PrivateKeyWithHashAlg;
use russh::keys::PublicKey;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter};

// SSH 客户端处理器
struct Client {}

impl client::Handler for Client {
    type Error = russh::Error;

    fn check_server_key(
        &mut self,
        _server_public_key: &PublicKey,
    ) -> impl std::future::Future<Output = Result<bool, Self::Error>> + Send {
        // 简化版：接受所有服务器密钥
        // 生产环境应该验证 known_hosts
        async { Ok(true) }
    }
}

#[derive(Debug)]
pub enum SshControl {
    Write(Vec<u8>),
    Resize { rows: u16, cols: u16 },
}

pub struct SshSession {
    #[allow(dead_code)]
    id: String,
    #[allow(dead_code)]
    handle: Arc<Mutex<client::Handle<Client>>>,
    control_tx: Arc<tokio::sync::mpsc::Sender<SshControl>>,
}

impl SshSession {
    pub async fn new(
        config: SshConfig,
        terminal_id: String,
        app_handle: AppHandle,
        mfa_channels: MfaResponseMap,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        debug_log!("[SSH] ===== Starting SSH Connection =====");
        debug_log!("[SSH] Target: {}@{}:{}", config.username, config.host, config.port);

        // 创建 SSH 配置，包含更广泛的密钥交换算法支持
        // 某些旧版服务器（如阿里云堡垒机）可能需要较旧的算法
        let mut preferred = russh::Preferred::default();
        
        // 添加更多的密钥交换算法，包括旧版算法
        preferred.kex = std::borrow::Cow::Owned(vec![
            russh::kex::CURVE25519,
            russh::kex::DH_G14_SHA256,
            russh::kex::DH_G16_SHA512,
            russh::kex::DH_G14_SHA1,
            russh::kex::DH_G1_SHA1,
            russh::kex::EXTENSION_SUPPORT_AS_CLIENT,
        ]);

        
        let ssh_config = client::Config {
            // 禁用客户端侧不活动超时，完全依赖 keepalive 机制
            inactivity_timeout: None,
            // 每隔 30 秒发送一次心跳包
            keepalive_interval: Some(std::time::Duration::from_secs(30)),
            // 连续 6 次心跳无响应才关闭连接（约 3 分钟容忍时间）
            keepalive_max: 6,
            preferred,
            ..Default::default()
        };



        
        debug_log!("[SSH] Config created, attempting TCP connection...");

        // 创建客户端并连接（修复端口类型）
        let session_result = client::connect(
            Arc::new(ssh_config),
            (config.host.as_str(), config.port),
            Client {},
        ).await;
        
        let mut session = match session_result {
            Ok(s) => {
                debug_log!("[SSH] ✅ TCP connection established");
                s
            }
            Err(e) => {
                debug_log!("[SSH] ❌ TCP connection failed: {}", e);
                return Err(format!("Connection failed: {}", e).into());
            }
        };

        debug_log!("[SSH] Authenticating user '{}'...", config.username);

        // 认证策略：
        // 1. 先尝试配置的认证方式（公钥或密码）
        // 2. 如果返回 false（可能是 partial success，需要 MFA），尝试 keyboard-interactive
        
        // 步骤 1：尝试配置的认证方式
        let auth_result = match &config.auth {
            SshAuth::Password(password) => {
                debug_log!("[SSH] Using password authentication (len={})", password.len());
                match session.authenticate_password(config.username.clone(), password.clone()).await {
                    Ok(result) => {
                        debug_log!("[SSH] Password auth result: {:?}", result.success());
                        result
                    }
                    Err(e) => {
                        debug_log!("[SSH] ❌ Password auth error: {}", e);
                        return Err(format!("Authentication error: {}", e).into());
                    }
                }
            }
            SshAuth::PublicKey {
                private_key_path,
                passphrase,
            } => {
                debug_log!("[SSH] Using public key: {}", private_key_path);
                let key_pair = russh::keys::decode_secret_key(
                    &std::fs::read_to_string(private_key_path)?,
                    passphrase.as_deref(),
                )?;
                // russh 0.56 需要使用 PrivateKeyWithHashAlg
                let key_with_alg = PrivateKeyWithHashAlg::new(
                    Arc::new(key_pair),
                    session.best_supported_rsa_hash().await?.flatten(),
                );
                match session.authenticate_publickey(config.username.clone(), key_with_alg).await {
                    Ok(result) => {
                        debug_log!("[SSH] Public key auth result: {:?}", result.success());
                        result
                    }
                    Err(e) => {
                        debug_log!("[SSH] ❌ Public key auth error: {}", e);
                        return Err(format!("Authentication error: {}", e).into());
                    }
                }
            }
        };

        // 步骤 2：如果首次认证返回 false，尝试 keyboard-interactive（可能是 MFA）
        if auth_result.success() {
            debug_log!("[SSH] ✅ Authentication successful (first method)");
        } else {
            debug_log!("[SSH] First auth returned false, attempting keyboard-interactive (MFA)...");
            
            // 直接尝试 keyboard-interactive，不使用短超时（可能导致连接问题）
            let kbi_result = Self::perform_keyboard_interactive_auth(
                &mut session,
                &config.username,
                &terminal_id,
                &app_handle,
                &mfa_channels,
            ).await;
            
            match kbi_result {
                Ok(true) => {
                    debug_log!("[SSH] ✅ MFA authentication successful");
                }
                Ok(false) => {
                    debug_log!("[SSH] ❌ MFA authentication rejected");
                    return Err("SSH MFA authentication failed".into());
                }
                Err(e) => {
                    debug_log!("[SSH] ❌ MFA authentication error: {}", e);
                    return Err(format!("MFA authentication error: {}", e).into());
                }
            }
        }

        debug_log!("[SSH] ✅ Authenticated successfully");
        debug_log!("[SSH] Opening session channel...");

        // 打开通道并请求 PTY
        let channel_result = session.channel_open_session().await;
        let channel = match channel_result {
            Ok(ch) => {
                debug_log!("[SSH] ✅ Session channel opened");
                ch
            }
            Err(e) => {
                debug_log!("[SSH] ❌ Failed to open channel: {}", e);
                return Err(format!("Failed to open channel: {}", e).into());
            }
        };
        
        debug_log!("[SSH] Requesting PTY (80x24)...");
        
        match channel
            .request_pty(
                false,
                &config.username,
                80,  // cols
                24,  // rows
                0,   // pixel_width
                0,   // pixel_height
                &[],
            )
            .await {
                Ok(_) => debug_log!("[SSH] ✅ PTY allocated"),
                Err(e) => {
                    debug_log!("[SSH] ❌ PTY request failed: {}", e);
                    return Err(format!("PTY request failed: {}", e).into());
                }
            }

        debug_log!("[SSH] Requesting shell...");
        match channel.request_shell(false).await {
            Ok(_) => debug_log!("[SSH] ✅ Shell started"),
            Err(e) => {
                debug_log!("[SSH] ❌ Shell request failed: {}", e);
                return Err(format!("Shell request failed: {}", e).into());
            }
        }

        debug_log!("[SSH] ===== SSH Session Established =====");

        let handle = Arc::new(Mutex::new(session));
        let channel_arc = Arc::new(Mutex::new(channel));

        let (control_tx, mut control_rx) = tokio::sync::mpsc::channel::<SshControl>(100);
        let terminal_id_clone = terminal_id.clone();
        let app_clone = app_handle.clone();
        
        tokio::spawn(async move {
            let mut read_count = 0;
            // 将 channel 移入任务，由于它不是 Clone，只能由一个任务持有
            let mut channel = match Arc::try_unwrap(channel_arc) {
                Ok(mutex) => mutex.into_inner(),
                Err(_) => {
                    debug_log!("[SSH-TASK] Error: Could not unwrap channel Arc");
                    return;
                }
            };

            loop {
                tokio::select! {
                    // 处理控制台指令（写数据、调大小）
                    Some(cmd) = control_rx.recv() => {
                        match cmd {
                            SshControl::Write(data) => {
                                if let Err(e) = channel.data(&data[..]).await {
                                    debug_log!("[SSH-WRITE-TASK] Error writing: {}", e);
                                }
                            }
                            SshControl::Resize { rows, cols } => {
                                let _ = channel.window_change(cols as u32, rows as u32, 0, 0).await;
                            }
                        }
                    }
                    // 异步读取数据
                    msg = channel.wait() => {
                        match msg {
                            Some(ChannelMsg::Data { ref data }) => {
                                read_count += 1;
                                let output = String::from_utf8_lossy(data).to_string();
                                debug_log!("[SSH-READ #{}] terminal={}, bytes={}, preview: {:?}",
                                    read_count, terminal_id_clone, data.len(),
                                    if output.len() > 50 { &output[..50] } else { &output });
                                
                                let _ = app_clone.emit(
                                    &format!("terminal-output-{}", terminal_id_clone),
                                    output,
                                );
                            }
                            Some(ChannelMsg::Eof) | Some(ChannelMsg::ExitStatus { .. }) | None => {
                                debug_log!("[SSH-READ] terminal={} - Channel closed/EOF", terminal_id_clone);
                                let _ = app_clone.emit(&format!("terminal-exit-{}", terminal_id_clone), ());
                                break;
                            }
                            _ => {}
                        }
                    }
                }
            }
            debug_log!("[SSH-TASK] terminal={} - Task exiting", terminal_id_clone);
        });

        Ok(Self {
            id: terminal_id,
            handle,
            control_tx: Arc::new(control_tx),
        })
    }

    pub async fn write(&self, data: &[u8]) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        debug_log!("[SSH-WRITE] id={}, bytes={}, data: {:?}",
            self.id,
            data.len(),
            String::from_utf8_lossy(data));

        self.control_tx.send(SshControl::Write(data.to_vec())).await?;
        Ok(())
    }

    pub async fn resize(&self, rows: u16, cols: u16) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.control_tx.send(SshControl::Resize { rows, cols }).await?;
        Ok(())
    }

    /// 执行 keyboard-interactive 认证（用于 MFA）
    /// 
    /// 此方法处理多轮 keyboard-interactive 交互：
    /// 1. 启动 keyboard-interactive 认证
    /// 2. 当收到 InfoRequest 时，向前端发送 ssh-mfa-prompt 事件
    /// 3. 等待前端通过 submit_ssh_mfa_response 命令返回响应
    /// 4. 将响应发送给服务器，循环直到成功或失败
    async fn perform_keyboard_interactive_auth(
        session: &mut client::Handle<Client>,
        username: &str,
        terminal_id: &str,
        app_handle: &AppHandle,
        mfa_channels: &MfaResponseMap,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        debug_log!("[SSH-MFA] Starting keyboard-interactive authentication for user: {}", username);

        // 启动 keyboard-interactive 认证
        debug_log!("[SSH-MFA] Calling authenticate_keyboard_interactive_start...");
        let kbi_result = session
            .authenticate_keyboard_interactive_start(username.to_string(), None)
            .await;
        
        let mut kbi_response = match kbi_result {
            Ok(resp) => {
                debug_log!("[SSH-MFA] authenticate_keyboard_interactive_start returned: {:?}", 
                    match &resp {
                        KeyboardInteractiveAuthResponse::Success => "Success",
                        KeyboardInteractiveAuthResponse::Failure { .. } => "Failure", 
                        KeyboardInteractiveAuthResponse::InfoRequest { .. } => "InfoRequest",
                    });
                resp
            }
            Err(e) => {
                debug_log!("[SSH-MFA] authenticate_keyboard_interactive_start error: {}", e);
                return Err(e.into());
            }
        };

        // 处理多轮交互
        debug_log!("[SSH-MFA] Entering response loop...");
        loop {
            match kbi_response {
                KeyboardInteractiveAuthResponse::Success => {
                    debug_log!("[SSH-MFA] Keyboard-interactive authentication succeeded");
                    return Ok(true);
                }
                KeyboardInteractiveAuthResponse::Failure { .. } => {
                    debug_log!("[SSH-MFA] Keyboard-interactive authentication failed");
                    return Ok(false);
                }
                KeyboardInteractiveAuthResponse::InfoRequest { name, instructions, prompts } => {
                    debug_log!("[SSH-MFA] Received InfoRequest: name='{}', instructions='{}', prompts={}", 
                        name, instructions, prompts.len());

                    // 如果没有提示，发送空响应继续
                    if prompts.is_empty() {
                        debug_log!("[SSH-MFA] Empty prompts, sending empty response");
                        kbi_response = session
                            .authenticate_keyboard_interactive_respond(vec![])
                            .await?;
                        continue;
                    }

                    // 创建用于等待前端响应的 oneshot 通道
                    let (tx, rx) = tokio::sync::oneshot::channel::<Vec<String>>();
                    
                    // 将发送端存入全局 map
                    {
                        let mut channels = mfa_channels.lock().await;
                        channels.insert(terminal_id.to_string(), tx);
                    }

                    // 构建 MFA 提示 payload
                    let mfa_prompts: Vec<MfaPrompt> = prompts
                        .iter()
                        .map(|p| MfaPrompt {
                            prompt: p.prompt.clone(),
                            echo: p.echo,
                        })
                        .collect();

                    let payload = MfaPromptPayload {
                        terminal_id: terminal_id.to_string(),
                        name: name.clone(),
                        instructions: instructions.clone(),
                        prompts: mfa_prompts,
                    };

                    // 向前端发送 MFA 提示事件
                    debug_log!("[SSH-MFA] Emitting ssh-mfa-prompt event to frontend");
                    app_handle.emit("ssh-mfa-prompt", &payload)?;

                    // 等待前端响应（带超时）
                    debug_log!("[SSH-MFA] Waiting for frontend MFA response...");
                    let responses = tokio::time::timeout(
                        std::time::Duration::from_secs(120), // 2 分钟超时
                        rx
                    ).await;

                    let responses = match responses {
                        Ok(Ok(r)) => {
                            debug_log!("[SSH-MFA] Received {} responses from frontend", r.len());
                            r
                        }
                        Ok(Err(_)) => {
                            // 通道被关闭（用户取消）
                            debug_log!("[SSH-MFA] MFA cancelled by user");
                            return Err("MFA authentication cancelled by user".into());
                        }
                        Err(_) => {
                            // 超时
                            debug_log!("[SSH-MFA] MFA response timeout");
                            // 清理通道
                            mfa_channels.lock().await.remove(terminal_id);
                            return Err("MFA authentication timeout".into());
                        }
                    };

                    // 发送响应给服务器
                    debug_log!("[SSH-MFA] Sending responses to server");
                    kbi_response = session
                        .authenticate_keyboard_interactive_respond(responses)
                        .await?;
                }
            }
        }
    }
}
