import { useEffect, useRef, useState } from 'react';
import { Terminal as XTermTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import '@xterm/xterm/css/xterm.css';
import { ConnectionType, SshConfig, Connection } from '../types/connection';
import { MfaPromptPayload } from '../types/mfa';
import { SftpExplorer } from './SftpExplorer';
import { MfaDialog } from './MfaDialog';

// 模块级的 Set，用于追踪已创建后端 session 的终端 ID
// 这可以防止 React StrictMode 双重渲染导致的重复创建
const createdSessionIds = new Set<string>();

// 追踪正在进行的 cleanup 操作，用于处理 StrictMode 快速卸载/重新挂载
const pendingCleanups = new Map<string, ReturnType<typeof setTimeout>>();


interface TerminalProps {
    terminalId: string;
    connectionType: ConnectionType;
    shell?: string;
    sshConfig?: SshConfig;
    onClose?: () => void;
}

export const Terminal: React.FC<TerminalProps> = ({
    terminalId,
    connectionType,
    shell = '/bin/zsh',
    sshConfig,
    onClose
}) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTermTerminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const isInitializedRef = useRef(false);
    const isReadyRef = useRef(false);
    const onCloseRef = useRef(onClose);
    const [showSftp, setShowSftp] = useState(false);
    // MFA 状态
    const [mfaPrompt, setMfaPrompt] = useState<MfaPromptPayload | null>(null);


    // 同步最新的 onClose 回调
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!terminalRef.current || isInitializedRef.current) return;
        isInitializedRef.current = true;

        // Warp 风格的主题配置
        const term = new XTermTerminal({
            cursorBlink: true,
            cursorStyle: 'block',
            fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", Menlo, Monaco, "Courier New", monospace',
            fontSize: 14,
            theme: {
                background: '#0D0D11',
                foreground: '#E0E0E0',
                cursor: '#00D4FF',
                cursorAccent: '#0D0D11',
                selectionBackground: '#264F78',
                black: '#0D0D11',
                red: '#FF6B6B',
                green: '#4ECDC4',
                yellow: '#FFE66D',
                blue: '#00D4FF',
                magenta: '#FF8CC6',
                cyan: '#00F5FF',
                white: '#E0E0E0',
                brightBlack: '#6B7280',
                brightRed: '#FF8A80',
                brightGreen: '#69F0AE',
                brightYellow: '#FFD740',
                brightBlue: '#40C4FF',
                brightMagenta: '#FFB3E6',
                brightCyan: '#64FFDA',
                brightWhite: '#FFFFFF',
            },
            allowProposedApi: true,
        });

        const fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon();

        term.loadAddon(fitAddon);
        term.loadAddon(webLinksAddon);
        term.open(terminalRef.current);

        // 初始延迟后调整尺寸
        setTimeout(() => {
            fitAddon.fit();
            isReadyRef.current = true;
            console.log('[Terminal] Terminal is now ready for input');
        }, 100);

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        // 根据连接类型创建相应的后端会话
        const createSession = async () => {
            // 如果有待执行的 cleanup，取消它（处理 StrictMode 快速卸载/重新挂载）
            const pendingCleanup = pendingCleanups.get(terminalId);
            if (pendingCleanup) {
                clearTimeout(pendingCleanup);
                pendingCleanups.delete(terminalId);
                console.log(`[Terminal] Cancelled pending cleanup for ${terminalId}`);
            }

            // 检查是否已经创建过后端 session
            if (createdSessionIds.has(terminalId)) {
                console.log(`[Terminal] Session ${terminalId} already exists, skipping backend creation`);
                return;
            }

            try {
                if (connectionType === ConnectionType.SSH) {
                    if (!sshConfig) {
                        console.error('SSH config is required for SSH connection');
                        term.write('\r\n\x1b[1;31mError: SSH config is missing\x1b[0m\r\n');
                        return;
                    }

                    // 创建 SSH 连接
                    const connection: Connection = {
                        id: terminalId,
                        name: 'SSH Session',
                        connection_type: connectionType,
                        ssh_config: sshConfig,
                    };

                    console.log('[Frontend] Creating SSH terminal with config:', JSON.stringify(connection, null, 2));
                    await invoke('create_ssh_terminal', { config: connection });
                    console.log('[Frontend] SSH terminal created successfully');
                } else {
                    // 创建本地终端
                    console.log(`[Terminal] Creating backend session for ${terminalId}`);
                    await invoke('create_terminal', {
                        config: {
                            id: terminalId,
                            shell,
                            cols: term.cols,
                            rows: term.rows,
                        }
                    });
                }
                // 标记为已创建
                createdSessionIds.add(terminalId);
            } catch (error) {
                console.error(`[Frontend] Failed to create ${connectionType} terminal:`, error);
                term.write(`\r\n\x1b[1;31mError: Failed to create ${connectionType} session\x1b[0m\r\n`);
            }
        };

        createSession();

        // 监听后端输出
        let unlistenOutput: UnlistenFn;
        listen<string>(`terminal-output-${terminalId}`, (event) => {
            term.write(event.payload);
        }).then((unlisten) => {
            unlistenOutput = unlisten;
        });

        // 监听终端退出事件
        let unlistenExit: UnlistenFn;
        listen(`terminal-exit-${terminalId}`, () => {
            console.log(`Terminal ${terminalId} exited`);
            if (onCloseRef.current) {
                onCloseRef.current();
            }
        }).then((unlisten) => {
            unlistenExit = unlisten;
        });

        // 监听 SSH MFA 提示事件
        let unlistenMfa: UnlistenFn;
        if (connectionType === ConnectionType.SSH) {
            listen<MfaPromptPayload>('ssh-mfa-prompt', (event) => {
                console.log('[Terminal] Received MFA prompt:', event.payload);
                // 只处理当前终端的 MFA 请求
                if (event.payload.terminal_id === terminalId) {
                    setMfaPrompt(event.payload);
                }
            }).then((unlisten) => {
                unlistenMfa = unlisten;
            });
        }

        // 监听用户输入
        const disposable = term.onData((data) => {
            if (!isReadyRef.current) {
                console.log('[Terminal] onData fired but terminal not ready yet');
                return;
            }

            const writeCommand = connectionType === ConnectionType.SSH
                ? 'write_to_ssh_terminal'
                : 'write_to_terminal';

            console.log(`[Terminal] Sending input to ${connectionType} (${terminalId}): len=${data.length}`);

            invoke(writeCommand, {
                id: terminalId,
                data
            }).catch((error) => {
                console.error(`[Terminal] Failed to write to ${connectionType} terminal:`, error);
            });
        });

        // 窗口大小调整
        const handleResize = () => {
            if (fitAddonRef.current && xtermRef.current) {
                fitAddon.fit();

                const resizeCommand = connectionType === ConnectionType.SSH
                    ? 'resize_ssh_terminal'
                    : 'resize_terminal';

                invoke(resizeCommand, {
                    id: terminalId,
                    rows: xtermRef.current.rows,
                    cols: xtermRef.current.cols
                }).catch((error) => {
                    console.error(`Failed to resize ${connectionType} terminal:`, error);
                });
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            if (unlistenOutput) unlistenOutput();
            if (unlistenExit) unlistenExit();
            if (unlistenMfa) unlistenMfa();
            disposable.dispose();
            window.removeEventListener('resize', handleResize);
            term.dispose();
            isInitializedRef.current = false;

            // 延迟关闭后端 session，以处理 React StrictMode 的快速卸载/重新挂载
            // 如果组件在延迟期间重新挂载，createSession 会取消这个 cleanup
            const closeCommand = connectionType === ConnectionType.SSH
                ? 'close_ssh_terminal'
                : 'close_terminal';

            const cleanupTimeout = setTimeout(() => {
                pendingCleanups.delete(terminalId);
                createdSessionIds.delete(terminalId);
                console.log(`[Terminal] Closing backend session for ${terminalId}`);
                invoke(closeCommand, { id: terminalId }).catch(console.error);
            }, 100); // 100ms 延迟，足够 StrictMode 重新挂载

            pendingCleanups.set(terminalId, cleanupTimeout);
        };

    }, [terminalId, shell, connectionType, sshConfig]);

    // 当 SFTP 面板切换时重新计算终端尺寸
    useEffect(() => {
        if (fitAddonRef.current && xtermRef.current) {
            // 延迟执行以等待 CSS 过渡完成
            const timer = setTimeout(() => {
                fitAddonRef.current?.fit();
            }, 350);
            return () => clearTimeout(timer);
        }
    }, [showSftp]);

    // MFA 响应处理
    const handleMfaSubmit = async (responses: string[]) => {
        console.log('[Terminal] Submitting MFA response:', responses.length, 'items');
        try {
            await invoke('submit_ssh_mfa_response', {
                terminalId,
                responses,
            });
            setMfaPrompt(null);
        } catch (error) {
            console.error('[Terminal] Failed to submit MFA response:', error);
            // 仍然关闭对话框，错误会通过后端处理
            setMfaPrompt(null);
        }
    };

    const handleMfaCancel = async () => {
        console.log('[Terminal] Cancelling MFA');
        try {
            await invoke('cancel_ssh_mfa', { terminalId });
        } catch (error) {
            console.error('[Terminal] Failed to cancel MFA:', error);
        }
        setMfaPrompt(null);
    };

    return (
        <div className="relative w-full h-full flex bg-[#0D0D11]">
            {/* 终端容器 */}
            <div className={`flex flex-col ${showSftp ? 'w-1/2' : 'w-full'} h-full transition-all duration-300`}>
                {/* SSH 连接时显示 SFTP 入口按钮 */}
                {connectionType === ConnectionType.SSH && (
                    <div className="flex items-center px-3 py-1.5 bg-[#16161B] border-b border-gray-800">
                        <button
                            onClick={() => setShowSftp(!showSftp)}
                            className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center space-x-1.5 ${showSftp
                                ? 'bg-cyan-500/20 text-cyan-400'
                                : 'bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white'
                                }`}
                        >
                            <span>📁</span>
                            <span>Files</span>
                        </button>
                    </div>
                )}
                <div
                    ref={terminalRef}
                    className="flex-1 p-2"
                    style={{ height: '100%', width: '100%' }}
                />
            </div>

            {/* SFTP 侧边栅 */}
            {showSftp && connectionType === ConnectionType.SSH && sshConfig && (
                <div className="w-1/2 h-full">
                    <SftpExplorer
                        sessionId={`sftp-${terminalId}`}
                        connection={{
                            id: `sftp-${terminalId}`,
                            name: 'SFTP Session',
                            connection_type: connectionType,
                            ssh_config: sshConfig,
                        }}
                        onClose={() => setShowSftp(false)}
                    />
                </div>
            )}

            {/* MFA 验证对话框 */}
            <MfaDialog
                isOpen={mfaPrompt !== null}
                promptData={mfaPrompt}
                onSubmit={handleMfaSubmit}
                onCancel={handleMfaCancel}
            />
        </div>
    );
};
