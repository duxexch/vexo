import { useState, useCallback, useEffect } from 'react';

interface PinStatus {
  pinEnabled: boolean;
  isLocked: boolean;
  lockedUntil: string | null;
  failedAttempts: number;
  pinSetAt: string | null;
}

export function useChatPin() {
  const [pinStatus, setPinStatus] = useState<PinStatus | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [unlockToken, setUnlockToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('pwm_token')}`,
  }), []);

  // Check PIN status on mount
  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/pin/status', { headers: headers() });
      const data = await res.json();
      setPinStatus(data);

      // If PIN not enabled, chat is accessible
      if (!data.pinEnabled) {
        setIsUnlocked(true);
      }

      // Check for saved unlock token
      const saved = sessionStorage.getItem('chat_unlock_token');
      const savedExpiry = sessionStorage.getItem('chat_unlock_expiry');
      if (saved && savedExpiry && Date.now() < parseInt(savedExpiry)) {
        setUnlockToken(saved);
        setIsUnlocked(true);
      }
    } catch (err) {
      console.error('[PIN] Status check failed:', err);
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Set up a new PIN
  const setupPin = useCallback(async (pin: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/chat/pin/set', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ pin, password }),
      });
      const data = await res.json();

      if (res.ok) {
        await refreshStatus();
        return { success: true };
      }
      return { success: false, error: data.message || 'فشل في تعيين الرمز' };
    } catch {
      return { success: false, error: 'خطأ في الاتصال' };
    }
  }, [headers, refreshStatus]);

  // Unlock with PIN
  const unlock = useCallback(async (pin: string): Promise<{ success: boolean; error?: string; remainingAttempts?: number }> => {
    try {
      const res = await fetch('/api/chat/pin/unlock', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      const returnedToken = data.token || data.unlockToken;
      const remainingAttempts = data.remainingAttempts ?? data.attemptsRemaining;

      if (res.ok && returnedToken) {
        setUnlockToken(returnedToken);
        setIsUnlocked(true);
        // Save to session (30 minutes)
        sessionStorage.setItem('chat_unlock_token', returnedToken);
        sessionStorage.setItem('chat_unlock_expiry', String(Date.now() + 30 * 60 * 1000));
        return { success: true };
      }

      return {
        success: false,
        error: data.message || 'رمز خاطئ',
        remainingAttempts,
      };
    } catch {
      return { success: false, error: 'خطأ في الاتصال' };
    }
  }, [headers]);

  // Change PIN
  const changePin = useCallback(async (currentPin: string, newPin: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/chat/pin/change', {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ oldPin: currentPin, currentPin, newPin }),
      });
      const data = await res.json();

      if (res.ok) return { success: true };
      return { success: false, error: data.message || 'فشل في تغيير الرمز' };
    } catch {
      return { success: false, error: 'خطأ في الاتصال' };
    }
  }, [headers]);

  // Remove PIN  
  const removePin = useCallback(async (password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/chat/pin/remove', {
        method: 'DELETE',
        headers: headers(),
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (res.ok) {
        setIsUnlocked(true);
        sessionStorage.removeItem('chat_unlock_token');
        sessionStorage.removeItem('chat_unlock_expiry');
        await refreshStatus();
        return { success: true };
      }
      return { success: false, error: data.message || 'فشل في إزالة الرمز' };
    } catch {
      return { success: false, error: 'خطأ في الاتصال' };
    }
  }, [headers, refreshStatus]);

  // Lock manually
  const lock = useCallback(() => {
    setIsUnlocked(false);
    setUnlockToken(null);
    sessionStorage.removeItem('chat_unlock_token');
    sessionStorage.removeItem('chat_unlock_expiry');
  }, []);

  return {
    pinStatus,
    isUnlocked,
    unlockToken,
    loading,
    hasPinEnabled: pinStatus?.pinEnabled ?? false,
    isLocked: pinStatus?.pinEnabled && !isUnlocked,
    setupPin,
    unlock,
    changePin,
    removePin,
    lock,
    refreshStatus,
  };
}
