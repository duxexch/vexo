import { useState, useCallback, useEffect } from 'react';

interface MediaPermission {
  mediaEnabled: boolean;
  grantedBy: string | null;
  grantedAt: string | null;
  expiresAt: string | null;
  pricePaid: number;
}

interface AutoDeletePermission {
  autoDeleteEnabled: boolean;
  deleteAfterMinutes: number;
  grantedBy: string | null;
  grantedAt: string | null;
  expiresAt: string | null;
  pricePaid: number;
}

interface PriceInfo {
  price: number;
  currency: string;
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
      return { success: false, error: data.message };
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
      return { success: false, error: data.message };
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
      return { success: false, error: data.message };
    } catch {
      return { success: false, error: 'خطأ في الاتصال' };
    }
  }, [token, refreshStatus]);

  return {
    permission,
    loading,
    hasAutoDelete: permission?.autoDeleteEnabled ?? false,
    deleteAfterMinutes: permission?.deleteAfterMinutes ?? 60,
    purchase,
    updateSettings,
    refreshStatus,
  };
}
