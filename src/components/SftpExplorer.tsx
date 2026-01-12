import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save, open } from '@tauri-apps/plugin-dialog';
import { FileEntry } from '../types/sftp';
import { Connection } from '../types/connection';

interface SftpExplorerProps {
    sessionId: string;
    connection: Connection;
    onClose: () => void;
}

export const SftpExplorer: React.FC<SftpExplorerProps> = ({
    sessionId,
    connection,
    onClose
}) => {
    const [currentPath, setCurrentPath] = useState('/');
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [transferring, setTransferring] = useState<string | null>(null);

    // Connect to SFTP
    const connect = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            await invoke('sftp_connect', { config: connection });
            setIsConnected(true);
            // Load root directory after connection
            await loadDirectory('/');
        } catch (err) {
            setError(`Connection failed: ${err}`);
        } finally {
            setLoading(false);
        }
    }, [connection]);

    // Load directory
    const loadDirectory = useCallback(async (path: string) => {
        setLoading(true);
        setError(null);
        try {
            const entries = await invoke<FileEntry[]>('sftp_list_dir', {
                id: sessionId,
                path
            });
            // Sort: directories first, files second
            const sorted = entries.sort((a, b) => {
                if (a.is_dir && !b.is_dir) return -1;
                if (!a.is_dir && b.is_dir) return 1;
                return a.name.localeCompare(b.name);
            });
            setFiles(sorted);
            setCurrentPath(path);
        } catch (err) {
            setError(`Failed to load directory: ${err}`);
        } finally {
            setLoading(false);
        }
    }, [sessionId]);

    // Enter directory
    const enterDirectory = useCallback((name: string) => {
        const newPath = currentPath === '/'
            ? `/${name}`
            : `${currentPath}/${name}`;
        loadDirectory(newPath);
    }, [currentPath, loadDirectory]);

    // Go up one level
    const goUp = useCallback(() => {
        if (currentPath === '/') return;
        const parts = currentPath.split('/').filter(Boolean);
        parts.pop();
        const newPath = parts.length === 0 ? '/' : `/${parts.join('/')}`;
        loadDirectory(newPath);
    }, [currentPath, loadDirectory]);

    // Download file
    const handleDownload = useCallback(async (entry: FileEntry) => {
        if (entry.is_dir) return;

        try {
            // Select save location
            const localPath = await save({
                defaultPath: entry.name,
                title: 'Save file to...',
            });

            if (!localPath) return; // User cancelled

            setTransferring(`Downloading: ${entry.name}`);
            const remotePath = currentPath === '/'
                ? `/${entry.name}`
                : `${currentPath}/${entry.name}`;

            await invoke('sftp_download_file', {
                id: sessionId,
                remotePath,
                localPath
            });

            setTransferring(null);
            setError(null);
        } catch (err) {
            setTransferring(null);
            setError(`Download failed: ${err}`);
        }
    }, [sessionId, currentPath]);

    // Upload file
    const handleUpload = useCallback(async () => {
        try {
            // Select file to upload
            const selected = await open({
                multiple: false,
                title: 'Select file to upload',
            });

            if (!selected) return; // User cancelled

            const localPath = selected as string;
            const fileName = localPath.split('/').pop() || 'uploaded_file';
            const remotePath = currentPath === '/'
                ? `/${fileName}`
                : `${currentPath}/${fileName}`;

            setTransferring(`Uploading: ${fileName}`);

            await invoke('sftp_upload_file', {
                id: sessionId,
                localPath,
                remotePath
            });

            setTransferring(null);
            setError(null);
            // Refresh directory
            await loadDirectory(currentPath);
        } catch (err) {
            setTransferring(null);
            setError(`Upload failed: ${err}`);
        }
    }, [sessionId, currentPath, loadDirectory]);

    // Delete file/directory
    const handleDelete = useCallback(async (entry: FileEntry) => {
        if (!confirm(`Are you sure you want to delete "${entry.name}"?`)) return;

        try {
            const fullPath = currentPath === '/'
                ? `/${entry.name}`
                : `${currentPath}/${entry.name}`;
            await invoke('sftp_remove', {
                id: sessionId,
                path: fullPath,
                isDir: entry.is_dir
            });
            await loadDirectory(currentPath);
        } catch (err) {
            setError(`Delete failed: ${err}`);
        }
    }, [sessionId, currentPath, loadDirectory]);

    // Format file size
    const formatSize = (size: number): string => {
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
        if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
        return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
    };

    // Initialize connection
    useEffect(() => {
        connect();
        return () => {
            // Disconnect
            invoke('sftp_disconnect', { id: sessionId }).catch(console.error);
        };
    }, [connect, sessionId]);

    return (
        <div className="flex flex-col h-full bg-[#1A1A1F] border-l border-gray-800">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                <div className="flex items-center space-x-2">
                    <span className="text-lg">📁</span>
                    <span className="text-sm font-medium text-white">SFTP File Manager</span>
                </div>
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-white transition-colors"
                >
                    ✕
                </button>
            </div>

            {/* Toolbar */}
            <div className="flex items-center px-4 py-2 bg-[#16161B] border-b border-gray-800 gap-2">
                <button
                    onClick={goUp}
                    disabled={currentPath === '/'}
                    className="px-2 py-1 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Go up"
                >
                    ⬆️
                </button>
                <div className="flex-1 text-sm text-gray-400 font-mono truncate">
                    {currentPath}
                </div>
                <button
                    onClick={handleUpload}
                    disabled={!!transferring}
                    className="px-3 py-1 text-sm bg-cyan-600 hover:bg-cyan-500 text-white rounded disabled:opacity-50 flex items-center gap-1"
                    title="Upload file"
                >
                    <span>📤</span>
                    <span>Upload</span>
                </button>
                <button
                    onClick={() => loadDirectory(currentPath)}
                    className="px-2 py-1 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded"
                    title="Refresh"
                >
                    🔄
                </button>
            </div>

            {/* Transfer status */}
            {transferring && (
                <div className="px-4 py-2 bg-blue-500/20 text-blue-400 text-sm flex items-center">
                    <span className="animate-spin mr-2">⏳</span>
                    {transferring}
                </div>
            )}

            {/* Error message */}
            {error && (
                <div className="px-4 py-2 bg-red-500/20 text-red-400 text-sm">
                    {error}
                </div>
            )}

            {/* File list */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center h-32 text-gray-500">
                        <span className="animate-spin mr-2">⏳</span>
                        Loading...
                    </div>
                ) : files.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-gray-500">
                        Directory is empty
                    </div>
                ) : (
                    <div className="divide-y divide-gray-800/50">
                        {files.map((entry) => (
                            <div
                                key={entry.name}
                                className="flex items-center px-4 py-2 hover:bg-white/5 cursor-pointer group"
                                onClick={() => {
                                    if (entry.is_dir) {
                                        enterDirectory(entry.name);
                                    }
                                }}
                            >
                                <span className="text-lg mr-3">
                                    {entry.is_dir ? '📂' : '📄'}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm text-gray-200 truncate">
                                        {entry.name}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {entry.is_dir ? 'Directory' : formatSize(entry.size)}
                                        {entry.permissions && ` • ${entry.permissions}`}
                                    </div>
                                </div>
                                {/* Action buttons */}
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {!entry.is_dir && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDownload(entry);
                                            }}
                                            className="px-2 py-1 text-xs text-cyan-400 hover:bg-cyan-500/20 rounded"
                                            title="Download"
                                        >
                                            📥
                                        </button>
                                    )}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(entry);
                                        }}
                                        className="px-2 py-1 text-xs text-red-400 hover:bg-red-500/20 rounded"
                                        title="Delete"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Status bar */}
            <div className="px-4 py-2 border-t border-gray-800 text-xs text-gray-500">
                {isConnected ? (
                    <span className="text-green-400">● Connected</span>
                ) : (
                    <span className="text-gray-400">○ Disconnected</span>
                )}
                <span className="ml-4">{files.length} items</span>
            </div>
        </div>
    );
};
