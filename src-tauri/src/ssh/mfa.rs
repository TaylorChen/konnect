use serde::{Deserialize, Serialize};

/// MFA 提示信息，发送到前端
#[derive(Debug, Clone, Serialize)]
pub struct MfaPromptPayload {
    pub terminal_id: String,
    pub name: String,
    pub instructions: String,
    pub prompts: Vec<MfaPrompt>,
}

/// 单个 MFA 提示项
#[derive(Debug, Clone, Serialize)]
pub struct MfaPrompt {
    pub prompt: String,
    /// 是否应该回显用户输入（false 表示密码类型输入）
    pub echo: bool,
}

/// 前端提交的 MFA 响应
#[derive(Debug, Clone, Deserialize)]
pub struct MfaResponse {
    pub terminal_id: String,
    pub responses: Vec<String>,
}
