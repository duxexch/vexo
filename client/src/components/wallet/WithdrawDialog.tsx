import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowUpFromLine,
  Bitcoin,
  Building2,
  CreditCard,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useGuidedFocus } from "@/hooks/use-guided-focus";
import {
  formatWalletNativeAmount,
  getCurrencySymbol,
} from "@/lib/wallet-currency";
import type { CountryPaymentMethod } from "@shared/schema";

export interface WithdrawDialogWalletEntry {
  currency: string;
  balance: string;
  isPrimary: boolean;
}

export interface WithdrawDialogSubmitPayload {
  amount: number;
  paymentMethodId: string;
  receiverMethodNumber: string;
  currency: string;
}

export interface WithdrawDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  multiCurrencyEnabled: boolean;
  wallets: WithdrawDialogWalletEntry[];
  defaultCurrency: string;
  fallbackBalance: number;
  currencySymbolByCode?: Record<string, string>;
  paymentMethods: CountryPaymentMethod[];
  onSubmit: (payload: WithdrawDialogSubmitPayload) => void;
  isSubmitting: boolean;
}

function getMethodIcon(type: string) {
  switch (type) {
    case "bank_transfer":
      return Building2;
    case "card":
      return CreditCard;
    case "e_wallet":
      return Smartphone;
    case "crypto":
      return Bitcoin;
    default:
      return CreditCard;
  }
}

export function WithdrawDialog({
  open,
  onOpenChange,
  multiCurrencyEnabled,
  wallets,
  defaultCurrency,
  fallbackBalance,
  currencySymbolByCode,
  paymentMethods,
  onSubmit,
  isSubmitting,
}: WithdrawDialogProps) {
  const { t, language } = useI18n();
  const { focusAndScroll, queueFocus, focusFirstInteractiveIn } = useGuidedFocus();

  const [withdrawCurrency, setWithdrawCurrency] = useState<string>("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawPaymentMethod, setWithdrawPaymentMethod] = useState("");
  const [withdrawReceiverNumber, setWithdrawReceiverNumber] = useState("");

  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const paymentSectionRef = useRef<HTMLDivElement | null>(null);
  const receiverInputRef = useRef<HTMLInputElement | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  // Reset all fields whenever the dialog opens so a previous, abandoned
  // attempt cannot leak into the next one (this used to be done by the
  // parent's mutation onSuccess; we move it here so the component is
  // self-contained and matches Radix Dialog's mount/unmount lifecycle).
  useEffect(() => {
    if (open) {
      setWithdrawCurrency("");
      setWithdrawAmount("");
      setWithdrawPaymentMethod("");
      setWithdrawReceiverNumber("");
      queueFocus(amountInputRef.current);
    }
  }, [open]);

  const effectiveWithdrawCurrency = withdrawCurrency || defaultCurrency;

  const withdrawWalletEntry = useMemo(() => {
    return wallets.find((w) => w.currency === effectiveWithdrawCurrency) || null;
  }, [wallets, effectiveWithdrawCurrency]);

  const withdrawAvailableBalance = withdrawWalletEntry
    ? Number.parseFloat(withdrawWalletEntry.balance || "0")
    : fallbackBalance;

  const withdrawCurrencySymbol = getCurrencySymbol(
    effectiveWithdrawCurrency,
    currencySymbolByCode,
  );

  const handleSubmit = () => {
    const parsedAmount = parseFloat(withdrawAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      focusAndScroll(amountInputRef.current);
      return;
    }

    if (parsedAmount > withdrawAvailableBalance) {
      focusAndScroll(amountInputRef.current);
      return;
    }

    if (!withdrawPaymentMethod) {
      focusFirstInteractiveIn(paymentSectionRef.current);
      return;
    }

    const sanitizedReceiverNumber = withdrawReceiverNumber.trim();
    if (!sanitizedReceiverNumber) {
      focusAndScroll(receiverInputRef.current);
      return;
    }

    onSubmit({
      amount: parsedAmount,
      paymentMethodId: withdrawPaymentMethod,
      receiverMethodNumber: sanitizedReceiverNumber,
      currency: effectiveWithdrawCurrency,
    });
  };

  const exceedsBalance =
    !!withdrawAmount && parseFloat(withdrawAmount) > withdrawAvailableBalance;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpFromLine className="h-5 w-5 text-red-500" />
            {t("wallet.withdraw")}
          </DialogTitle>
          <DialogDescription>{t("wallet.withdrawDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pb-1">
          {multiCurrencyEnabled && wallets.length > 1 && (
            <div className="space-y-2">
              <Label>{language === "ar" ? "العملة" : "Currency"}</Label>
              <Select
                value={effectiveWithdrawCurrency}
                onValueChange={(v) => {
                  setWithdrawCurrency(v);
                  setWithdrawAmount("");
                }}
              >
                <SelectTrigger data-testid="select-withdraw-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {wallets.map((w) => (
                    <SelectItem key={w.currency} value={w.currency}>
                      {w.currency}{" "}
                      {w.isPrimary
                        ? language === "ar"
                          ? "(أساسية)"
                          : "(Primary)"
                        : ""}{" "}
                      — {Number.parseFloat(w.balance).toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="p-3 bg-muted rounded-lg text-sm">
            <span className="text-muted-foreground">
              {t("wallet.availableBalance")}:{" "}
            </span>
            <span
              className="font-bold text-primary"
              data-testid="text-withdraw-available"
            >
              {withdrawCurrencySymbol}
              {withdrawAvailableBalance.toFixed(2)} {effectiveWithdrawCurrency}
            </span>
          </div>
          <div>
            <Label>{t("wallet.amount")}</Label>
            <Input
              ref={amountInputRef}
              type="number"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                focusFirstInteractiveIn(paymentSectionRef.current);
              }}
              placeholder="0.00"
              inputMode="decimal"
              enterKeyHint="next"
              className="mt-2"
              data-testid="input-withdraw-amount"
            />
            {exceedsBalance && (
              <p
                className="mt-1 text-xs text-red-500"
                data-testid="text-withdraw-exceeds"
              >
                {language === "ar"
                  ? "المبلغ يتجاوز الرصيد المتاح"
                  : "Amount exceeds available balance"}
              </p>
            )}
            <div className="flex gap-2 mt-2 flex-wrap">
              {[10, 25, 50, 100].map((amount) => (
                <Button
                  key={amount}
                  variant={
                    withdrawAmount === String(amount) ? "default" : "outline"
                  }
                  size="sm"
                  className="text-xs"
                  onClick={() => setWithdrawAmount(String(amount))}
                >
                  {formatWalletNativeAmount(
                    amount,
                    effectiveWithdrawCurrency,
                    currencySymbolByCode,
                    { withCode: true },
                  )}
                </Button>
              ))}
              <Button
                variant={
                  withdrawAmount === String(withdrawAvailableBalance.toFixed(2))
                    ? "default"
                    : "outline"
                }
                size="sm"
                className="text-xs"
                onClick={() =>
                  setWithdrawAmount(String(withdrawAvailableBalance.toFixed(2)))
                }
              >
                {language === "ar" ? "الكل" : "All"}
              </Button>
            </div>
          </div>
          <div>
            <Label>{t("wallet.paymentMethod")}</Label>
            <div
              ref={paymentSectionRef}
              className="grid grid-cols-2 gap-2 mt-2"
            >
              {paymentMethods.map((method) => {
                const Icon = getMethodIcon(method.type);
                return (
                  <Button
                    key={method.id}
                    variant={
                      withdrawPaymentMethod === method.id ? "default" : "outline"
                    }
                    className="h-auto py-3 flex-col"
                    onClick={() => {
                      setWithdrawPaymentMethod(method.id);
                      queueFocus(receiverInputRef.current);
                    }}
                    data-testid={`button-withdraw-payment-${method.id}`}
                  >
                    <Icon className="h-5 w-5 mb-1" />
                    <span className="text-xs font-medium">{method.name}</span>
                    <span className="text-[10px] opacity-90">
                      {method.methodNumber || "-"}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>
          <div>
            <Label>
              {language === "ar"
                ? "رقم الوسيلة المستلم عليها"
                : "Receiver Wallet / Account Number"}
            </Label>
            <Input
              ref={receiverInputRef}
              value={withdrawReceiverNumber}
              onChange={(e) => setWithdrawReceiverNumber(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                queueFocus(confirmButtonRef.current);
              }}
              placeholder={
                language === "ar"
                  ? "أدخل رقم الوسيلة المستلم عليها"
                  : "Enter receiver wallet or account number"
              }
              enterKeyHint="done"
              className="mt-2"
              data-testid="input-withdraw-receiver"
            />
          </div>
        </div>
        <DialogFooter className="sticky bottom-0 z-10 px-4 sm:px-6 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-5 pt-3 border-t bg-background">
          <Button
            className="w-full sm:w-auto min-h-11"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            ref={confirmButtonRef}
            className="w-full sm:w-auto min-h-11"
            onClick={handleSubmit}
            disabled={
              !withdrawAmount ||
              !withdrawPaymentMethod ||
              !withdrawReceiverNumber.trim() ||
              isSubmitting ||
              parseFloat(withdrawAmount) > withdrawAvailableBalance
            }
            data-testid="button-confirm-withdraw"
          >
            {isSubmitting && (
              <RefreshCw className="h-4 w-4 me-2 animate-spin" />
            )}
            {t("wallet.confirmWithdraw")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
