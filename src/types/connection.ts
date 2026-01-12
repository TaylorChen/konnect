// 连接类型枚举（必须与后端 Rust 枚举值完全匹配）
export enum ConnectionType {
    Local = 'Local',
    SSH = 'Ssh',      // 注意：值是 'Ssh'（首字母大写），与 Rust 枚举匹配
    Telnet = 'Telnet',
    Serial = 'Serial',
}

export interface SshConfig {
    host: string;
    port: number;
    username: string;
    auth: SshAuth;
}

export type SshAuth =
    | { Password: string }
    | { PublicKey: { private_key_path: string; passphrase?: string } };

export interface Connection {
    id: string;
    name: string;
    connection_type: ConnectionType;
    ssh_config?: SshConfig;
}

// 辅助函数：创建密码认证的 SshAuth
export function createPasswordAuth(password: string): SshAuth {
    return { Password: password };
}

// 辅助函数：创建公钥认证的 SshAuth
export function createPublicKeyAuth(
    privateKeyPath: string,
    passphrase?: string
): SshAuth {
    return {
        PublicKey: {
            private_key_path: privateKeyPath,
            passphrase,
        },
    };
}

// 辅助函数：创建本地连接
export function createLocalConnection(name: string): Connection {
    return {
        id: `local-${Date.now()}`,
        name,
        connection_type: ConnectionType.Local,
    };
}

// 辅助函数：创建 SSH 连接
export function createSshConnection(
    name: string,
    sshConfig: SshConfig
): Connection {
    return {
        id: `ssh-${Date.now()}`,
        name,
        connection_type: ConnectionType.SSH,
        ssh_config: sshConfig,
    };
}
