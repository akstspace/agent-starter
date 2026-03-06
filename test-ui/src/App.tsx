import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UIMessage } from 'ai';
import { ChevronsLeft, ChevronsRight, Menu, MoonStar, Plus, Sun, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { ChatWorkspace } from '@/components/chat-workspace';
import { AgentConfigDialog, type ConfigFieldSchema } from '@/components/agent-config-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { chatDb, type ChatSessionRecord } from '@/lib/local-db';
import { cn } from '@/lib/utils';

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  config_schema: ConfigFieldSchema[];
}

const AGENT_CONFIG_KEY = 'agent-starter::agent-configs::v1';

function loadAgentConfigs(): Record<string, Record<string, string>> {
  try {
    const raw = localStorage.getItem(AGENT_CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAgentConfigs(configs: Record<string, Record<string, string>>) {
  localStorage.setItem(AGENT_CONFIG_KEY, JSON.stringify(configs));
}

function getInitialSessions(): ChatSessionRecord[] {
  const sessions = chatDb.listSessions();
  if (sessions.length > 0) {
    return sessions;
  }
  return [chatDb.createSession()];
}

const INITIAL_SESSIONS = getInitialSessions();
const THEME_STORAGE_KEY = 'api-template::theme::v1';

interface ToolEventPayload {
  eventType: 'approval' | 'deferred' | 'tool-output' | 'tool-error';
  toolCallId?: string;
  toolName?: string;
  data?: Record<string, unknown>;
}

function formatUpdatedAt(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function App() {
  const [sessions, setSessions] = useState<ChatSessionRecord[]>(() => INITIAL_SESSIONS);
  const [activeSessionId, setActiveSessionId] = useState<string>(() => INITIAL_SESSIONS[0].id);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [isChatWorking, setIsChatWorking] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') {
      return 'light';
    }

    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const prefs = chatDb.getPreferences();
  const [apiBaseUrl, setApiBaseUrl] = useState<string>(prefs.apiBaseUrl);
  const [authToken, setAuthToken] = useState<string>(prefs.authToken);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentConfigs, setAgentConfigs] = useState<Record<string, Record<string, string>>>(loadAgentConfigs);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (isChatWorking) {
      setIsSidebarOpen(false);
    }
  }, [isChatWorking]);

  useEffect(() => {
    const fetchAgents = async () => {
      setAgentsLoading(true);
      try {
        const baseUrl = apiBaseUrl.replace(/\/$/, '');
        const headers: Record<string, string> = {};
        if (authToken.trim()) {
          headers.Authorization = `Bearer ${authToken.trim()}`;
        }
        const res = await fetch(`${baseUrl}/api/agents`, { headers });
        if (res.ok) {
          const data = (await res.json()) as AgentInfo[];
          setAgents(data);
          setSelectedAgentId((current) => {
            if (current && data.some((a) => a.id === current)) return current;
            return data[0]?.id ?? '';
          });
        }
      } catch {
        // Silently fail – agents list will remain empty
      } finally {
        setAgentsLoading(false);
      }
    };
    void fetchAgents();
  }, [apiBaseUrl, authToken]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? sessions[0],
    [activeSessionId, sessions],
  );

  const refreshSessions = useCallback((nextActiveSessionId?: string) => {
    const next = chatDb.listSessions();

    if (next.length === 0) {
      const created = chatDb.createSession();
      setSessions([created]);
      setActiveSessionId(created.id);
      return;
    }

    setSessions(next);
    setActiveSessionId((current) => {
      if (nextActiveSessionId && next.some((session) => session.id === nextActiveSessionId)) {
        return nextActiveSessionId;
      }

      if (next.some((session) => session.id === current)) {
        return current;
      }

      return next[0].id;
    });
  }, []);

  const persistPreferences = useCallback(
    (next: Partial<{ apiBaseUrl: string; authToken: string }>) => {
      const saved = chatDb.setPreferences(next);
      setApiBaseUrl(saved.apiBaseUrl);
      setAuthToken(saved.authToken);
    },
    [],
  );

  const createNewSession = useCallback(() => {
    const created = chatDb.createSession();
    refreshSessions(created.id);
    setIsSidebarOpen(false);
  }, [refreshSessions]);

  const requestClearAllSessions = useCallback(() => {
    setIsClearDialogOpen(true);
  }, []);

  const clearAllSessions = useCallback(() => {
    chatDb.clearAllSessions();
    refreshSessions();
    setIsSidebarOpen(false);
  }, [refreshSessions]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  const handleMessagesChange = useCallback(
    (sessionId: string, messages: UIMessage[]) => {
      chatDb.saveMessages(sessionId, messages);
      refreshSessions(sessionId);
    },
    [refreshSessions],
  );

  const handleToolEvent = useCallback(
    ({ eventType, toolCallId, toolName, data }: ToolEventPayload) => {
      chatDb.appendToolEvent(activeSessionId, {
        eventType,
        toolCallId,
        toolName,
        payload: data,
      });
    },
    [activeSessionId],
  );

  if (!activeSession) {
    return null;
  }

  return (
    <div className='relative h-screen overflow-hidden'>
      <AnimatePresence>
        {isSidebarOpen ? (
          <motion.button
            key='sidebar-overlay'
            type='button'
            aria-label='Close sidebar'
            className='fixed inset-0 z-20 bg-slate-950/50 backdrop-blur-sm lg:hidden'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            onClick={() => setIsSidebarOpen(false)}
          />
        ) : null}
      </AnimatePresence>

      <motion.aside
        layout
        className={cn(
          'fixed inset-y-0 left-0 z-30 w-[280px] max-w-[88vw] overflow-hidden border-r border-border/70 bg-card/95 backdrop-blur transition-all duration-200 ease-out',
          isChatWorking
            ? '-translate-x-full lg:-translate-x-full lg:pointer-events-none'
            : isSidebarOpen
              ? 'translate-x-0'
              : '-translate-x-full lg:translate-x-0',
          isSidebarCollapsed ? 'lg:w-[88px]' : 'lg:w-[280px]',
        )}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <div className='flex h-full flex-col'>
          <header className={cn('border-b border-border/70', isSidebarCollapsed ? 'p-2' : 'p-3')}>
            <div className='flex items-center justify-between gap-2'>
              <div className={cn('flex min-w-0 items-center', isSidebarCollapsed ? 'gap-1' : 'gap-2')}>
                <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 font-semibold text-primary'>
                  A
                </div>
                <AnimatePresence initial={false}>
                  {!isSidebarCollapsed ? (
                    <motion.div
                      key='sidebar-title'
                      className='min-w-0'
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }}
                      transition={{ duration: 0.14, ease: 'easeOut' }}
                    >
                      <p className='truncate text-sm font-semibold'>Assistant</p>
                      <p className='truncate text-xs text-muted-foreground'>Local sessions</p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>

              <div className='flex items-center gap-1'>
                <Button
                  type='button'
                  size={isSidebarCollapsed ? 'icon-sm' : 'icon'}
                  variant='ghost'
                  className='hidden lg:inline-flex'
                  aria-label='Toggle sidebar collapse'
                  onClick={() => setIsSidebarCollapsed((value) => !value)}
                >
                  {isSidebarCollapsed ? <ChevronsRight className='h-4 w-4' /> : <ChevronsLeft className='h-4 w-4' />}
                </Button>
                {!isSidebarCollapsed ? (
                  <Button type='button' size='icon' variant='ghost' aria-label='Toggle theme' onClick={toggleTheme}>
                    {theme === 'dark' ? <Sun className='h-4 w-4' /> : <MoonStar className='h-4 w-4' />}
                  </Button>
                ) : null}
                <Button
                  type='button'
                  size='icon'
                  variant='ghost'
                  className='lg:hidden'
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <X className='h-4 w-4' />
                </Button>
              </div>
            </div>
          </header>

          <motion.div layout className='border-b border-border/70 p-3 space-y-2'>
            {isSidebarCollapsed ? (
              <>
                <Button type='button' size='icon' className='w-full' onClick={createNewSession} aria-label='New chat'>
                  <Plus className='h-4 w-4' />
                </Button>
                <Button
                  type='button'
                  size='icon'
                  className='w-full'
                  variant='outline'
                  onClick={requestClearAllSessions}
                  aria-label='Clear all'
                >
                  <Trash2 className='h-4 w-4' />
                </Button>
              </>
            ) : (
              <>
                <Button type='button' className='w-full justify-start' onClick={createNewSession}>
                  <Plus className='mr-2 h-4 w-4' />
                  New chat
                </Button>
                <Button type='button' className='w-full justify-start' variant='outline' onClick={requestClearAllSessions}>
                  <Trash2 className='mr-2 h-4 w-4' />
                  Clear all
                </Button>
              </>
            )}
          </motion.div>

          <nav className='flex-1 overflow-y-auto p-2'>
            <motion.div layout className='space-y-1'>
              <AnimatePresence initial={false}>
                {sessions.map((session) => {
                  const isActive = session.id === activeSession.id;

                  return (
                    <motion.div
                      layout
                      key={session.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.14, ease: 'easeOut' }}
                      className={cn(
                        'rounded-lg border transition-colors',
                        isActive ? 'border-primary/60 bg-primary/10' : 'border-transparent hover:border-border hover:bg-secondary/55',
                      )}
                    >
                      <button
                        className={cn('w-full text-left', isSidebarCollapsed ? 'p-2 text-center' : 'px-3 py-2.5')}
                        onClick={() => {
                          setActiveSessionId(session.id);
                          setIsSidebarOpen(false);
                        }}
                        title={session.title}
                      >
                        {isSidebarCollapsed ? (
                          <span className='text-sm font-semibold'>{(session.title || 'C').slice(0, 1).toUpperCase()}</span>
                        ) : (
                          <>
                            <p className='truncate text-sm font-medium'>{session.title}</p>
                            <p className='mt-0.5 text-xs text-muted-foreground'>Updated {formatUpdatedAt(session.updatedAt)}</p>
                          </>
                        )}
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          </nav>

          <AnimatePresence initial={false}>
            {!isSidebarCollapsed ? (
              <motion.div
                key='connection-settings'
                className='border-t border-border/70 p-3'
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
              >
                <p className='mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Connection</p>
                <div className='space-y-2'>
                  <Input
                    value={apiBaseUrl}
                    onChange={(event) => setApiBaseUrl(event.target.value)}
                    onBlur={() => persistPreferences({ apiBaseUrl })}
                    placeholder='API base URL'
                  />
                  <Input
                    type='password'
                    value={authToken}
                    onChange={(event) => setAuthToken(event.target.value)}
                    onBlur={() => persistPreferences({ authToken })}
                    placeholder='Bearer token (optional in test mode)'
                  />
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.aside>

      <motion.main
        layout
        className={cn(
          'flex h-screen min-w-0 flex-1 flex-col overflow-hidden transition-all duration-200',
          !isChatWorking && 'lg:ml-[280px]',
          !isChatWorking && isSidebarCollapsed && 'lg:ml-[88px]',
          isChatWorking && 'lg:ml-0',
        )}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <header className='flex items-center justify-between border-b border-border/70 bg-card/70 px-3 py-2 backdrop-blur lg:hidden'>
          <Button type='button' size='icon' variant='outline' onClick={() => setIsSidebarOpen(true)}>
            <Menu className='h-5 w-5' />
          </Button>
          <p className='mx-2 min-w-0 flex-1 truncate text-center text-sm font-semibold'>{activeSession.title}</p>
          <Button type='button' size='icon' variant='outline' aria-label='Toggle theme' onClick={toggleTheme}>
            {theme === 'dark' ? <Sun className='h-4 w-4' /> : <MoonStar className='h-4 w-4' />}
          </Button>
        </header>

        <div className='min-h-0 flex-1 p-0'>
          {agentsLoading ? null : (
            <ChatWorkspace
              key={`${activeSession.id}-${selectedAgentId}-${JSON.stringify(agentConfigs[selectedAgentId] ?? {})}`}
              sessionId={activeSession.id}
              initialMessages={activeSession.messages as UIMessage[]}
              apiBaseUrl={apiBaseUrl}
              authToken={authToken}
              agents={agents}
              agentId={selectedAgentId}
              agentsLoading={agentsLoading}
              agentConfig={agentConfigs[selectedAgentId] ?? {}}
              onAgentChange={setSelectedAgentId}
              onConfigureAgent={() => setConfigDialogOpen(true)}
              onMessagesChange={handleMessagesChange}
              onToolEvent={handleToolEvent}
              onWorkingChange={setIsChatWorking}
            />
          )}
        </div>
      </motion.main>

      {(() => {
        const selectedAgent = agents.find((a) => a.id === selectedAgentId);
        if (!selectedAgent || selectedAgent.config_schema.length === 0) return null;
        return (
          <AgentConfigDialog
            open={configDialogOpen}
            onOpenChange={setConfigDialogOpen}
            agentName={selectedAgent.name}
            configSchema={selectedAgent.config_schema}
            savedConfig={agentConfigs[selectedAgentId] ?? {}}
            onSave={(config) => {
              const updated = { ...agentConfigs, [selectedAgentId]: config };
              setAgentConfigs(updated);
              saveAgentConfigs(updated);
            }}
          />
        );
      })()}

      <Dialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>Clear all sessions?</DialogTitle>
            <DialogDescription>
              This removes all locally stored chat sessions and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => setIsClearDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type='button'
              variant='destructive'
              onClick={() => {
                clearAllSessions();
                setIsClearDialogOpen(false);
              }}
            >
              Clear all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
