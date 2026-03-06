import type { UIMessage } from 'ai';

export interface ToolEvent {
  id: string;
  sessionId: string;
  timestamp: string;
  eventType: 'approval' | 'deferred' | 'tool-output' | 'tool-error';
  toolCallId?: string;
  toolName?: string;
  payload?: Record<string, unknown>;
}

export interface ChatSessionRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: UIMessage[];
  toolEvents: ToolEvent[];
}

export interface LocalDbPreferences {
  apiBaseUrl: string;
  authToken: string;
}

interface LocalDbState {
  sessions: ChatSessionRecord[];
  preferences: LocalDbPreferences;
}

const STORAGE_KEY = 'api-template::local-db::v1';
const MAX_PERSISTED_DATA_URL_LENGTH = 100_000;

const DEFAULT_STATE: LocalDbState = {
  sessions: [],
  preferences: {
    apiBaseUrl: 'http://localhost:8000',
    authToken: '',
  },
};

function nowIso(): string {
  return new Date().toISOString();
}

function titleFromMessage(message?: UIMessage): string {
  if (!message) {
    return 'New Chat';
  }
  const textPart = message.parts?.find((part) => part.type === 'text') as
    | { text?: string }
    | undefined;
  const candidate = textPart?.text?.trim();
  if (!candidate) {
    return 'New Chat';
  }
  return candidate.slice(0, 56);
}

type ChatPart = Record<string, unknown>;
type ChatRole = UIMessage['role'];

function isPersistableRole(role: unknown): role is ChatRole {
  return role === 'system' || role === 'user' || role === 'assistant';
}

function isDeltaPart(part: ChatPart): boolean {
  const type = typeof part.type === 'string' ? part.type.toLowerCase() : '';
  if (type.includes('delta')) {
    return true;
  }
  const state = typeof part.state === 'string' ? part.state.toLowerCase() : '';
  return state.includes('delta');
}

function compactPersistedFileUrl(raw: string): string {
  if (!raw.startsWith('data:')) {
    return raw;
  }
  if (raw.length <= MAX_PERSISTED_DATA_URL_LENGTH) {
    return raw;
  }
  return '';
}

function sanitizePart(part: ChatPart): ChatPart | null {
  if (isDeltaPart(part)) {
    return null;
  }

  const type = typeof part.type === 'string' ? part.type : 'unknown';
  if (type === 'step-start') {
    return null;
  }

  if (type === 'text') {
    return {
      type: 'text',
      text: typeof part.text === 'string' ? part.text : '',
    };
  }

  if (type === 'reasoning') {
    return {
      type: 'reasoning',
      text: typeof part.text === 'string' ? part.text : '',
      state: typeof part.state === 'string' ? part.state : undefined,
    };
  }

  if (type === 'file') {
    const rawUrl = typeof part.url === 'string' ? part.url : '';
    return {
      type: 'file',
      mediaType: typeof part.mediaType === 'string' ? part.mediaType : 'application/octet-stream',
      filename: typeof part.filename === 'string' ? part.filename : undefined,
      url: compactPersistedFileUrl(rawUrl),
    };
  }

  if (type === 'source-url') {
    return {
      type: 'source-url',
      sourceId: typeof part.sourceId === 'string' ? part.sourceId : undefined,
      title: typeof part.title === 'string' ? part.title : undefined,
      url: typeof part.url === 'string' ? part.url : '',
    };
  }

  if (type === 'source-document') {
    return {
      type: 'source-document',
      sourceId: typeof part.sourceId === 'string' ? part.sourceId : undefined,
      title: typeof part.title === 'string' ? part.title : '',
      filename: typeof part.filename === 'string' ? part.filename : undefined,
      mediaType: typeof part.mediaType === 'string' ? part.mediaType : 'application/octet-stream',
    };
  }

  if (type === 'dynamic-tool' || type.startsWith('tool-')) {
    return {
      type,
      toolCallId: typeof part.toolCallId === 'string' ? part.toolCallId : undefined,
      state: typeof part.state === 'string' ? part.state : undefined,
      input: part.input,
      output: part.output,
      errorText: typeof part.errorText === 'string' ? part.errorText : undefined,
    };
  }

  return null;
}

function sanitizeMessage(message: UIMessage): UIMessage | null {
  if (!isPersistableRole(message.role)) {
    return null;
  }

  const parts = Array.isArray(message.parts)
    ? message.parts
        .map((part) => sanitizePart(part as ChatPart))
        .filter((part): part is ChatPart => part !== null)
    : [];

  const id = typeof message.id === 'string' && message.id ? message.id : crypto.randomUUID();

  return {
    ...message,
    id,
    role: message.role,
    parts: parts as UIMessage['parts'],
  };
}

function sanitizeMessages(messages: UIMessage[]): UIMessage[] {
  return messages
    .map(sanitizeMessage)
    .filter((message): message is UIMessage => message !== null);
}

function sanitizeSessionRecord(session: ChatSessionRecord): ChatSessionRecord | null {
  if (!session || typeof session !== 'object') {
    return null;
  }

  const id = typeof session.id === 'string' && session.id ? session.id : crypto.randomUUID();
  const createdAt = typeof session.createdAt === 'string' && session.createdAt ? session.createdAt : nowIso();
  const updatedAt = typeof session.updatedAt === 'string' && session.updatedAt ? session.updatedAt : nowIso();
  const messages = sanitizeMessages(Array.isArray(session.messages) ? session.messages : []);
  const fallbackTitle = titleFromMessage(messages.find((message) => message.role === 'user'));
  const title = typeof session.title === 'string' && session.title.trim() ? session.title : fallbackTitle;
  const toolEvents = Array.isArray(session.toolEvents) ? session.toolEvents : [];

  return {
    id,
    title,
    createdAt,
    updatedAt,
    messages,
    toolEvents,
  };
}

export class LocalChatDb {
  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  private readState(): LocalDbState {
    if (!this.isBrowser()) {
      return structuredClone(DEFAULT_STATE);
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return structuredClone(DEFAULT_STATE);
    }

    try {
      const parsed = JSON.parse(raw) as LocalDbState;
      return {
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        preferences: {
          ...DEFAULT_STATE.preferences,
          ...(parsed.preferences ?? {}),
        },
      };
    } catch {
      return structuredClone(DEFAULT_STATE);
    }
  }

  private writeState(next: LocalDbState): void {
    if (!this.isBrowser()) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors so the chat stays usable when attachments are too large for localStorage.
    }
  }

  listSessions(): ChatSessionRecord[] {
    const state = this.readState();
    const sessions = state.sessions
      .map((session) => sanitizeSessionRecord(session))
      .filter((session): session is ChatSessionRecord => session !== null);

    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getSession(sessionId: string): ChatSessionRecord | null {
    return this.listSessions().find((session) => session.id === sessionId) ?? null;
  }

  createSession(): ChatSessionRecord {
    const state = this.readState();
    const record: ChatSessionRecord = {
      id: crypto.randomUUID(),
      title: 'New Chat',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      messages: [],
      toolEvents: [],
    };
    state.sessions.unshift(record);
    this.writeState(state);
    return record;
  }

  saveMessages(sessionId: string, messages: UIMessage[]): ChatSessionRecord | null {
    const state = this.readState();
    const index = state.sessions.findIndex((session) => session.id === sessionId);
    if (index < 0) {
      return null;
    }

    const sanitizedMessages = sanitizeMessages(messages);

    const existing = state.sessions[index];
    const next: ChatSessionRecord = {
      ...existing,
      messages: sanitizedMessages,
      title: titleFromMessage(sanitizedMessages.find((message) => message.role === 'user')),
      updatedAt: nowIso(),
    };

    state.sessions[index] = next;
    this.writeState(state);
    return next;
  }

  appendToolEvent(sessionId: string, event: Omit<ToolEvent, 'id' | 'timestamp' | 'sessionId'>): void {
    const state = this.readState();
    const index = state.sessions.findIndex((session) => session.id === sessionId);
    if (index < 0) {
      return;
    }

    const nextEvent: ToolEvent = {
      id: crypto.randomUUID(),
      sessionId,
      timestamp: nowIso(),
      ...event,
    };

    const session = state.sessions[index];
    state.sessions[index] = {
      ...session,
      toolEvents: [nextEvent, ...session.toolEvents].slice(0, 200),
      updatedAt: nowIso(),
    };

    this.writeState(state);
  }

  deleteSession(sessionId: string): void {
    const state = this.readState();
    state.sessions = state.sessions.filter((session) => session.id !== sessionId);
    this.writeState(state);
  }

  clearAllSessions(): void {
    const state = this.readState();
    state.sessions = [];
    this.writeState(state);
  }

  getPreferences(): LocalDbPreferences {
    return this.readState().preferences;
  }

  setPreferences(nextPrefs: Partial<LocalDbPreferences>): LocalDbPreferences {
    const state = this.readState();
    state.preferences = {
      ...state.preferences,
      ...nextPrefs,
    };
    this.writeState(state);
    return state.preferences;
  }
}

export const chatDb = new LocalChatDb();
