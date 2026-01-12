import { useState, useEffect, useRef } from 'react';
import { MfaPromptPayload } from '../types/mfa';

interface MfaDialogProps {
    /** 是否显示对话框 */
    isOpen: boolean;
    /** MFA 提示数据 */
    promptData: MfaPromptPayload | null;
    /** 提交响应回调 */
    onSubmit: (responses: string[]) => void;
    /** 取消回调 */
    onCancel: () => void;
}

/**
 * MFA 验证对话框组件
 * 用于显示 SSH keyboard-interactive 认证提示并收集用户输入
 */
export const MfaDialog: React.FC<MfaDialogProps> = ({
    isOpen,
    promptData,
    onSubmit,
    onCancel,
}) => {
    const [responses, setResponses] = useState<string[]>([]);
    const firstInputRef = useRef<HTMLInputElement>(null);

    // 当提示数据变化时，重置响应状态
    useEffect(() => {
        if (promptData) {
            setResponses(new Array(promptData.prompts.length).fill(''));
        }
    }, [promptData]);

    // 对话框打开时聚焦第一个输入框
    useEffect(() => {
        if (isOpen && firstInputRef.current) {
            setTimeout(() => {
                firstInputRef.current?.focus();
            }, 100);
        }
    }, [isOpen]);

    if (!isOpen || !promptData) {
        return null;
    }

    const handleInputChange = (index: number, value: string) => {
        const newResponses = [...responses];
        newResponses[index] = value;
        setResponses(newResponses);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(responses);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onCancel();
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onKeyDown={handleKeyDown}
        >
            <div className="bg-[#1a1a24] rounded-xl shadow-2xl border border-gray-700 w-full max-w-md mx-4 overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-700 bg-gradient-to-r from-cyan-600/20 to-blue-600/20">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
                            <span className="text-xl">🔐</span>
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">
                                {promptData.name || 'Multi-Factor Authentication'}
                            </h2>
                            {promptData.instructions && (
                                <p className="text-sm text-gray-400 mt-0.5">
                                    {promptData.instructions}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {promptData.prompts.map((prompt, index) => (
                        <div key={index} className="space-y-2">
                            <label className="block text-sm font-medium text-gray-300">
                                {prompt.prompt}
                            </label>
                            <input
                                ref={index === 0 ? firstInputRef : undefined}
                                type={prompt.echo ? 'text' : 'password'}
                                value={responses[index] || ''}
                                onChange={(e) => handleInputChange(index, e.target.value)}
                                className="w-full px-4 py-3 bg-[#0d0d11] border border-gray-600 rounded-lg 
                                    text-white placeholder-gray-500 
                                    focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent
                                    transition-all duration-200"
                                placeholder={prompt.echo ? 'Enter value...' : 'Enter code...'}
                                autoComplete={prompt.echo ? 'off' : 'one-time-code'}
                            />
                        </div>
                    ))}

                    {/* Buttons */}
                    <div className="flex space-x-3 pt-4">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 
                                text-gray-300 rounded-lg font-medium
                                transition-colors duration-200"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 
                                hover:from-cyan-400 hover:to-blue-400
                                text-white rounded-lg font-medium
                                transition-all duration-200 shadow-lg shadow-cyan-500/25"
                        >
                            Verify
                        </button>
                    </div>
                </form>

                {/* Footer hint */}
                <div className="px-6 py-3 bg-gray-800/50 border-t border-gray-700">
                    <p className="text-xs text-gray-500 text-center">
                        Press <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-400">Enter</kbd> to submit or{' '}
                        <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-400">Esc</kbd> to cancel
                    </p>
                </div>
            </div>
        </div>
    );
};
