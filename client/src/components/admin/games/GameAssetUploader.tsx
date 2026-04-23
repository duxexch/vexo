import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Upload, X, ImageIcon, Loader2, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { adminFetch } from "@/lib/admin-fetch";
import { cn } from "@/lib/utils";

interface GameAssetUploaderProps {
  label: string;
  description?: string;
  value: string;
  onChange: (url: string) => void;
  recommendedSize?: string;
  language: "ar" | "en" | string;
  aspectRatio?: "square" | "wide" | "card";
  testIdPrefix?: string;
  maxSizeMB?: number;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      if (!result.startsWith("data:")) {
        reject(new Error("Invalid file data"));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

const ASPECT_CLASSES: Record<NonNullable<GameAssetUploaderProps["aspectRatio"]>, string> = {
  square: "aspect-square",
  wide: "aspect-[16/9]",
  card: "aspect-[4/3]",
};

export function GameAssetUploader({
  label,
  description,
  value,
  onChange,
  recommendedSize,
  language,
  aspectRatio = "square",
  testIdPrefix = "asset",
  maxSizeMB = 5,
}: GameAssetUploaderProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState(value);

  const isAr = language === "ar";
  const t = (ar: string, en: string) => (isAr ? ar : en);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({
        title: t("ملف غير صالح", "Invalid file"),
        description: t("يرجى اختيار صورة فقط", "Please choose an image"),
        variant: "destructive",
      });
      return;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      toast({
        title: t("الملف كبير جداً", "File too large"),
        description: t(`الحد الأقصى ${maxSizeMB} ميجا`, `Max ${maxSizeMB} MB`),
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const fileData = await fileToDataUrl(file);
      const result = (await adminFetch("/api/upload", {
        method: "POST",
        body: JSON.stringify({ fileData, fileName: file.name }),
      })) as { url?: string };
      const url = typeof result?.url === "string" ? result.url : "";
      if (!url) throw new Error(t("فشل رفع الملف", "Upload failed"));
      onChange(url);
      toast({ title: t("تم الرفع بنجاح", "Uploaded successfully") });
    } catch (err) {
      toast({
        title: t("فشل الرفع", "Upload failed"),
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void handleFile(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-foreground">{label}</div>
          {description && (
            <div className="text-xs text-muted-foreground">{description}</div>
          )}
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setUrlDraft(value);
              setShowUrlInput((s) => !s);
            }}
            data-testid={`${testIdPrefix}-toggle-url`}
          >
            <LinkIcon className="h-3 w-3 mr-1" />
            {t("رابط", "URL")}
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              onClick={() => onChange("")}
              data-testid={`${testIdPrefix}-clear`}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {showUrlInput && (
        <div className="flex gap-2">
          <Input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="https://... or /uploads/..."
            className="h-9 text-sm"
            data-testid={`${testIdPrefix}-url-input`}
          />
          <Button
            type="button"
            size="sm"
            onClick={() => {
              onChange(urlDraft.trim());
              setShowUrlInput(false);
            }}
            data-testid={`${testIdPrefix}-url-save`}
          >
            {t("حفظ", "Save")}
          </Button>
        </div>
      )}

      <div
        className={cn(
          "relative w-full overflow-hidden rounded-xl border-2 border-dashed transition-all",
          ASPECT_CLASSES[aspectRatio],
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
          uploading && "pointer-events-none opacity-60",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        data-testid={`${testIdPrefix}-dropzone`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onInputChange}
          data-testid={`${testIdPrefix}-file-input`}
        />

        {value ? (
          <img
            src={value}
            alt={label}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground p-3 text-center">
            <ImageIcon className="h-8 w-8" />
            <div className="text-xs">
              {t("اسحب صورة أو انقر للرفع", "Drag image or click to upload")}
            </div>
            {recommendedSize && (
              <div className="text-[10px] text-muted-foreground/70">
                {t("مقاس مفضّل", "Recommended")}: {recommendedSize}
              </div>
            )}
          </div>
        )}

        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {value && !uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity hover:bg-black/40 hover:opacity-100">
            <div className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-900 shadow-md">
              <Upload className="h-3 w-3" />
              {t("تغيير", "Change")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
