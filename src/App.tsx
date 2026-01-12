import { useState, useEffect, useCallback, useRef } from "react";
import { Terminal } from "./components/Terminal";
import { ConnectionDialog } from "./components/ConnectionDialog";
import { useTerminalStore } from "./store/terminalStore";
import { TerminalSession } from "./types/terminal";
import { Connection, ConnectionType, SshConfig } from "./types/connection";
import { invoke } from "@tauri-apps/api/core";

function App() {
  const { sessions, activeSessionId, addSession, removeSession, setActiveSession, updateSession } = useTerminalStore();
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
  const [showSavedMenu, setShowSavedMenu] = useState(false);
  const [savedConnections, setSavedConnections] = useState<Connection[]>([]);
  const initializedRef = useRef(false);

  // 标签页重命名状态
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // 加载已保存的连接
  useEffect(() => {
    loadSavedConnections();
  }, []);

  const loadSavedConnections = async () => {
    try {
      const connections = await invoke<Connection[]>('load_connections');
      console.log('[App] Loaded connections:', connections);
      setSavedConnections(connections);
    } catch (error) {
      console.error('[App] Failed to load connections:', error);
    }
  };

  const createNewTerminal = useCallback(() => {
    const newSession: TerminalSession = {
      id: `terminal-${Date.now()}`,
      name: `Terminal ${sessions.length + 1}`,
      connectionType: ConnectionType.Local,
      shell: '/bin/zsh',
      createdAt: Date.now(),
      isActive: true,
    };
    addSession(newSession);
  }, [sessions.length, addSession]);

  // 启动时自动创建一个终端
  useEffect(() => {
    // 延迟一小会儿，确保 Zustand persist 已经同步完成
    // 实际上 Zustand persist 是同步从 localStorage 读取的，但为了安全起见或者处理某些异步场景
    const timer = setTimeout(() => {
      if (!initializedRef.current && useTerminalStore.getState().sessions.length === 0) {
        initializedRef.current = true;
        const newSession: TerminalSession = {
          id: `terminal-${Date.now()}`,
          name: 'Terminal 1',
          connectionType: ConnectionType.Local,
          shell: '/bin/zsh',
          createdAt: Date.now(),
          isActive: true,
        };
        addSession(newSession);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [addSession]);

  const handleNewConnection = useCallback(async (name: string, connectionType: ConnectionType, sshConfig?: SshConfig) => {
    const connection: Connection = {
      id: `${connectionType.toLowerCase()}-${Date.now()}`,
      name,
      connection_type: connectionType,
      ssh_config: sshConfig,
    };

    // 保存连接配置
    try {
      await invoke('save_connection', { connection });
      await loadSavedConnections();
      console.log('[App] Connection saved successfully');
    } catch (error) {
      console.error('[App] Failed to save connection:', error);
    }

    // 创建终端会话
    const newSession: TerminalSession = {
      id: connection.id,
      name,
      connectionType,
      shell: connectionType === ConnectionType.Local ? '/bin/zsh' : undefined,
      sshConfig,
      createdAt: Date.now(),
      isActive: true,
    };
    addSession(newSession);
  }, [addSession, loadSavedConnections]);

  const handleQuickConnect = useCallback((connection: Connection) => {
    // 从已保存的连接创建终端会话
    const newSession: TerminalSession = {
      id: `${connection.connection_type.toLowerCase()}-${Date.now()}`,
      name: connection.name,
      connectionType: connection.connection_type,
      shell: connection.connection_type === ConnectionType.Local ? '/bin/zsh' : undefined,
      sshConfig: connection.ssh_config,
      createdAt: Date.now(),
      isActive: true,
    };
    addSession(newSession);
  }, [addSession]);

  const handleDeleteConnection = async (id: string) => {
    try {
      await invoke('delete_connection', { id });
      await loadSavedConnections();
      console.log('[App] Connection deleted successfully');
    } catch (error) {
      console.error('[App] Failed to delete connection:', error);
    }
  };

  const handleCloseTerminal = useCallback((id: string) => {
    removeSession(id);
  }, [removeSession]);

  // 更新连接
  const handleUpdateConnection = useCallback(async (name: string, connectionType: ConnectionType, sshConfig?: SshConfig) => {
    if (!editingConnection) return;

    const updatedConnection: Connection = {
      ...editingConnection,
      name,
      connection_type: connectionType,
      ssh_config: sshConfig,
    };

    try {
      await invoke('update_connection', { connection: updatedConnection });
      await loadSavedConnections();
      console.log('[App] Connection updated successfully');
    } catch (error) {
      console.error('[App] Failed to update connection:', error);
    }

    setEditingConnection(null);
    setShowConnectionDialog(false);
  }, [editingConnection]);

  // 标签页双击重命名
  const handleTabDoubleClick = useCallback((sessionId: string, currentName: string) => {
    setEditingTabId(sessionId);
    setEditingTabName(currentName);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }, []);

  const handleRenameSubmit = useCallback(() => {
    if (editingTabId && editingTabName.trim()) {
      updateSession(editingTabId, { name: editingTabName.trim() });
    }
    setEditingTabId(null);
  }, [editingTabId, editingTabName, updateSession]);

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setEditingTabId(null);
    }
  }, [handleRenameSubmit]);


  return (
    <div className="flex h-screen bg-[#0D0D11] text-white">
      {/* 主内容区域 */}
      <div className="flex flex-col flex-1">
        <div className="flex items-center justify-between bg-[#1A1A1F] px-4 py-2 border-b border-gray-800">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mr-4">
              Konnect
            </h1>

            <button
              onClick={createNewTerminal}
              className="px-3 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2"
            >
              <span>+</span>
              <span>New Terminal</span>
            </button>
            <button
              onClick={() => setShowConnectionDialog(true)}
              className="px-3 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2"
            >
              <span>🔌</span>
              <span>New Connection</span>
            </button>

            {/* 已保存连接下拉菜单 */}
            <div className="relative">
              <button
                onClick={() => setShowSavedMenu(!showSavedMenu)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${showSavedMenu ? 'bg-gray-700 text-white' : 'bg-gray-800/50 hover:bg-gray-700 text-gray-400 hover:text-white'
                  }`}
              >
                <span>📂</span>
                <span>Saved Connections</span>
                <span className="text-[10px] ml-1 opacity-50">{showSavedMenu ? '▲' : '▼'}</span>
              </button>

              {showSavedMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowSavedMenu(false)}
                  />
                  <div className="absolute left-0 mt-2 w-64 bg-[#1A1A1F] border border-gray-800 rounded-xl shadow-2xl z-20 py-2 animate-in fade-in zoom-in duration-200">
                    <div className="px-4 py-2 border-b border-gray-800 flex justify-between items-center">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Saved Connections</span>
                      {savedConnections.length > 0 && (
                        <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full">
                          {savedConnections.length}
                        </span>
                      )}
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto">
                      {savedConnections.length === 0 ? (
                        <div className="px-4 py-8 text-center">
                          <p className="text-sm text-gray-500">No saved connections</p>
                        </div>
                      ) : (
                        <div className="p-1">
                          {savedConnections.map((conn) => (
                            <div key={conn.id} className="group relative">
                              <button
                                onClick={() => {
                                  handleQuickConnect(conn);
                                  setShowSavedMenu(false);
                                }}
                                className="w-full px-3 py-2 flex items-start gap-3 text-left rounded-lg hover:bg-white/5 transition-colors"
                              >
                                <span className="text-lg mt-0.5 flex-shrink-0">
                                  {conn.connection_type === ConnectionType.SSH ? '🔐' :
                                    conn.connection_type === ConnectionType.Local ? '💻' :
                                      conn.connection_type === ConnectionType.Telnet ? '📡' : '🔌'}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-gray-200 truncate">
                                    {conn.name}
                                  </div>
                                  <div className="text-[10px] text-gray-500 truncate">
                                    {conn.ssh_config ? `${conn.ssh_config.username}@${conn.ssh_config.host}` : conn.connection_type}
                                  </div>
                                </div>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingConnection(conn);
                                  setShowConnectionDialog(true);
                                  setShowSavedMenu(false);
                                }}
                                className="absolute right-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-blue-500/20 text-blue-400"
                                title="Edit"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`Are you sure you want to delete "${conn.name}"?`)) {
                                    handleDeleteConnection(conn.id);
                                  }
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-red-500/20 text-red-400"
                                title="Delete"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className="text-xs text-gray-500 font-mono">
              {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
            </div>
          </div>
        </div>

        {sessions.length > 0 && (
          <div className="flex items-center bg-[#16161B] border-b border-gray-800 overflow-x-auto">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`flex items-center space-x-2 px-4 py-2 border-r border-gray-800 cursor-pointer transition-colors ${session.id === activeSessionId
                  ? 'bg-[#0D0D11] text-white'
                  : 'text-gray-400 hover:bg-[#1A1A1F] hover:text-gray-300'
                  }`}
                onClick={() => setActiveSession(session.id)}
                onDoubleClick={() => handleTabDoubleClick(session.id, session.name)}
              >
                {editingTabId === session.id ? (
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={editingTabName}
                    onChange={(e) => setEditingTabName(e.target.value)}
                    onBlur={handleRenameSubmit}
                    onKeyDown={handleRenameKeyDown}
                    className="bg-transparent border border-cyan-500 rounded px-1 text-sm w-24 outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="text-sm">{session.name}</span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseTerminal(session.id);
                  }}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`h-full ${session.id === activeSessionId ? 'block' : 'hidden'}`}
            >
              <Terminal
                terminalId={session.id}
                connectionType={session.connectionType}
                shell={session.shell}
                sshConfig={session.sshConfig}
                onClose={() => handleCloseTerminal(session.id)}
              />
            </div>
          ))}
        </div>
      </div>

      <ConnectionDialog
        isOpen={showConnectionDialog}
        onClose={() => {
          setShowConnectionDialog(false);
          setEditingConnection(null);
        }}
        onSave={editingConnection ? handleUpdateConnection : handleNewConnection}
        editConnection={editingConnection}
      />
    </div>
  );
}

export default App;
