import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
  type FileUIPart,
  type UIMessage,
} from 'ai';
import { AnimatePresence, motion } from 'motion/react';
import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from '@/components/ai-elements/attachments';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from '@/components/ai-elements/chain-of-thought';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from '@/components/ai-elements/prompt-input';
import { ShowWorkPanel, type WorkEntry } from '@/components/show-work-panel';
import { Badge } from '@/components/ui/badge';
import { Button as UiButton } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { isDeltaPart, isToolPart, normalizeToolPart, type GenericPart } from '@/types/chat';
import type { AgentInfo } from '@/App';
import {
  Bot,
  CheckCircle2,
  Loader2,
  MessageSquareDashed,
  Settings,
  ShieldAlert,
  User,
  Wrench,
  XCircle,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ChatWorkspaceProps {
  sessionId: string;
  initialMessages: UIMessage[];
  apiBaseUrl: string;
  authToken: string;
  agents: AgentInfo[];
  agentId: string;
  agentsLoading?: boolean;
  agentConfig?: Record<string, string>;
  onAgentChange: (agentId: string) => void;
  onConfigureAgent?: () => void;
  onMessagesChange: (sessionId: string, messages: UIMessage[]) => void;
  onToolEvent: (payload: {
    eventType: 'approval' | 'deferred' | 'tool-output' | 'tool-error';
    toolCallId?: string;
    toolName?: string;
    data?: Record<string, unknown>;
  }) => void;
  onWorkingChange?: (isWorking: boolean) => void;
}

function normalizeApiBaseUrl(raw: string): string {
  return raw.replace(/\/$/, '');
}

function messageFingerprint(messages: UIMessage[]): string {
  return messages
    .map((message) => {
      const partFingerprint = (message.parts ?? [])
        .map((part) => {
          const typedPart = part as GenericPart;
          const type = typeof typedPart.type === 'string' ? typedPart.type : 'unknown';

          if (type === 'text' || type === 'reasoning') {
            const text = typeof typedPart.text === 'string' ? typedPart.text : '';
            return `${type}:${text.length}`;
          }

          if (type === 'file') {
            const mediaType = typeof typedPart.mediaType === 'string' ? typedPart.mediaType : '';
            const filename = typeof typedPart.filename === 'string' ? typedPart.filename : '';
            const url = typeof typedPart.url === 'string' ? typedPart.url : '';
            const marker = url.startsWith('data:') ? url.slice(0, 48) : url.slice(0, 120);
            return `file:${mediaType}:${filename}:${url.length}:${marker}`;
          }

          if (isToolPart(typedPart)) {
            const normalized = normalizeToolPart(typedPart);
            return `tool:${normalized.type ?? 'tool'}:${normalized.toolCallId ?? ''}:${normalized.state ?? ''}`;
          }

          return type;
        })
        .join('|');

      return `${message.id}:${message.role}:${partFingerprint}`;
    })
    .join('||');
}

function extractToolParts(message: UIMessage): GenericPart[] {
  if (message.role !== 'assistant') {
    return [];
  }

  return (message.parts ?? [])
    .map((part) => part as GenericPart)
    .filter((part) => !isDeltaPart(part) && isToolPart(part))
    .map((part) => normalizeToolPart(part));
}

function assistantPreview(message: UIMessage): string {
  for (const part of message.parts ?? []) {
    const typedPart = part as GenericPart;
    if (typedPart.type === 'text' && typeof typedPart.text === 'string') {
      const trimmed = typedPart.text.trim();
      if (trimmed) {
        return trimmed.slice(0, 88);
      }
    }
  }
  return 'Tool activity';
}

function roleLabel(role: UIMessage['role']): string {
  if (role === 'user') {
    return 'You';
  }
  if (role === 'assistant') {
    return 'Assistant';
  }
  if (role === 'system') {
    return 'System';
  }
  return role;
}

interface ChoicePrompt {
  question: string;
  options: string[];
}

interface PendingToolAction {
  state: 'approval-requested' | 'input-available';
  toolCallId: string;
  toolName: string;
  toolLabel: string;
  approvalId?: string;
  input?: unknown;
  question?: string;
  options: string[];
}

function asChoicePrompt(value: unknown): ChoicePrompt | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const question = (value as { question?: unknown }).question;
  const options = (value as { options?: unknown }).options;
  if (typeof question !== 'string' || !Array.isArray(options)) {
    return null;
  }

  const normalizedOptions = options
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!question.trim() || normalizedOptions.length < 1) {
    return null;
  }

  return {
    question: question.trim(),
    options: normalizedOptions,
  };
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeToolName(rawPart: GenericPart): string {
  if (typeof rawPart.toolName === 'string' && rawPart.toolName.trim()) {
    return rawPart.toolName.trim();
  }

  const toolType = typeof rawPart.type === 'string' ? rawPart.type : 'tool';
  return toolType.startsWith('tool-') ? toolType.slice(5) : toolType;
}

interface ToolActionDialogProps {
  action: PendingToolAction | null;
  isSubmitting: boolean;
  onClose: () => void;
  onApprove: (payload: { action: PendingToolAction; approved: boolean }) => Promise<void>;
  onSelectOption: (payload: { action: PendingToolAction; option: string }) => Promise<void>;
}

function ToolActionDialog({
  action,
  isSubmitting,
  onClose,
  onApprove,
  onSelectOption,
}: ToolActionDialogProps) {
  const [isInputOpen, setIsInputOpen] = useState(false);

  useEffect(() => {
    if (!action) {
      setIsInputOpen(false);
    }
  }, [action]);

  const open = action !== null;
  const isApproval = action?.state === 'approval-requested';

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <DialogContent className='max-w-lg'>
        {action ? (
          <>
            <DialogHeader>
              <DialogTitle className='flex items-center gap-2'>
                {isApproval ? <ShieldAlert className='h-4 w-4 text-amber-500' /> : <CheckCircle2 className='h-4 w-4 text-primary' />}
                {action.toolLabel}
              </DialogTitle>
              <DialogDescription>
                {isApproval
                  ? 'This tool requires your approval before the assistant can continue.'
                  : action.question ?? 'Choose one option to continue this deferred tool call.'}
              </DialogDescription>
            </DialogHeader>

            <div className='space-y-3'>
              <div className='flex items-center gap-2'>
                <Badge variant='outline'>{action.state}</Badge>
                <span className='text-xs text-muted-foreground'>{action.toolCallId}</span>
              </div>

              {action.input !== undefined ? (
                <Collapsible onOpenChange={setIsInputOpen} open={isInputOpen}>
                  <CollapsibleTrigger asChild>
                    <UiButton size='sm' variant='outline'>
                      {isInputOpen ? 'Hide input' : 'Show input'}
                    </UiButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <pre className='mt-2 max-h-44 overflow-auto rounded-md bg-secondary/65 p-3 text-xs'>
                      {prettyJson(action.input)}
                    </pre>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}

              {!isApproval && action.options.length > 0 ? (
                <div className='flex flex-wrap gap-2'>
                  {action.options.map((option) => (
                    <UiButton
                      key={option}
                      disabled={isSubmitting}
                      onClick={() => {
                        void onSelectOption({ action, option });
                      }}
                      size='sm'
                      variant='secondary'
                    >
                      {option}
                    </UiButton>
                  ))}
                </div>
              ) : null}
            </div>

            {isApproval ? (
              <DialogFooter>
                <UiButton
                  disabled={isSubmitting}
                  onClick={() => {
                    void onApprove({ action, approved: false });
                  }}
                  type='button'
                  variant='destructive'
                >
                  <XCircle className='mr-1.5 h-4 w-4' />
                  Deny
                </UiButton>
                <UiButton
                  disabled={isSubmitting}
                  onClick={() => {
                    void onApprove({ action, approved: true });
                  }}
                  type='button'
                >
                  <CheckCircle2 className='mr-1.5 h-4 w-4' />
                  Approve
                </UiButton>
              </DialogFooter>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PromptInputAttachmentsHeader() {
  const attachments = usePromptInputAttachments();

  if (attachments.files.length === 0) {
    return null;
  }

  return (
    <PromptInputHeader className='px-2 pb-1'>
      <Attachments variant='inline'>
        {attachments.files.map((attachment) => (
          <Attachment key={attachment.id} data={attachment} onRemove={() => attachments.remove(attachment.id)}>
            <AttachmentPreview />
            <AttachmentRemove />
          </Attachment>
        ))}
      </Attachments>
    </PromptInputHeader>
  );
}

interface ChatMessageViewProps {
  message: UIMessage;
  hasToolActivity: boolean;
  onShowWork: (messageId: string) => void;
}

function ChatMessageView({ message, hasToolActivity, onShowWork }: ChatMessageViewProps) {
  const isUser = message.role === 'user';
  const parts = (message.parts ?? []).map((part) => part as GenericPart).filter((part) => !isDeltaPart(part));

  const fileParts = parts.filter(
    (part): part is GenericPart & { type: 'file'; mediaType: string } =>
      part.type === 'file' && typeof part.mediaType === 'string',
  );

  const visibleParts = parts.filter(
    (part) => part.type !== 'file' && part.type !== 'step-start' && !isToolPart(part),
  );

  const approvalOrDeferredParts = parts.filter((part) => {
    if (!isToolPart(part)) return false;
    const normalized = normalizeToolPart(part);
    const state = typeof normalized.state === 'string' ? normalized.state : '';
    return state === 'approval-requested' || state === 'input-available' || state === 'input-streaming' || state.includes('deferred');
  });

  const toolPartCount = approvalOrDeferredParts.length;

  return (
    <Message from={message.role}>
      <div className={cn('mb-1 flex items-center text-xs text-muted-foreground', isUser ? 'justify-end gap-2' : 'gap-2')}>
        {isUser ? (
          <>
            <span>{roleLabel(message.role)}</span>
            <User className='h-3.5 w-3.5' />
          </>
        ) : (
          <>
            <Bot className='h-3.5 w-3.5' />
            <span>{roleLabel(message.role)}</span>
          </>
        )}
      </div>

      {visibleParts.map((part, index) => {
        if (part.type === 'text') {
          return (
            <MessageContent key={`${message.id}-text-${index}`}>
              <MessageResponse>{typeof part.text === 'string' ? part.text : ''}</MessageResponse>
            </MessageContent>
          );
        }

        if (part.type === 'reasoning') {
          return (
            <MessageContent key={`${message.id}-reasoning-${index}`}>
              <ChainOfThought defaultOpen={false}>
                <ChainOfThoughtHeader>Reasoning</ChainOfThoughtHeader>
                <ChainOfThoughtContent>
                  <MessageResponse>{typeof part.text === 'string' ? part.text : ''}</MessageResponse>
                </ChainOfThoughtContent>
              </ChainOfThought>
            </MessageContent>
          );
        }

        return (
          <MessageContent key={`${message.id}-part-${index}`}>
            <pre className='overflow-x-auto rounded-md border border-border/70 bg-secondary/55 p-3 text-xs'>
              {JSON.stringify(part, null, 2)}
            </pre>
          </MessageContent>
        );
      })}

      {fileParts.length > 0 ? (
        <MessageContent>
          <Attachments variant='grid'>
            {fileParts.map((part, index) => {
              const url = typeof part.url === 'string' ? part.url : '';

              if (!url) {
                return (
                  <div
                    key={`${message.id}-file-fallback-${index}`}
                    className='w-full rounded-lg border border-border/70 bg-card/70 px-3 py-2 text-xs text-muted-foreground'
                  >
                    {(typeof part.filename === 'string' && part.filename) || `attachment-${index + 1}`}: unavailable in local cache.
                  </div>
                );
              }

              const attachment = {
                id: `${message.id}-file-${index}`,
                type: 'file' as const,
                url,
                mediaType: part.mediaType,
                filename: typeof part.filename === 'string' ? part.filename : undefined,
              };

              return (
                <Attachment data={attachment} key={attachment.id}>
                  <AttachmentPreview />
                </Attachment>
              );
            })}
          </Attachments>
        </MessageContent>
      ) : null}

      {message.role === 'assistant' ? (
        <MessageActions>
          <MessageAction
            label='Show work'
            tooltip='Open tool trace panel'
            variant={hasToolActivity ? 'secondary' : 'ghost'}
            onClick={() => onShowWork(message.id)}
          >
            <Wrench className='h-3.5 w-3.5' />
          </MessageAction>
          {toolPartCount > 0 ? (
            <span className='text-xs text-muted-foreground'>
              {toolPartCount} tool {toolPartCount === 1 ? 'call' : 'calls'}
            </span>
          ) : null}
        </MessageActions>
      ) : null}
    </Message>
  );
}

export function ChatWorkspace({
  sessionId,
  initialMessages,
  apiBaseUrl,
  authToken,
  agents,
  agentId,
  agentsLoading,
  agentConfig,
  onAgentChange,
  onConfigureAgent,
  onMessagesChange,
  onToolEvent,
  onWorkingChange,
}: ChatWorkspaceProps) {
  const [isWorkPanelOpen, setIsWorkPanelOpen] = useState(false);
  const [selectedWorkMessageId, setSelectedWorkMessageId] = useState<string | null>(null);
  const [pendingToolAction, setPendingToolAction] = useState<PendingToolAction | null>(null);
  const [isToolActionSubmitting, setIsToolActionSubmitting] = useState(false);

  const seenToolEventsRef = useRef<Set<string>>(new Set());
  const persistedFingerprintRef = useRef<string>('');

  const transport = useMemo(() => {
    const headers: Record<string, string> = {};
    if (authToken.trim()) {
      headers.Authorization = `Bearer ${authToken.trim()}`;
    }
    if (agentConfig && Object.keys(agentConfig).length > 0) {
      headers['X-Agent-Config'] = JSON.stringify(agentConfig);
    }

    const agentPath = agentId ? `/api/agents/${agentId}/chat` : '/api/agents/general/chat';
    return new DefaultChatTransport({
      api: `${normalizeApiBaseUrl(apiBaseUrl)}${agentPath}`,
      headers,
    });
  }, [apiBaseUrl, authToken, agentId, agentConfig]);

  const { messages, sendMessage, status, stop, error, addToolOutput, addToolApprovalResponse } = useChat({
    id: sessionId,
    messages: initialMessages,
    transport,
    sendAutomaticallyWhen: (options) =>
      lastAssistantMessageIsCompleteWithToolCalls(options) ||
      lastAssistantMessageIsCompleteWithApprovalResponses(options),
  });

  useEffect(() => {
    const nextFingerprint = messageFingerprint(messages);
    if (nextFingerprint === persistedFingerprintRef.current) {
      return;
    }

    persistedFingerprintRef.current = nextFingerprint;
    onMessagesChange(sessionId, messages);
  }, [messages, onMessagesChange, sessionId]);

  const isWorking = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    onWorkingChange?.(isWorking);
  }, [isWorking, onWorkingChange]);

  useEffect(() => {
    if (!isWorking) {
      return;
    }
    const latest = messages[messages.length - 1];
    if (latest?.role === 'user') {
      setSelectedWorkMessageId(null);
    }
  }, [isWorking, messages]);

  useEffect(() => {
    const latest = messages[messages.length - 1];
    if (!latest || latest.role !== 'assistant') {
      return;
    }

    let nextAction: PendingToolAction | null = null;

    for (const part of latest.parts ?? []) {
      const rawPart = part as GenericPart;
      if (isDeltaPart(rawPart) || !isToolPart(rawPart)) {
        continue;
      }

      const typedPart = normalizeToolPart(rawPart);
      const state = typeof typedPart.state === 'string' ? typedPart.state : '';
      const toolCallId = typeof typedPart.toolCallId === 'string' ? typedPart.toolCallId : undefined;
      const normalizedToolName = normalizeToolName(typedPart);
      const toolName = typeof typedPart.type === 'string' ? typedPart.type : normalizedToolName;

      const eventKey = `${latest.id}:${toolCallId ?? ''}:${state}:${toolName ?? ''}`;
      if (seenToolEventsRef.current.has(eventKey)) {
        continue;
      }

      seenToolEventsRef.current.add(eventKey);
      setSelectedWorkMessageId(latest.id);

      if (!nextAction && !pendingToolAction && toolCallId) {
        const choicePrompt = state === 'input-available' ? asChoicePrompt(typedPart.input) : null;
        const requiresUserAction =
          state === 'approval-requested' ||
          (state === 'input-available' && choicePrompt !== null);

        if (requiresUserAction) {
          const approvalId =
            typeof typedPart.approval === 'object' &&
              typedPart.approval !== null &&
              typeof (typedPart.approval as { id?: unknown }).id === 'string'
              ? ((typedPart.approval as { id?: string }).id ?? undefined)
              : undefined;

          nextAction = {
            state,
            toolCallId,
            toolName: normalizedToolName,
            toolLabel: normalizedToolName,
            approvalId,
            input: typedPart.input,
            question: choicePrompt?.question,
            options: choicePrompt?.options ?? [],
          };
        }
      }

      if (state === 'approval-requested') {
        onToolEvent({ eventType: 'approval', toolCallId, toolName, data: typedPart as Record<string, unknown> });
      } else if (state === 'output-available') {
        onToolEvent({ eventType: 'tool-output', toolCallId, toolName, data: typedPart as Record<string, unknown> });
      } else if (state === 'output-error') {
        onToolEvent({ eventType: 'tool-error', toolCallId, toolName, data: typedPart as Record<string, unknown> });
      } else if (state === 'input-available' || state === 'input-streaming' || state.includes('deferred')) {
        onToolEvent({ eventType: 'deferred', toolCallId, toolName, data: typedPart as Record<string, unknown> });
      }
    }

    if (nextAction) {
      setPendingToolAction(nextAction);
    }
  }, [messages, onToolEvent, pendingToolAction]);

  const workEntries = useMemo<WorkEntry[]>(() => {
    let assistantNumber = 0;

    return messages.flatMap((message) => {
      if (message.role !== 'assistant') {
        return [];
      }

      assistantNumber += 1;
      return [
        {
          messageId: message.id,
          assistantNumber,
          label: assistantPreview(message),
          toolParts: extractToolParts(message),
        },
      ];
    });
  }, [messages]);

  const toolCountsByMessageId = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const entry of workEntries) {
      counts[entry.messageId] = entry.toolParts.length;
    }

    return counts;
  }, [workEntries]);

  useEffect(() => {
    setSelectedWorkMessageId((current) => {
      if (current && workEntries.some((entry) => entry.messageId === current)) {
        return current;
      }

      if (isWorking) {
        return null;
      }

      const latestAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
      return latestAssistant?.id ?? null;
    });
  }, [isWorking, messages, workEntries]);

  const openWorkPanelForMessage = useCallback((messageId: string) => {
    setSelectedWorkMessageId(messageId);
    setIsWorkPanelOpen(true);
  }, []);

  const handleToolApproval = useCallback(
    async ({
      toolCallId,
      toolName,
      approved,
      approvalId,
    }: {
      toolCallId: string;
      toolName: string;
      approved: boolean;
      approvalId?: string;
    }) => {
      if (approvalId) {
        await addToolApprovalResponse({
          id: approvalId,
          approved,
          reason: approved ? undefined : 'Denied by user',
        });
      } else if (approved) {
        await addToolOutput({
          tool: toolName as never,
          toolCallId,
          output: { approved: true } as never,
        });
      } else {
        await addToolOutput({
          state: 'output-error',
          tool: toolName as never,
          toolCallId,
          errorText: 'Denied by user',
        });
      }

      onToolEvent({
        eventType: 'approval',
        toolCallId,
        toolName,
        data: { approvalId, approved },
      });
    },
    [addToolApprovalResponse, addToolOutput, onToolEvent],
  );

  const handleToolOutput = useCallback(
    async ({ toolCallId, toolName, output }: { toolCallId: string; toolName: string; output: unknown }) => {
      await addToolOutput({
        tool: toolName as never,
        toolCallId,
        output: output as never,
      });

      onToolEvent({
        eventType: 'deferred',
        toolCallId,
        toolName,
        data: { output },
      });
    },
    [addToolOutput, onToolEvent],
  );

  const closeToolActionDialog = useCallback(() => {
    if (isToolActionSubmitting) {
      return;
    }
    setPendingToolAction(null);
  }, [isToolActionSubmitting]);

  const handleDialogApproval = useCallback(
    async ({ action, approved }: { action: PendingToolAction; approved: boolean }) => {
      setPendingToolAction(null);
      setIsToolActionSubmitting(true);
      try {
        await handleToolApproval({
          toolCallId: action.toolCallId,
          toolName: action.toolName,
          approved,
          approvalId: action.approvalId,
        });
      } finally {
        setIsToolActionSubmitting(false);
      }
    },
    [handleToolApproval],
  );

  const handleDialogOptionSelect = useCallback(
    async ({ action, option }: { action: PendingToolAction; option: string }) => {
      setPendingToolAction(null);
      setIsToolActionSubmitting(true);
      try {
        await handleToolOutput({
          toolCallId: action.toolCallId,
          toolName: action.toolName,
          output: option,
        });
      } finally {
        setIsToolActionSubmitting(false);
      }
    },
    [handleToolOutput],
  );

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      if (isWorking) {
        return;
      }

      const text = message.text.trim();
      const files = Array.isArray(message.files) ? message.files : [];
      if (!text && files.length === 0) {
        return;
      }

      sendMessage({
        text,
        files: files as FileUIPart[],
      });
    },
    [isWorking, sendMessage],
  );

  return (
    <div className='relative flex h-full min-h-0 min-w-0 overflow-hidden bg-background'>
      <div className='relative z-10 flex min-h-0 min-w-0 flex-1 flex-col'>
        <header className='flex items-center justify-between px-4 py-3'>
          <div className='flex items-center gap-2'>
            <span className='text-sm font-medium'>Chat</span>
            {agents.length > 1 ? (
              <span className='hidden text-xs text-muted-foreground sm:inline'>
                · {agents.find((a) => a.id === agentId)?.name ?? 'Agent'}
              </span>
            ) : null}
            {isWorking ? (
              <span className='hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex'>
                <Loader2 className='h-3.5 w-3.5 animate-spin' />
                Thinking
              </span>
            ) : null}
          </div>
        </header>

        <Conversation className='min-h-0 flex-1 bg-background'>
          <ConversationContent className='mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end gap-6 px-4 pb-44 pt-4 sm:px-6'>
            {messages.length === 0 ? (
              <ConversationEmptyState
                icon={<MessageSquareDashed className='h-5 w-5' />}
                title='Start a conversation'
                description='Ask anything, attach files, and inspect tool work on each response.'
                className='justify-end pb-16'
              />
            ) : null}

            <AnimatePresence initial={false}>
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                >
                  <ChatMessageView
                    message={message}
                    onShowWork={openWorkPanelForMessage}
                    hasToolActivity={(toolCountsByMessageId[message.id] ?? 0) > 0}
                  />
                </motion.div>
              ))}
            </AnimatePresence>

            {isWorking && messages.length > 0 ? (
              <Message from='assistant'>
                <MessageContent>
                  <span className='inline-flex items-center gap-2 text-sm text-muted-foreground'>
                    <Loader2 className='h-3.5 w-3.5 animate-spin' />
                    Assistant is working...
                  </span>
                </MessageContent>
              </Message>
            ) : null}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <motion.div
          initial={false}
          animate={isWorking ? { y: 120, opacity: 0 } : { y: 0, opacity: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-background/95 via-background/70 to-transparent px-3 pb-3 pt-8 sm:px-4',
            isWorking ? 'pointer-events-none' : 'pointer-events-auto',
          )}
        >
          <div className='mx-auto w-full max-w-3xl space-y-3'>
            {error ? (
              <div className='rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
                {error.message}
              </div>
            ) : null}

            <PromptInput
              className='rounded-2xl bg-card/95 p-2 shadow-[0_12px_28px_-18px_rgba(2,6,23,0.72)]'
              globalDrop
              multiple
              onSubmit={handleSubmit}
            >
              <PromptInputAttachmentsHeader />

              <PromptInputBody>
                <PromptInputTextarea
                  className='max-h-48 min-h-[52px] !border-0 !shadow-none focus-visible:!ring-0 focus-visible:!ring-offset-0'
                  placeholder='Message assistant'
                />
              </PromptInputBody>

              <PromptInputFooter>
                <PromptInputTools>
                  {agentsLoading ? (
                    <div className='h-7 w-28 animate-pulse rounded-full bg-secondary' />
                  ) : agents.length > 1 ? (
                    <Select value={agentId} onValueChange={onAgentChange}>
                      <SelectTrigger className='h-7 w-auto gap-1.5 rounded-full border-border/50 bg-secondary px-2.5 text-xs font-medium shadow-none focus:ring-0 focus:ring-offset-0'>
                        <Bot className='h-3 w-3 shrink-0 text-muted-foreground' />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className='bg-card'>
                        {agents.map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>
                            <span className='text-xs'>{agent.name}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}

                  {(() => {
                    const currentAgent = agents.find((a) => a.id === agentId);
                    if (!currentAgent || currentAgent.config_schema.length === 0) return null;
                    return (
                      <button
                        type='button'
                        className='flex h-7 items-center gap-1 rounded-full border border-border/50 bg-secondary px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground'
                        onClick={onConfigureAgent}
                      >
                        <Settings className='h-3 w-3' />
                        Config
                      </button>
                    );
                  })()}

                  <PromptInputActionMenu>
                    <PromptInputActionMenuTrigger className='focus-visible:ring-0 focus-visible:ring-offset-0' />
                    <PromptInputActionMenuContent>
                      <PromptInputActionAddAttachments />
                    </PromptInputActionMenuContent>
                  </PromptInputActionMenu>
                </PromptInputTools>

                <PromptInputSubmit
                  className='focus-visible:ring-0 focus-visible:ring-offset-0'
                  onStop={stop}
                  status={status}
                />
              </PromptInputFooter>
            </PromptInput>
          </div>
        </motion.div>
      </div >

      <ShowWorkPanel
        isOpen={isWorkPanelOpen}
        isWorking={isWorking}
        entries={workEntries}
        selectedMessageId={selectedWorkMessageId}
        onClose={() => setIsWorkPanelOpen(false)}
        onApproval={handleToolApproval}
        onToolOutput={handleToolOutput}
      />

      <ToolActionDialog
        action={pendingToolAction}
        isSubmitting={isToolActionSubmitting}
        onClose={closeToolActionDialog}
        onApprove={handleDialogApproval}
        onSelectOption={handleDialogOptionSelect}
      />
    </div >
  );
}
