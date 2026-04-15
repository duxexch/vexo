export type ChatCallOperationKind = 'start' | 'end';
export type ChatCallType = 'voice' | 'video';

export interface ChatCallQueuedOperationBase {
  id: string;
  kind: ChatCallOperationKind;
  attempts: number;
  createdAt: number;
  nextRetryAt: number;
  expiresAt: number;
}

export interface ChatCallQueuedStartOperation extends ChatCallQueuedOperationBase {
  kind: 'start';
  receiverId: string;
  callType: ChatCallType;
}

export interface ChatCallQueuedEndOperation extends ChatCallQueuedOperationBase {
  kind: 'end';
  sessionId: string;
}

export type ChatCallQueuedOperation = ChatCallQueuedStartOperation | ChatCallQueuedEndOperation;

export const CHAT_CALL_OP_QUEUE_STORAGE_KEY = 'vex:chat-call-op-queue:v1';
export const CHAT_CALL_OP_QUEUE_UPDATED_EVENT = 'vex:chat-call-op-queue-updated';
export const CHAT_CALL_QUEUED_START_PROCESSED_EVENT = 'vex:chat-call-queued-start-processed';
export const CHAT_CALL_QUEUED_END_PROCESSED_EVENT = 'vex:chat-call-queued-end-processed';
export const CHAT_CALL_QUEUED_OPERATION_FAILED_EVENT = 'vex:chat-call-queued-operation-failed';

function isValidCallType(value: unknown): value is ChatCallType {
  return value === 'voice' || value === 'video';
}

function isValidOperation(raw: unknown): raw is ChatCallQueuedOperation {
  if (!raw || typeof raw !== 'object') {
    return false;
  }

  const candidate = raw as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string'
    || (candidate.kind !== 'start' && candidate.kind !== 'end')
    || typeof candidate.attempts !== 'number'
    || typeof candidate.createdAt !== 'number'
    || typeof candidate.nextRetryAt !== 'number'
    || typeof candidate.expiresAt !== 'number'
  ) {
    return false;
  }

  if (candidate.kind === 'start') {
    return typeof candidate.receiverId === 'string' && isValidCallType(candidate.callType);
  }

  return typeof candidate.sessionId === 'string';
}

let operationIdFallbackCounter = 0;

function createCryptoRandomSuffix(byteLength = 16): string | null {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    return null;
  }

  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function createOperationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const randomSuffix = createCryptoRandomSuffix(12);
  if (randomSuffix) {
    return `call-op-${Date.now()}-${randomSuffix}`;
  }

  operationIdFallbackCounter += 1;
  return `call-op-${Date.now()}-${operationIdFallbackCounter}`;
}

function emitQueueUpdated(queue: ChatCallQueuedOperation[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(CHAT_CALL_OP_QUEUE_UPDATED_EVENT, {
    detail: { count: queue.length },
  }));
}

export function readChatCallOperationsQueue(): ChatCallQueuedOperation[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(CHAT_CALL_OP_QUEUE_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isValidOperation);
  } catch {
    return [];
  }
}

export function writeChatCallOperationsQueue(queue: ChatCallQueuedOperation[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(CHAT_CALL_OP_QUEUE_STORAGE_KEY, JSON.stringify(queue));
  emitQueueUpdated(queue);
}

export function pruneExpiredChatCallOperations(
  queue: ChatCallQueuedOperation[],
  nowMs: number = Date.now(),
): ChatCallQueuedOperation[] {
  return queue.filter((operation) => operation.expiresAt > nowMs);
}

function getOperationFingerprint(operation: ChatCallQueuedOperation): string {
  if (operation.kind === 'start') {
    return `start:${operation.receiverId}:${operation.callType}`;
  }
  return `end:${operation.sessionId}`;
}

export function enqueueChatCallOperation(operation: ChatCallQueuedOperation): {
  operation: ChatCallQueuedOperation;
  alreadyQueued: boolean;
  queue: ChatCallQueuedOperation[];
} {
  const now = Date.now();
  const existingQueue = pruneExpiredChatCallOperations(readChatCallOperationsQueue(), now);
  const incomingFingerprint = getOperationFingerprint(operation);

  const existing = existingQueue.find((item) => getOperationFingerprint(item) === incomingFingerprint);
  if (existing) {
    writeChatCallOperationsQueue(existingQueue);
    return { operation: existing, alreadyQueued: true, queue: existingQueue };
  }

  const queue = [...existingQueue, operation];
  writeChatCallOperationsQueue(queue);
  return { operation, alreadyQueued: false, queue };
}

export function createQueuedStartOperation(input: {
  receiverId: string;
  callType: ChatCallType;
  ttlMs: number;
  nowMs?: number;
}): ChatCallQueuedStartOperation {
  const nowMs = input.nowMs ?? Date.now();
  return {
    id: createOperationId(),
    kind: 'start',
    receiverId: input.receiverId,
    callType: input.callType,
    attempts: 0,
    createdAt: nowMs,
    nextRetryAt: nowMs,
    expiresAt: nowMs + input.ttlMs,
  };
}

export function createQueuedEndOperation(input: {
  sessionId: string;
  ttlMs: number;
  nowMs?: number;
}): ChatCallQueuedEndOperation {
  const nowMs = input.nowMs ?? Date.now();
  return {
    id: createOperationId(),
    kind: 'end',
    sessionId: input.sessionId,
    attempts: 0,
    createdAt: nowMs,
    nextRetryAt: nowMs,
    expiresAt: nowMs + input.ttlMs,
  };
}
