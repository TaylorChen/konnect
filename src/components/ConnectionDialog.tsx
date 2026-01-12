import React, { useState, useEffect } from 'react';
import {
    Connection,
    ConnectionType,
    SshConfig,
    createPasswordAuth,
    createPublicKeyAuth,
} from '../types/connection';

interface ConnectionDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (name: string, connectionType: ConnectionType, sshConfig?: SshConfig) => void;
    editConnection?: Connection | null;
}

export const ConnectionDialog: React.FC<ConnectionDialogProps> = ({
    isOpen,
    onClose,
    onSave,
    editConnection,
}) => {
    const [connectionType, setConnectionType] = useState<ConnectionType>(ConnectionType.Local);
    const [name, setName] = useState('');

    // SSH config fields
    const [host, setHost] = useState('');
    const [portInput, setPortInput] = useState('22');
    const [username, setUsername] = useState('');

    // Authentication method
    const [authType, setAuthType] = useState<'password' | 'publickey'>('password');
    const [password, setPassword] = useState('');
    const [privateKeyPath, setPrivateKeyPath] = useState('');
    const [passphrase, setPassphrase] = useState('');

    // 编辑模式：预填充表单
    useEffect(() => {
        if (editConnection) {
            setName(editConnection.name);
            setConnectionType(editConnection.connection_type);

            if (editConnection.ssh_config) {
                setHost(editConnection.ssh_config.host);
                setPortInput(editConnection.ssh_config.port.toString());
                setUsername(editConnection.ssh_config.username);

                // 判断认证类型
                const auth = editConnection.ssh_config.auth;
                if ('Password' in auth) {
                    setAuthType('password');
                    setPassword(auth.Password);
                } else if ('PublicKey' in auth) {
                    setAuthType('publickey');
                    setPrivateKeyPath(auth.PublicKey.private_key_path);
                    setPassphrase(auth.PublicKey.passphrase || '');
                }
            }
        } else {
            // 新建模式：重置表单
            setName('');
            setConnectionType(ConnectionType.Local);
            setHost('');
            setPortInput('22');
            setUsername('');
            setAuthType('password');
            setPassword('');
            setPrivateKeyPath('');
            setPassphrase('');
        }
    }, [editConnection, isOpen]);

    // Validate port on blur
    const handlePortBlur = () => {
        const portNum = parseInt(portInput, 10);

        if (portInput === '' || isNaN(portNum)) {
            setPortInput('22');
        } else if (portNum < 1) {
            setPortInput('1');
        } else if (portNum > 65535) {
            setPortInput('65535');
        }
    };

    // Get valid port number for saving
    const getPortNumber = (): number => {
        const portNum = parseInt(portInput, 10);
        if (isNaN(portNum) || portNum < 1) return 22;
        if (portNum > 65535) return 65535;
        return portNum;
    };

    const handleSave = () => {
        if (!name.trim()) {
            alert('Please enter a connection name');
            return;
        }

        if (connectionType === ConnectionType.SSH) {
            if (!host.trim() || !username.trim()) {
                alert('Please enter host address and username');
                return;
            }

            const port = getPortNumber();

            if (port < 1 || port > 65535) {
                alert('Port must be between 1-65535');
                return;
            }

            if (authType === 'password' && !password.trim()) {
                alert('Please enter password');
                return;
            }

            if (authType === 'publickey' && !privateKeyPath.trim()) {
                alert('Please select private key file');
                return;
            }

            const auth = authType === 'password'
                ? createPasswordAuth(password)
                : createPublicKeyAuth(privateKeyPath.trim(), passphrase.trim() || undefined);

            const sshConfig: SshConfig = {
                host: host.trim(),
                port,
                username: username.trim(),
                auth,
            };

            onSave(name.trim(), connectionType, sshConfig);
        } else {
            onSave(name.trim(), connectionType);
        }

        // Reset form
        setName('');
        setHost('');
        setPortInput('22');
        setUsername('');
        setAuthType('password');
        setPassword('');
        setPrivateKeyPath('');
        setPassphrase('');
        onClose();
    };

    if (!isOpen) return null;

    const isEditMode = !!editConnection;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-[#1A1A1F] rounded-xl border border-gray-800 p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold mb-4 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                    {isEditMode ? 'Edit Connection' : 'New Connection'}
                </h2>

                {/* Connection Name */}
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Connection Name
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-3 py-2 bg-[#0D0D11] border border-gray-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                        placeholder="e.g., My Server"
                    />
                </div>

                {/* Connection Type */}
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Connection Type
                    </label>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setConnectionType(ConnectionType.Local)}
                            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${connectionType === ConnectionType.Local
                                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500'
                                : 'bg-[#0D0D11] text-gray-400 border border-gray-700 hover:border-gray-600'
                                }`}
                        >
                            Local Terminal
                        </button>
                        <button
                            onClick={() => setConnectionType(ConnectionType.SSH)}
                            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${connectionType === ConnectionType.SSH
                                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500'
                                : 'bg-[#0D0D11] text-gray-400 border border-gray-700 hover:border-gray-600'
                                }`}
                        >
                            SSH
                        </button>
                    </div>
                </div>

                {/* SSH Config Form */}
                {connectionType === ConnectionType.SSH && (
                    <div className="space-y-4 mb-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Host
                            </label>
                            <input
                                type="text"
                                value={host}
                                onChange={(e) => setHost(e.target.value)}
                                className="w-full px-3 py-2 bg-[#0D0D11] border border-gray-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                                placeholder="e.g., 192.168.1.100"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Port
                            </label>
                            <input
                                type="number"
                                value={portInput}
                                onChange={(e) => setPortInput(e.target.value)}
                                onBlur={handlePortBlur}
                                min="1"
                                max="65535"
                                className="w-full px-3 py-2 bg-[#0D0D11] border border-gray-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Username
                            </label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full px-3 py-2 bg-[#0D0D11] border border-gray-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                                placeholder="e.g., root"
                            />
                        </div>

                        {/* Authentication Method */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Authentication
                            </label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setAuthType('password')}
                                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${authType === 'password'
                                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500'
                                        : 'bg-[#0D0D11] text-gray-400 border border-gray-700 hover:border-gray-600'
                                        }`}
                                >
                                    Password
                                </button>
                                <button
                                    onClick={() => setAuthType('publickey')}
                                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${authType === 'publickey'
                                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500'
                                        : 'bg-[#0D0D11] text-gray-400 border border-gray-700 hover:border-gray-600'
                                        }`}
                                >
                                    Public Key
                                </button>
                            </div>
                        </div>

                        {/* Password Auth */}
                        {authType === 'password' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Password
                                </label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-3 py-2 bg-[#0D0D11] border border-gray-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                                    placeholder="Enter password"
                                />
                            </div>
                        )}

                        {/* Public Key Auth */}
                        {authType === 'publickey' && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Private Key Path
                                    </label>
                                    <input
                                        type="text"
                                        value={privateKeyPath}
                                        onChange={(e) => setPrivateKeyPath(e.target.value)}
                                        className="w-full px-3 py-2 bg-[#0D0D11] border border-gray-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                                        placeholder="e.g., ~/.ssh/id_rsa"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Supports ~/.ssh/id_rsa, ~/.ssh/id_ed25519, etc.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Passphrase (Optional)
                                    </label>
                                    <input
                                        type="password"
                                        value={passphrase}
                                        onChange={(e) => setPassphrase(e.target.value)}
                                        className="w-full px-3 py-2 bg-[#0D0D11] border border-gray-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                                        placeholder="Enter if key is password-protected"
                                    />
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Buttons */}
                <div className="flex gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white rounded-lg transition-all"
                    >
                        {isEditMode ? 'Save Changes' : 'Save & Connect'}
                    </button>
                </div>
            </div>
        </div>
    );
};
