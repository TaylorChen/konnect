// SFTP 相关类型定义

export interface FileEntry {
    name: string;
    is_dir: boolean;
    size: number;
    permissions?: string;
    modified?: number;
}

export interface SftpState {
    isConnected: boolean;
    currentPath: string;
    files: FileEntry[];
    loading: boolean;
    error?: string;
}
