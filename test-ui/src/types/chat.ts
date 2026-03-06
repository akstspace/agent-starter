export type GenericPart = {
  type?: string;
  text?: string;
  url?: string;
  mediaType?: string;
  filename?: string;
  state?: string;
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  kind?: string;
  metadata?: unknown;
  approval?: {
    id?: string;
  };
  [key: string]: unknown;
};

export function isToolPart(part: GenericPart): boolean {
  return Boolean(part.type && (part.type === 'dynamic-tool' || part.type.startsWith('tool-')));
}

export function isDeltaPart(part: GenericPart): boolean {
  const type = typeof part.type === 'string' ? part.type.toLowerCase() : '';
  if (type.includes('delta')) {
    return true;
  }

  const state = typeof part.state === 'string' ? part.state.toLowerCase() : '';
  return state.includes('delta');
}

export function normalizeToolPart(part: GenericPart): GenericPart {
  return {
    ...part,
    type: typeof part.type === 'string' ? part.type : 'tool',
    toolCallId: typeof part.toolCallId === 'string' ? part.toolCallId : undefined,
    state: typeof part.state === 'string' && part.state ? part.state : 'unknown',
    input: part.input,
    output: part.output,
    errorText: typeof part.errorText === 'string' ? part.errorText : undefined,
  };
}
