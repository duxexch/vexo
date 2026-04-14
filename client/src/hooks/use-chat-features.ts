import { useState, useCallback, useEffect, useRef } from 'react';
import {
  CHAT_CALL_OP_QUEUE_UPDATED_EVENT,
  CHAT_CALL_QUEUED_END_PROCESSED_EVENT,
  CHAT_CALL_QUEUED_OPERATION_FAILED_EVENT,
  CHAT_CALL_QUEUED_START_PROCESSED_EVENT,
  createQueuedEndOperation,
  createQueuedStartOperation,
  enqueueChatCallOperation,
  pruneExpiredChatCallOperations,
  readChatCallOperationsQueue,
  writeChatCallOperationsQueue,
  type ChatCallQueuedOperation,
} from '@/lib/chat-call-ops-queue';

interface MediaPermission {
  mediaEnabled: boolean;
  grantedBy: string | null;
  grantedAt: string | null;
  expiresAt: string | null;
  pricePaid: number;
  price?: number;
  userBalance?: number;
  canAfford?: boolean;
  currencySymbol?: string;
  currencyName?: string;
}

interface AutoDeletePermission {
  autoDeleteEnabled: boolean;
  deleteAfterMinutes: number;
  grantedBy: string | null;
  grantedAt: string | null;
  expiresAt: string | null;
  pricePaid: number;
  price?: number;
  userBalance?: number;
  canAfford?: boolean;
  currencySymbol?: string;
  currencyName?: string;
}

interface PriceInfo {
  price: number;
  currency: string;
}

interface ChatCallSession {
  id: string;
  callType: "voice" | "video";
  callerId: string;
  receiverId: string;
  startedAt: string;
  ratePerMinute: number;
}

interface ChatCallPricingStatus {
  voicePricePerMinute: number;
  videoPricePerMinute: number;
  userBalance: number;
  canStartVoiceCall: boolean;
  canStartVideoCall: boolean;
  currencySymbol: string;
  currencyName: string;
  activeSession: ChatCallSession | null;
}

export function useChatMedia() {
  const [permission, setPermission] = useState<MediaPermission | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const token = localStorage.getItem('pwm_token');

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/media/status', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      setPermission(data);
    } catch (err) {
      console.error('[Media] Status check failed:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const purchase = useCallback(async (): Promise<{ success: boolean; error?: string; newBalance?: number }> => {
    try {
      const res = await fetch('/api/chat/media/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await res.json();
      
      if (res.ok) {
        await refreshStatus();
        return { success: true, newBalance: data.newBalance };
      }
      return { success: false, error: data.error || data.message };
    } catch {
      return { success: false, error: 'خطأ في الاتصال' };
    }
  }, [token, refreshStatus]);

  const uploadMedia = useCallback(async (
    file: File,
    receiverId: string,
    onProgress?: (pct: number) => void
  ): Promise<{ success: boolean; url?: string; error?: string }> => {
    setUploading(true);
    setUploadProgress(0);
    
    try {
      // Convert file to base64 for server
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Extract raw base64 without data URL prefix
          const base64 = result.split(',')[1] || result;
          resolve(base64);
        };
        reader.onerror = reject;
        reader.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 50); // 0-50% for reading
            setUploadProgress(pct);
            onProgress?.(pct);
          }
        };
        reader.readAsDataURL(file);
      });

      setUploadProgress(50);
      onProgress?.(50);

      const res = await fetch('/api/chat/media/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          data: base64Data,
          mimeType: file.type,
          fileName: file.name,
          receiverId,
        }),
      });

      setUploadProgress(100);
      onProgress?.(100);
      setUploading(false);

      const responseData = await res.json();
      if (res.ok) {
        return { success: true, url: responseData.mediaUrl };
      }
      return { success: false, error: responseData.error || responseData.message || 'فشل في رفع الملف' };
    } catch {
      setUploading(false);
      return { success: false, error: 'خطأ في رفع الملف' };
    }
  }, [token]);

  return {
    permission,
    loading,
    uploading,
    uploadProgress,
    hasMediaAccess: permission?.mediaEnabled ?? false,
    price: permission?.price ?? 100,
    userBalance: permission?.userBalance ?? 0,
    currencySymbol: permission?.currencySymbol ?? 'VEX',
    purchase,
    uploadMedia,
    refreshStatus,
  };
}

export function useChatAutoDelete() {
  const [permission, setPermission] = useState<AutoDeletePermission | null>(null);
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem('pwm_token');

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/auto-delete/status', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      setPermission(data);
    } catch (err) {
      console.error('[AutoDelete] Status check failed:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const purchase = useCallback(async (): Promise<{ success: boolean; error?: string; newBalance?: number }> => {
    try {
      const res = await fetch('/api/chat/auto-delete/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await res.json();
      
      if (res.ok) {
        await refreshStatus();
        return { success: true, newBalance: data.newBalance };
      }
      return { success: false, error: data.error || data.message };
    } catch {
      return { success: false, error: 'خطأ في الاتصال' };
    }
  }, [token, refreshStatus]);

  const updateSettings = useCallback(async (deleteAfterMinutes: number): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/chat/auto-delete/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ deleteAfterMinutes }),
      });
      const data = await res.json();
      
      if (res.ok) {
        await refreshStatus();
        return { success: true };
      }
      return { success: false, error: data.error || data.message };
    } catch {
      return { success: false, error: 'خطأ في الاتصال' };
    }
  }, [token, refreshStatus]);

  return {
    permission,
    loading,
    hasAutoDelete: permission?.autoDeleteEnabled ?? false,
    deleteAfterMinutes: permission?.deleteAfterMinutes ?? 60,
    price: permission?.price ?? 50,
    userBalance: permission?.userBalance ?? 0,
    currencySymbol: permission?.currencySymbol ?? 'VEX',
    purchase,
    updateSettings,
    refreshStatus,
  };
}

export function useChatCallPricing() {
  const [status, setStatus] = useState<ChatCallPricingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [endingSession, setEndingSession] = useState(false);
  const [queuedOperationCount, setQueuedOperationCount] = useState(0);
  const callStatusEventName = 'vex:chat-call-status-changed';
  const processingQueueRef = useRef(false);

  const START_OPERATION_TTL_MS = 45_000;
  const END_OPERATION_TTL_MS = 15 * 60_000;
  const MAX_QUEUE_RETRY_ATTEMPTS = 6;

  const token = localStorage.getItem('pwm_token');

  const emitBrowserEvent = useCallback((eventName: string, detail: Record<string, unknown>) => {
    if (typeof window === 'undefined') {
      return;
    }
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  }, []);

  const loadPrunedQueue = useCallback((): ChatCallQueuedOperation[] => {
    const existingQueue = readChatCallOperationsQueue();
    const prunedQueue = pruneExpiredChatCallOperations(existingQueue);
    if (prunedQueue.length !== existingQueue.length) {
      writeChatCallOperationsQueue(prunedQueue);
    }
    return prunedQueue;
  }, []);

  const refreshQueueCount = useCallback(() => {
    const queue = loadPrunedQueue();
    setQueuedOperationCount(queue.length);
    return queue;
  }, [loadPrunedQueue]);

  const isRetryableStatusCode = useCallback((statusCode: number): boolean => {
    return statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
  }, []);

  const requestStartCallSession = useCallback(async (
    receiverId: string,
    callType: 'voice' | 'video',
  ): Promise<{ success: true; session: ChatCallSession } | { success: false; error: string; retryable: boolean; statusCode?: number }> => {
    try {
      const res = await fetch('/api/chat/calls/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ receiverId, callType }),
      });

      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (res.ok) {
        return { success: true, session: data.session as ChatCallSession };
      }

      return {
        success: false,
        error: String((data as Record<string, unknown>).error || (data as Record<string, unknown>).message || 'فشل بدء المكالمة'),
        retryable: isRetryableStatusCode(res.status),
        statusCode: res.status,
      };
    } catch {
      return { success: false, error: 'خطأ في الاتصال', retryable: true };
    }
  }, [isRetryableStatusCode, token]);

  const requestEndCallSession = useCallback(async (
    sessionId: string,
  ): Promise<
    { success: true; billedMinutes?: number; chargedAmount?: number; newBalance?: number }
    | { success: false; error: string; retryable: boolean; statusCode?: number }
  > => {
    try {
      const res = await fetch('/api/chat/calls/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId }),
      });

      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (res.ok) {
        return {
          success: true,
          billedMinutes: Number((data as Record<string, unknown>).billedMinutes || 0),
          chargedAmount: Number((data as Record<string, unknown>).chargedAmount || 0),
          newBalance: Number((data as Record<string, unknown>).payerNewBalance || 0),
        };
      }

      return {
        success: false,
        error: String((data as Record<string, unknown>).error || (data as Record<string, unknown>).message || 'فشل إنهاء المكالمة'),
        retryable: isRetryableStatusCode(res.status),
        statusCode: res.status,
      };
    } catch {
      return { success: false, error: 'خطأ في الاتصال', retryable: true };
    }
  }, [isRetryableStatusCode, token]);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/calls/pricing', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error('[ChatCalls] Pricing/status check failed:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const processQueuedOperations = useCallback(async () => {
    if (!token || processingQueueRef.current) {
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }

    processingQueueRef.current = true;
    try {
      const now = Date.now();
      const queue = loadPrunedQueue();
      if (!queue.length) {
        setQueuedOperationCount(0);
        return;
      }

      const nextQueue: ChatCallQueuedOperation[] = [];
      let shouldRefreshStatus = false;

      for (const operation of queue) {
        if (operation.nextRetryAt > now) {
          nextQueue.push(operation);
          continue;
        }

        if (operation.kind === 'start') {
          const result = await requestStartCallSession(operation.receiverId, operation.callType);
          if (result.success) {
            shouldRefreshStatus = true;
            emitBrowserEvent(CHAT_CALL_QUEUED_START_PROCESSED_EVENT, {
              operationId: operation.id,
              receiverId: operation.receiverId,
              callType: operation.callType,
              session: result.session,
            });
            continue;
          }

          if (result.retryable && operation.attempts + 1 < MAX_QUEUE_RETRY_ATTEMPTS && operation.expiresAt > now) {
            const nextAttempt = operation.attempts + 1;
            const retryDelayMs = Math.min(60_000, 2_000 * Math.pow(2, nextAttempt - 1));
            nextQueue.push({
              ...operation,
              attempts: nextAttempt,
              nextRetryAt: now + retryDelayMs,
            });
            continue;
          }

          emitBrowserEvent(CHAT_CALL_QUEUED_OPERATION_FAILED_EVENT, {
            operationId: operation.id,
            kind: operation.kind,
            receiverId: operation.receiverId,
            callType: operation.callType,
            error: result.error,
            statusCode: result.statusCode,
          });
          continue;
        }

        const result = await requestEndCallSession(operation.sessionId);
        if (result.success) {
          shouldRefreshStatus = true;
          emitBrowserEvent(CHAT_CALL_QUEUED_END_PROCESSED_EVENT, {
            operationId: operation.id,
            sessionId: operation.sessionId,
            billedMinutes: result.billedMinutes,
            chargedAmount: result.chargedAmount,
            newBalance: result.newBalance,
          });
          continue;
        }

        if (result.retryable && operation.attempts + 1 < MAX_QUEUE_RETRY_ATTEMPTS && operation.expiresAt > now) {
          const nextAttempt = operation.attempts + 1;
          const retryDelayMs = Math.min(60_000, 2_000 * Math.pow(2, nextAttempt - 1));
          nextQueue.push({
            ...operation,
            attempts: nextAttempt,
            nextRetryAt: now + retryDelayMs,
          });
          continue;
        }

        emitBrowserEvent(CHAT_CALL_QUEUED_OPERATION_FAILED_EVENT, {
          operationId: operation.id,
          kind: operation.kind,
          sessionId: operation.sessionId,
          error: result.error,
          statusCode: result.statusCode,
        });
      }

      writeChatCallOperationsQueue(nextQueue);
      setQueuedOperationCount(nextQueue.length);

      if (shouldRefreshStatus) {
        await refreshStatus();
      }
    } finally {
      processingQueueRef.current = false;
    }
  }, [emitBrowserEvent, loadPrunedQueue, refreshStatus, requestEndCallSession, requestStartCallSession, token]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    refreshQueueCount();
    void processQueuedOperations();
  }, [processQueuedOperations, refreshQueueCount]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleStatusChanged = () => {
      void refreshStatus();
      void processQueuedOperations();
    };

    window.addEventListener(callStatusEventName, handleStatusChanged);
    return () => {
      window.removeEventListener(callStatusEventName, handleStatusChanged);
    };
  }, [callStatusEventName, processQueuedOperations, refreshStatus]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleQueueChanged = () => {
      refreshQueueCount();
      void processQueuedOperations();
    };

    window.addEventListener(CHAT_CALL_OP_QUEUE_UPDATED_EVENT, handleQueueChanged);
    return () => {
      window.removeEventListener(CHAT_CALL_OP_QUEUE_UPDATED_EVENT, handleQueueChanged);
    };
  }, [processQueuedOperations, refreshQueueCount]);

  useEffect(() => {
    if (typeof window === 'undefined' || !status?.activeSession?.id) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshStatus();
      void processQueuedOperations();
    }, 8000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [processQueuedOperations, refreshStatus, status?.activeSession?.id]);

  useEffect(() => {
    if (typeof window === 'undefined' || queuedOperationCount <= 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void processQueuedOperations();
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [processQueuedOperations, queuedOperationCount]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const handleLifecycleRefresh = () => {
      if (document.visibilityState === 'visible') {
        void refreshStatus();
        void processQueuedOperations();
      }
    };

    const handleOnline = () => {
      void processQueuedOperations();
    };

    window.addEventListener('focus', handleLifecycleRefresh);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleLifecycleRefresh);

    return () => {
      window.removeEventListener('focus', handleLifecycleRefresh);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleLifecycleRefresh);
    };
  }, [processQueuedOperations, refreshStatus]);

  const startCallSession = useCallback(async (
    receiverId: string,
    callType: 'voice' | 'video',
  ): Promise<{ success: boolean; error?: string; session?: ChatCallSession; queued?: boolean; operationId?: string }> => {
    const immediateResult = await requestStartCallSession(receiverId, callType);
    if (immediateResult.success) {
      await refreshStatus();
      return { success: true, session: immediateResult.session };
    }

    if (immediateResult.retryable) {
      const queuedResult = enqueueChatCallOperation(createQueuedStartOperation({
        receiverId,
        callType,
        ttlMs: START_OPERATION_TTL_MS,
      }));

      setQueuedOperationCount(queuedResult.queue.length);
      void processQueuedOperations();

      return {
        success: true,
        queued: true,
        operationId: queuedResult.operation.id,
      };
    }

    return { success: false, error: immediateResult.error };
  }, [processQueuedOperations, refreshStatus, requestStartCallSession]);

  const endCallSession = useCallback(async (
    sessionId: string,
  ): Promise<{
    success: boolean;
    error?: string;
    billedMinutes?: number;
    chargedAmount?: number;
    newBalance?: number;
    queued?: boolean;
    operationId?: string;
  }> => {
    setEndingSession(true);
    try {
      const immediateResult = await requestEndCallSession(sessionId);
      if (immediateResult.success) {
        await refreshStatus();
        return {
          success: true,
          billedMinutes: immediateResult.billedMinutes,
          chargedAmount: immediateResult.chargedAmount,
          newBalance: immediateResult.newBalance,
        };
      }

      if (immediateResult.retryable) {
        const queuedResult = enqueueChatCallOperation(createQueuedEndOperation({
          sessionId,
          ttlMs: END_OPERATION_TTL_MS,
        }));

        setQueuedOperationCount(queuedResult.queue.length);
        void processQueuedOperations();

        return {
          success: true,
          queued: true,
          operationId: queuedResult.operation.id,
        };
      }

      return { success: false, error: immediateResult.error };
    } finally {
      setEndingSession(false);
    }
  }, [processQueuedOperations, refreshStatus, requestEndCallSession]);

  return {
    status,
    loading,
    endingSession,
    queuedOperationCount,
    voicePricePerMinute: status?.voicePricePerMinute ?? 0,
    videoPricePerMinute: status?.videoPricePerMinute ?? 0,
    userBalance: status?.userBalance ?? 0,
    currencySymbol: status?.currencySymbol ?? 'VEX',
    activeSession: status?.activeSession ?? null,
    canStartVoiceCall: status?.canStartVoiceCall ?? false,
    canStartVideoCall: status?.canStartVideoCall ?? false,
    startCallSession,
    endCallSession,
    refreshStatus,
  };
}
