import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { ToolPart } from '@/components/tool-part';
import { Button } from '@/components/ui/button';
import type { GenericPart } from '@/types/chat';

export interface WorkEntry {
  messageId: string;
  assistantNumber: number;
  label: string;
  toolParts: GenericPart[];
}

interface ShowWorkPanelProps {
  isOpen: boolean;
  isWorking: boolean;
  entries: WorkEntry[];
  selectedMessageId: string | null;
  onClose: () => void;
  onApproval: (payload: {
    toolCallId: string;
    toolName: string;
    approvalId?: string;
    approved: boolean;
  }) => void | Promise<void>;
  onToolOutput: (payload: {
    toolCallId: string;
    toolName: string;
    output: unknown;
  }) => void | Promise<void>;
}

export function ShowWorkPanel({
  isOpen,
  isWorking,
  entries,
  selectedMessageId,
  onClose,
  onApproval,
  onToolOutput,
}: ShowWorkPanelProps) {
  const selectedEntry = entries.find((entry) => entry.messageId === selectedMessageId) ?? null;

  const content = (
    <>
      <header className='flex items-center justify-between border-b border-border/70 px-4 py-3'>
        <div>
          <p className='text-sm font-semibold'>Show Work</p>
          <p className='text-xs text-muted-foreground'>Tool traces for selected answer</p>
        </div>
        <Button size='icon' variant='ghost' onClick={onClose}>
          <X className='h-4 w-4' />
        </Button>
      </header>

      <div className='min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3'>
        {selectedEntry ? (
          <div className='space-y-3'>
            <div className='rounded-md border border-border/70 bg-secondary/40 p-3'>
              <div>
                <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Selected response</p>
                <p className='mt-1 text-sm font-medium'>Answer {selectedEntry.assistantNumber}</p>
              </div>
              <p className='mt-2 text-sm'>{selectedEntry.label}</p>
              <p className='mt-2 text-xs text-muted-foreground'>Tool calls: {selectedEntry.toolParts.length}</p>
            </div>

            {selectedEntry.toolParts.length > 0 ? (
              selectedEntry.toolParts.map((part, index) => (
                <ToolPart
                  key={`${selectedEntry.messageId}-${part.toolCallId ?? part.type ?? index}-${index}`}
                  part={part}
                  onApproval={onApproval}
                  onToolOutput={onToolOutput}
                />
              ))
            ) : (
              <div className='rounded-md border border-dashed border-border bg-card/50 p-4 text-sm text-muted-foreground'>
                No tool activity for this answer.
              </div>
            )}
          </div>
        ) : isWorking ? (
          <div className='rounded-md border border-border/70 bg-card/70 p-4 text-sm text-muted-foreground'>
            Waiting for assistant tool activity...
          </div>
        ) : (
          <div className='rounded-md border border-dashed border-border bg-card/50 p-4 text-sm text-muted-foreground'>
            Click Show work on an assistant answer to inspect tool runs.
          </div>
        )}
      </div>
    </>
  );

  return (
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.button
            type='button'
            key='work-overlay'
            aria-label='Close work panel'
            className='fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-[1px]'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={onClose}
          />
          <motion.section
            key='work-dialog'
            className='fixed inset-0 z-50 flex min-h-0 flex-col bg-background'
            initial={{ y: '100%', opacity: 0.98 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.98 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
          >
            {content}
          </motion.section>
        </>
      ) : null}
    </AnimatePresence>
  );
}
