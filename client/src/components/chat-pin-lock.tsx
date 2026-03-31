import { useState, useRef, useEffect, useCallback } from "react";
import { Lock, Eye, EyeOff, Shield, AlertTriangle, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface PinLockScreenProps {
  onUnlock: (pin: string) => Promise<{ success: boolean; error?: string; remainingAttempts?: number }>;
  isLocked: boolean;
  lockedUntil?: string | null;
  failedAttempts?: number;
}

export function PinLockScreen({ onUnlock, isLocked, lockedUntil, failedAttempts = 0 }: PinLockScreenProps) {
  const [pin, setPin] = useState<string[]>(["", "", "", "", "", ""]);
  const [pinLength, setPinLength] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const isTimeLocked = lockedUntil && new Date(lockedUntil) > new Date();
  const [timeLeft, setTimeLeft] = useState("");

  // Countdown for locked time
  useEffect(() => {
    if (!isTimeLocked) return;
    const interval = setInterval(() => {
      const diff = new Date(lockedUntil!).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("");
        window.location.reload();
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${mins}:${secs.toString().padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimeLocked, lockedUntil]);

  const handleDigit = useCallback((index: number, digit: string) => {
    if (digit.length > 1 || !/^\d*$/.test(digit)) return;
    
    const newPin = [...pin];
    newPin[index] = digit;
    setPin(newPin);
    setError(null);

    // Move to next input
    if (digit && index < pinLength - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits entered
    const finalPin = newPin.slice(0, pinLength).join("");
    if (finalPin.length === pinLength && newPin.slice(0, pinLength).every(d => d !== "")) {
      handleSubmit(finalPin);
    }
  }, [pin, pinLength]);

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const newPin = [...pin];
      newPin[index - 1] = "";
      setPin(newPin);
    }
  }, [pin]);

  const handleSubmit = async (pinValue: string) => {
    if (loading) return;
    setLoading(true);
    setError(null);

    const result = await onUnlock(pinValue);
    
    if (!result.success) {
      setError(result.error || "رمز خاطئ");
      setShake(true);
      setTimeout(() => {
        setShake(false);
        setPin(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      }, 500);
    }
    setLoading(false);
  };

  if (isTimeLocked) {
    return (
      <div className="flex h-full items-center justify-center bg-background/95 backdrop-blur-sm p-6">
        <Card className="max-w-sm w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertTriangle className="mx-auto h-16 w-16 text-destructive" />
            <h3 className="text-lg font-bold text-destructive">تم قفل المحادثات</h3>
            <p className="text-muted-foreground">
              تم قفل المحادثات بسبب محاولات فاشلة متعددة
            </p>
            <div className="text-3xl font-mono font-bold text-destructive">{timeLeft}</div>
            <p className="text-xs text-muted-foreground">يمكنك المحاولة مرة أخرى بعد انتهاء الوقت</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center bg-background/95 backdrop-blur-sm p-6">
      <Card className={cn("max-w-sm w-full", shake && "animate-shake")}>
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 relative">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="h-10 w-10 text-primary" />
            </div>
            <div className="absolute -bottom-1 -end-1 w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center">
              <Shield className="h-4 w-4 text-white" />
            </div>
          </div>
          <CardTitle className="text-xl">المحادثات مقفلة</CardTitle>
          <CardDescription>أدخل رمز PIN للوصول إلى محادثاتك</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center gap-3 mb-6" dir="ltr">
            {Array.from({ length: pinLength }).map((_, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="password"
                inputMode="numeric"
                maxLength={1}
                value={pin[i]}
                onChange={(e) => handleDigit(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                disabled={loading}
                className={cn(
                  "w-12 h-14 text-center text-2xl font-bold rounded-lg border-2 bg-background",
                  "focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all",
                  error ? "border-destructive" : "border-input",
                  pin[i] ? "border-primary" : ""
                )}
                autoFocus={i === 0}
              />
            ))}
          </div>

          {error && (
            <div className="text-center mb-4">
              <p className="text-sm text-destructive font-medium">{error}</p>
              {failedAttempts > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  محاولات فاشلة: {failedAttempts}
                </p>
              )}
            </div>
          )}

          <div className="text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <KeyRound className="h-3 w-3" />
              محادثاتك محمية بالتشفير الطرفي E2EE
            </p>
          </div>
        </CardContent>
      </Card>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
          20%, 40%, 60%, 80% { transform: translateX(8px); }
        }
        .animate-shake { animation: shake 0.5s ease-in-out; }
      `}</style>
    </div>
  );
}

// PIN Setup Dialog
interface PinSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSetup: (pin: string, password: string) => Promise<{ success: boolean; error?: string }>;
}

export function PinSetupDialog({ open, onOpenChange, onSetup }: PinSetupDialogProps) {
  const [step, setStep] = useState<"pin" | "confirm" | "password">("pin");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setStep("pin");
    setPin("");
    setConfirmPin("");
    setPassword("");
    setError(null);
    setLoading(false);
  };

  const handlePinSubmit = () => {
    if (pin.length < 4 || pin.length > 6) {
      setError("يجب أن يكون الرمز بين 4 و 6 أرقام");
      return;
    }
    setError(null);
    setStep("confirm");
  };

  const handleConfirmSubmit = () => {
    if (confirmPin !== pin) {
      setError("الرمز لا يتطابق");
      setConfirmPin("");
      return;
    }
    setError(null);
    setStep("password");
  };

  const handlePasswordSubmit = async () => {
    if (!password) {
      setError("أدخل كلمة المرور");
      return;
    }
    setLoading(true);
    setError(null);
    
    const result = await onSetup(pin, password);
    if (result.success) {
      onOpenChange(false);
      reset();
    } else {
      setError(result.error || "فشل في تعيين الرمز");
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            {step === "pin" && "تعيين رمز PIN"}
            {step === "confirm" && "تأكيد الرمز"}
            {step === "password" && "تأكيد كلمة المرور"}
          </DialogTitle>
          <DialogDescription>
            {step === "pin" && "أدخل رمز PIN من 4-6 أرقام لحماية محادثاتك"}
            {step === "confirm" && "أعد إدخال الرمز للتأكيد"}
            {step === "password" && "أدخل كلمة مرور حسابك للتأكيد"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {step === "pin" && (
            <>
              <Input
                type="password"
                inputMode="numeric"
                placeholder="أدخل الرمز (4-6 أرقام)"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center text-xl tracking-widest"
                dir="ltr"
                autoFocus
              />
              <Button onClick={handlePinSubmit} className="w-full" disabled={pin.length < 4}>
                التالي
              </Button>
            </>
          )}

          {step === "confirm" && (
            <>
              <Input
                type="password"
                inputMode="numeric"
                placeholder="أعد إدخال الرمز"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center text-xl tracking-widest"
                dir="ltr"
                autoFocus
              />
              <Button onClick={handleConfirmSubmit} className="w-full" disabled={confirmPin.length < 4}>
                تأكيد
              </Button>
            </>
          )}

          {step === "password" && (
            <>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="كلمة مرور الحساب"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute end-0 top-0 h-full"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <Button onClick={handlePasswordSubmit} className="w-full" disabled={loading || !password}>
                {loading ? "جاري التعيين..." : "تعيين رمز PIN"}
              </Button>
            </>
          )}

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
