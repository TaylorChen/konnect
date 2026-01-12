import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TerminalSession } from '../types/terminal';

interface TerminalStore {
    sessions: TerminalSession[];
    activeSessionId: string | null;

    // Actions
    addSession: (session: TerminalSession) => void;
    removeSession: (id: string) => void;
    setActiveSession: (id: string) => void;
    updateSession: (id: string, updates: Partial<TerminalSession>) => void;
}

export const useTerminalStore = create<TerminalStore>()(
    persist(
        (set) => ({
            sessions: [],
            activeSessionId: null,

            addSession: (session) => set((state) => ({
                sessions: [...state.sessions, session],
                activeSessionId: session.id,
            })),

            removeSession: (id) => set((state) => {
                const newSessions = state.sessions.filter(s => s.id !== id);
                const newActiveId = state.activeSessionId === id
                    ? (newSessions[0]?.id || null)
                    : state.activeSessionId;

                return {
                    sessions: newSessions,
                    activeSessionId: newActiveId,
                };
            }),

            setActiveSession: (id) => set({ activeSessionId: id }),

            updateSession: (id, updates) => set((state) => ({
                sessions: state.sessions.map(s =>
                    s.id === id ? { ...s, ...updates } : s
                ),
            })),
        }),
        {
            name: 'konnect-terminal-storage',
            partialize: (state) => ({
                sessions: state.sessions,
                activeSessionId: state.activeSessionId,
            }),
        }
    )
);

