import { useState, useEffect } from "react";
import { Timer, ShoppingCart, Loader2, Clock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Auto-delete timer options
const AUTO_DELETE_OPTIONS = [
  { value: 5, label: "5 دقائق" },
  { value: 15, label: "15 دقيقة" },
  { value: 30, label: "30 دقيقة" },
  { value: 60, label: "ساعة واحدة" },
  { value: 360, label: "6 ساعات" },
  { value: 1440, label: "24 ساعة" },
  { value: 10080, label: "7 أيام" },
];

interface AutoDeleteToggleProps {
  hasAccess: boolean;
  isActive: boolean;
  deleteAfterMinutes: number;
  onToggle: () => void;
  onPurchaseClick: () => void;
  onSettingsClick: () => void;
}

export function AutoDeleteToggle({
  hasAccess,
  isActive,
  deleteAfterMinutes,
  onToggle,
  onPurchaseClick,
  onSettingsClick,
}: AutoDeleteToggleProps) {
  if (!hasAccess) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onPurchaseClick}
            className="shrink-0 relative"
          >
            <Timer className="h-4 w-4 opacity-50" />
            <ShoppingCart className="h-2.5 w-2.5 absolute -bottom-0.5 -end-0.5 text-amber-500" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>شراء ميزة الحذف التلقائي</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  const label = AUTO_DELETE_OPTIONS.find(o => o.value === deleteAfterMinutes)?.label || `${deleteAfterMinutes} دقيقة`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={isActive ? "default" : "ghost"}
          size="icon"
          onClick={onSettingsClick}
          className={cn("shrink-0", isActive && "text-primary-foreground")}
        >
          <Timer className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{isActive ? `الحذف التلقائي: ${label}` : "تفعيل الحذف التلقائي"}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// Purchase dialog
interface AutoDeletePurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPurchase: () => Promise<{ success: boolean; error?: string; newBalance?: number }>;
  price?: number;
  userBalance?: number;
}

export function AutoDeletePurchaseDialog({
  open,
  onOpenChange,
  onPurchase,
  price = 50,
  userBalance = 0,
}: AutoDeletePurchaseDialogProps) {
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
            <Timer className="h-5 w-5" />
            شراء ميزة الحذف التلقائي
          </DialogTitle>
          <DialogDescription>
            حذف الرسائل تلقائياً بعد فترة محددة لمزيد من الخصوصية
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
            <p>✅ حذف تلقائي للرسائل بعد فترة</p>
            <p>✅ اختيار المدة (5 دقائق - 7 أيام)</p>
            <p>✅ حذف الوسائط المرفقة أيضاً</p>
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

// Settings dialog
interface AutoDeleteSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMinutes: number;
  onSave: (minutes: number) => Promise<{ success: boolean; error?: string }>;
}

export function AutoDeleteSettingsDialog({
  open,
  onOpenChange,
  currentMinutes,
  onSave,
}: AutoDeleteSettingsDialogProps) {
  const [selected, setSelected] = useState(String(currentMinutes));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    const result = await onSave(parseInt(selected));
    if (result.success) {
      onOpenChange(false);
    } else {
      setError(result.error || "فشل في الحفظ");
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            إعدادات الحذف التلقائي
          </DialogTitle>
          <DialogDescription>
            اختر المدة التي تريد بعدها حذف الرسائل تلقائياً
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger>
              <SelectValue placeholder="اختر المدة" />
            </SelectTrigger>
            <SelectContent>
              {AUTO_DELETE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            <p className="text-sm font-medium text-amber-600 flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              تنبيه
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              سيتم حذف الرسائل الجديدة تلقائياً بعد المدة المحددة. لا يمكن استرجاع الرسائل المحذوفة.
            </p>
          </div>

          {error && <p className="text-sm text-destructive text-center">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin me-2" />
                جاري الحفظ...
              </>
            ) : (
              "حفظ الإعدادات"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Message countdown badge
interface AutoDeleteCountdownProps {
  autoDeleteAt: string;
  className?: string;
}

export function AutoDeleteCountdown({ autoDeleteAt, className }: AutoDeleteCountdownProps) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const update = () => {
      const diff = new Date(autoDeleteAt).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("حذف...");
        return;
      }
      if (diff < 60000) {
        setTimeLeft(`${Math.ceil(diff / 1000)}ث`);
      } else if (diff < 3600000) {
        setTimeLeft(`${Math.ceil(diff / 60000)}د`);
      } else if (diff < 86400000) {
        setTimeLeft(`${Math.ceil(diff / 3600000)}س`);
      } else {
        setTimeLeft(`${Math.ceil(diff / 86400000)}ي`);
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [autoDeleteAt]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge 
          variant="outline" 
          className={cn("text-[10px] px-1 py-0 h-4 gap-0.5 text-amber-500 border-amber-500/30", className)}
        >
          <Timer className="h-2.5 w-2.5" />
          {timeLeft}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>سيتم حذف هذه الرسالة تلقائياً</p>
      </TooltipContent>
    </Tooltip>
  );
}
