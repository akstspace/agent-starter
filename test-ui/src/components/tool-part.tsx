import { useState } from 'react';

import { CheckCircle2, Clock3, ShieldAlert, XCircle } from 'lucide-react';

import { MessageResponse } from '@/components/ai-elements/message';
import { RechartsPlot, type RechartsConfig } from '@/components/recharts-plot';
import { ShadcnChartPlot, type ShadcnChartConfig } from '@/components/shadcn-chart-plot';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { GenericPart } from '@/types/chat';

interface ToolPartProps {
  part: GenericPart;
  onApproval: (payload: {
    toolCallId: string;
    toolName: string;
    approvalId?: string;
    approved: boolean;
  }) => void | Promise<void>;
  onToolOutput?: (payload: {
    toolCallId: string;
    toolName: string;
    output: unknown;
  }) => void | Promise<void>;
}

function stateBadgeVariant(state: string | undefined): 'secondary' | 'outline' | 'success' | 'warning' {
  if (state === 'output-available') {
    return 'success';
  }
  if (state === 'approval-requested') {
    return 'warning';
  }
  if (state === 'output-error') {
    return 'outline';
  }
  return 'secondary';
}

function stateIcon(state: string | undefined) {
  if (state === 'approval-requested') {
    return <ShieldAlert className='h-4 w-4' />;
  }
  if (state === 'output-available') {
    return <CheckCircle2 className='h-4 w-4' />;
  }
  if (state === 'output-error') {
    return <XCircle className='h-4 w-4' />;
  }
  return <Clock3 className='h-4 w-4' />;
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function asRechartsConfig(value: unknown): RechartsConfig | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const candidate = value as Partial<RechartsConfig>;
  if (candidate.kind !== 'recharts-config') {
    return null;
  }
  if (!candidate.chart_type) {
    return null;
  }
  return candidate as RechartsConfig;
}

function asShadcnChartConfig(value: unknown): ShadcnChartConfig | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const candidate = value as Partial<ShadcnChartConfig>;
  if (candidate.kind !== 'shadcn-chart-config') {
    return null;
  }
  if (!candidate.chart_type) {
    return null;
  }
  return candidate as ShadcnChartConfig;
}

function shouldRenderAsMarkdown(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    return false;
  }
  return true;
}

function asChoicePrompt(value: unknown): { question: string; options: string[] } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const question = (value as { question?: unknown }).question;
  const options = (value as { options?: unknown }).options;

  if (typeof question !== 'string' || !Array.isArray(options)) {
    return null;
  }

  const normalizedOptions = options.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
  if (question.trim().length === 0 || normalizedOptions.length < 2) {
    return null;
  }

  return {
    question: question.trim(),
    options: normalizedOptions,
  };
}

function normalizeToolName(toolType: string): string {
  return toolType.startsWith('tool-') ? toolType.slice(5) : toolType;
}

export function ToolPart({ part, onApproval, onToolOutput }: ToolPartProps) {
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [isSubmittingChoice, setIsSubmittingChoice] = useState(false);
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);
  const toolCallId = typeof part.toolCallId === 'string' ? part.toolCallId : '';
  const state = typeof part.state === 'string' ? part.state : 'unknown';
  const toolType = typeof part.type === 'string' ? part.type : 'tool';
  const normalizedToolName =
    typeof part.toolName === 'string' && part.toolName.trim().length > 0
      ? part.toolName
      : normalizeToolName(toolType);
  const approvalId =
    typeof part.approval === 'object' &&
    part.approval !== null &&
    typeof (part.approval as { id?: unknown }).id === 'string'
      ? ((part.approval as { id?: string }).id ?? undefined)
      : undefined;
  const rechartsPlotConfig = asRechartsConfig(part.output);
  const shadcnPlotConfig = asShadcnChartConfig(part.output);
  const choicePrompt = state === 'input-available' ? asChoicePrompt(part.input) : null;

  return (
    <div className='rounded-lg border border-border bg-secondary/50 p-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant='outline'>{toolType}</Badge>
        <Badge variant={stateBadgeVariant(state)}>{state}</Badge>
        <span className='text-muted-foreground'>{stateIcon(state)}</span>
      </div>

      {part.input !== undefined ? (
        <Collapsible className='mt-3' onOpenChange={setIsInputOpen} open={isInputOpen}>
          <CollapsibleTrigger asChild>
            <Button size='sm' variant='ghost'>
              {isInputOpen ? 'Hide input' : 'Show input'}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className='mt-2 overflow-x-auto rounded-md bg-card p-3 text-xs text-foreground'>
              {prettyJson(part.input)}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      {part.output !== undefined ? (
        rechartsPlotConfig ? (
          <div className='mt-3 space-y-2 rounded-md bg-card p-3'>
            <p className='text-xs font-semibold tracking-wide text-muted-foreground'>
              {rechartsPlotConfig.title || rechartsPlotConfig.chart_type} ({rechartsPlotConfig.chart_type})
            </p>
            <RechartsPlot config={rechartsPlotConfig} />
          </div>
        ) : shadcnPlotConfig ? (
          <div className='mt-3 space-y-2 rounded-md bg-card p-3'>
            <p className='text-xs font-semibold tracking-wide text-muted-foreground'>
              {shadcnPlotConfig.title || shadcnPlotConfig.chart_type} ({shadcnPlotConfig.chart_type}, shadcn)
            </p>
            <ShadcnChartPlot config={shadcnPlotConfig} />
          </div>
        ) : shouldRenderAsMarkdown(part.output) ? (
          <div className='mt-3 rounded-md bg-card p-3 text-sm text-foreground'>
            <MessageResponse>{part.output}</MessageResponse>
          </div>
        ) : (
          <pre className='mt-3 overflow-x-auto rounded-md bg-card p-3 text-xs text-foreground'>{prettyJson(part.output)}</pre>
        )
      ) : null}

      {part.errorText ? <p className='mt-2 text-sm font-medium text-destructive'>{part.errorText}</p> : null}

      {choicePrompt && toolCallId && onToolOutput ? (
        <div className='mt-3 space-y-2 rounded-md border border-border/70 bg-card/70 p-3'>
          <p className='text-sm font-medium'>{choicePrompt.question}</p>
          <div className='flex flex-wrap gap-2'>
            {choicePrompt.options.map((option) => (
              <Button
                key={option}
                size='sm'
                variant={selectedChoice === option ? 'secondary' : 'outline'}
                disabled={selectedChoice !== null || isSubmittingChoice}
                onClick={async () => {
                  setSelectedChoice(option);
                  setIsSubmittingChoice(true);
                  try {
                    await onToolOutput({
                      toolCallId,
                      toolName: normalizedToolName,
                      output: option,
                    });
                  } finally {
                    setIsSubmittingChoice(false);
                  }
                }}
              >
                {option}
              </Button>
            ))}
          </div>
          {selectedChoice ? (
            <p className='text-xs text-muted-foreground'>
              Selected: <span className='font-medium text-foreground'>{selectedChoice}</span>
            </p>
          ) : (
            <p className='text-xs text-muted-foreground'>Pick one option to continue this deferred tool call.</p>
          )}
        </div>
      ) : null}

      {state === 'approval-requested' && toolCallId ? (
        <div className='mt-3 flex flex-wrap gap-2'>
          <Button
            size='sm'
            disabled={isSubmittingApproval}
            onClick={async () => {
              setIsSubmittingApproval(true);
              try {
                await onApproval({
                  approved: true,
                  approvalId,
                  toolCallId,
                  toolName: normalizedToolName,
                });
              } finally {
                setIsSubmittingApproval(false);
              }
            }}
          >
            Approve
          </Button>
          <Button
            size='sm'
            variant='destructive'
            disabled={isSubmittingApproval}
            onClick={async () => {
              setIsSubmittingApproval(true);
              try {
                await onApproval({
                  approved: false,
                  approvalId,
                  toolCallId,
                  toolName: normalizedToolName,
                });
              } finally {
                setIsSubmittingApproval(false);
              }
            }}
          >
            Deny
          </Button>
        </div>
      ) : null}
    </div>
  );
}
