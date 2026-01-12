// 终端会话类型定义

import { ConnectionType, SshConfig } from './connection';

export interface TerminalSession {
    id: string;
    name: string;
    connectionType: ConnectionType;  // 新增
    shell?: string;  // 本地终端使用
    sshConfig?: SshConfig;  // SSH 连接使用
    createdAt: number;
    isActive: boolean;
}


export interface TerminalConfig {
    defaultShell: string;
    fontSize: number;
    fontFamily: string;
    theme: 'warp' | 'dracula' | 'solarized';
}

export interface PtyConfig {
    terminal_type: string;
    id: string;
    shell: string;
    cols: number;
    rows: number;
}
