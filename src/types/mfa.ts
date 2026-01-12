/**
 * MFA (Multi-Factor Authentication) 类型定义
 * 用于 SSH keyboard-interactive 认证
 */

/** 单个 MFA 提示项 */
export interface MfaPrompt {
    /** 提示文本，如 "Verification code:" */
    prompt: string;
    /** 是否回显用户输入（false 表示密码类型输入） */
    echo: boolean;
}

/** 后端发送的 MFA 提示事件 payload */
export interface MfaPromptPayload {
    /** 关联的终端 ID */
    terminal_id: string;
    /** 认证名称（通常为空或服务器名） */
    name: string;
    /** 认证说明（通常为空或包含额外说明） */
    instructions: string;
    /** 提示列表，用户需要为每个提示提供输入 */
    prompts: MfaPrompt[];
}
