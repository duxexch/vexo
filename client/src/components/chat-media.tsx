import { useState, useRef, useCallback } from "react";
import { Paperclip, Image, Video, X, Loader2, ShoppingCart, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface MediaUploadButtonProps {
  hasAccess: boolean;
  uploading: boolean;
  uploadProgress: number;
  onUpload: (file: File) => void;
  onPurchaseClick: () => void;
  disabled?: boolean;
}

const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "video/mp4", "video/webm",
];
const MAX_SIZE = 25 * 1024 * 1024; // 25MB

export function MediaUploadButton({
  hasAccess,
  uploading,
  uploadProgress,
  onUpload,
  onPurchaseClick,
  disabled,
}: MediaUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    if (!hasAccess) {
      onPurchaseClick();
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      alert("نوع الملف غير مدعوم. يُسمح بـ: صور (JPEG, PNG, GIF, WebP) وفيديو (MP4, WebM)");
      return;
    }

    if (file.size > MAX_SIZE) {
      alert("حجم الملف كبير جداً. الحد الأقصى 25 ميغابايت");
      return;
    }

    onUpload(file);
    // Reset input so same file can be selected again
    e.target.value = "";
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
        className="hidden"
        onChange={handleFileSelect}
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={handleClick}
        disabled={disabled || uploading}
        className="shrink-0 relative"
        title={hasAccess ? "إرفاق ملف" : "شراء ميزة الوسائط"}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : hasAccess ? (
          <Paperclip className="h-4 w-4" />
        ) : (
          <div className="relative">
            <Paperclip className="h-4 w-4 opacity-50" />
            <Lock className="h-2.5 w-2.5 absolute -bottom-0.5 -end-0.5 text-amber-500" />
          </div>
        )}
      </Button>
      {uploading && (
        <div className="absolute bottom-full mb-2 start-0 end-0 px-4">
          <Progress value={uploadProgress} className="h-1" />
        </div>
      )}
    </>
  );
}

// Purchase Dialog
interface MediaPurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPurchase: () => Promise<{ success: boolean; error?: string; newBalance?: number }>;
  price?: number;
  userBalance?: number;
}

export function MediaPurchaseDialog({ open, onOpenChange, onPurchase, price = 100, userBalance = 0 }: MediaPurchaseDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAfford = userBalance >= price;

  const handlePurchase = async () => {
    setLoading(true);
    setError(null);
    const result = await onPurchase();
    if (result.success) {
      onOpenChange(false);
    } else {
      setError(result.error || "فشل في الشراء");
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            شراء ميزة إرسال الوسائط
          </DialogTitle>
          <DialogDescription>
            أرسل صور وفيديوهات في المحادثات الخاصة
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">السعر</span>
              <span className="font-bold text-lg">{price} عملة</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">رصيدك</span>
              <span className={cn("font-medium", canAfford ? "text-emerald-500" : "text-destructive")}>
                {userBalance} عملة
              </span>
            </div>
          </div>

          <div className="text-sm text-muted-foreground space-y-1">
            <p>✅ إرسال صور (JPEG, PNG, GIF, WebP)</p>
            <p>✅ إرسال فيديوهات (MP4, WebM)</p>
            <p>✅ حجم أقصى 25 ميجابايت</p>
            <p>✅ الميزة دائمة بلا حدود</p>
          </div>

          {error && <p className="text-sm text-destructive text-center">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={handlePurchase} disabled={loading || !canAfford}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin me-2" />
                جاري الشراء...
              </>
            ) : !canAfford ? (
              "رصيد غير كافٍ"
            ) : (
              <>
                <ShoppingCart className="h-4 w-4 me-2" />
                شراء ({price} عملة)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Media message renderer (for displaying images/videos in chat bubbles)
interface ChatMediaRendererProps {
  mediaUrl: string;
  mediaMimeType?: string;
  mediaOriginalName?: string;
  mediaThumbnailUrl?: string;
  className?: string;
}

export function ChatMediaRenderer({ mediaUrl, mediaMimeType, mediaOriginalName, mediaThumbnailUrl, className }: ChatMediaRendererProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const isVideo = mediaMimeType?.startsWith("video/");

  if (isVideo) {
    return (
      <div className={cn("max-w-[280px] rounded-lg overflow-hidden", className)}>
        <video
          src={mediaUrl}
          poster={mediaThumbnailUrl || undefined}
          controls
          preload="metadata"
          className="w-full max-h-[300px] rounded-lg"
        >
          متصفحك لا يدعم الفيديو
        </video>
        {mediaOriginalName && (
          <p className="text-xs text-muted-foreground truncate mt-1 px-1">{mediaOriginalName}</p>
        )}
      </div>
    );
  }

  return (
    <>
      <div
        className={cn("max-w-[280px] cursor-pointer rounded-lg overflow-hidden", className)}
        onClick={() => setLightboxOpen(true)}
      >
        <img
          src={mediaThumbnailUrl || mediaUrl}
          alt={mediaOriginalName || "صورة"}
          className="w-full max-h-[300px] object-cover rounded-lg hover:opacity-90 transition-opacity"
          loading="lazy"
        />
      </div>

      {/* Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-4xl p-2 bg-black/95">
          <img
            src={mediaUrl}
            alt={mediaOriginalName || "صورة"}
            className="w-full h-auto max-h-[85vh] object-contain rounded"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
