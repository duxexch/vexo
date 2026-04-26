import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface AdminBalanceAdjustDialogUser {
  id: string;
  username: string;
  profilePicture?: string | null;
  balance?: string | number | null;
}

export interface AdminBalanceAdjustDialogCurrencyData {
  primaryCurrency: string;
  allowedCurrencies: string[];
}

export type AdminBalanceAdjustWallet = "usd" | "vxc";
export type AdminBalanceAdjustType = "add" | "subtract";

export interface AdminBalanceAdjustSubmitPayload {
  wallet: AdminBalanceAdjustWallet;
  currencyCode?: string;
  amount: string;
  type: AdminBalanceAdjustType;
  reason: string;
}

export interface AdminBalanceAdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUser: AdminBalanceAdjustDialogUser | null;
  currencyWalletsData?: AdminBalanceAdjustDialogCurrencyData | null;
  initialCurrency?: string;
  initialWallet?: AdminBalanceAdjustWallet;
  isSubmitting?: boolean;
  onSubmit: (payload: AdminBalanceAdjustSubmitPayload) => void;
  formatBalance?: (raw: string | number | null | undefined) => string;
}

function defaultFormatBalance(raw: string | number | null | undefined): string {
  if (raw == null || raw === "") return "—";
  const n = typeof raw === "string" ? Number.parseFloat(raw) : raw;
  if (!Number.isFinite(n)) return String(raw);
  return n.toFixed(2);
}

export function AdminBalanceAdjustDialog({
  open,
  onOpenChange,
  selectedUser,
  currencyWalletsData,
  initialCurrency,
  initialWallet = "usd",
  isSubmitting = false,
  onSubmit,
  formatBalance = defaultFormatBalance,
}: AdminBalanceAdjustDialogProps) {
  const [adjustWallet, setAdjustWallet] = useState<AdminBalanceAdjustWallet>(
    initialWallet,
  );
  const [adjustCurrency, setAdjustCurrency] = useState<string>("");
  const [actionAmount, setActionAmount] = useState("");
  const [adjustType, setAdjustType] = useState<AdminBalanceAdjustType>("add");
  const [actionReason, setActionReason] = useState("");

  // Re-seed local state every time the dialog opens, so a previous
  // attempt's draft never leaks into the next one and so the currency
  // picker starts on whichever wallet the admin clicked Adjust for in
  // the per-currency table.
  useEffect(() => {
    if (open) {
      setAdjustWallet(initialWallet);
      setAdjustCurrency(initialCurrency || "");
      setActionAmount("");
      setAdjustType("add");
      setActionReason("");
    }
  }, [open, initialCurrency, initialWallet]);

  const handleConfirm = () => {
    onSubmit({
      wallet: adjustWallet,
      currencyCode:
        adjustWallet === "usd"
          ? adjustCurrency || currencyWalletsData?.primaryCurrency
          : undefined,
      amount: actionAmount,
      type: adjustType,
      reason: actionReason,
    });
  };

  const amountSuffix =
    adjustWallet === "vxc"
      ? "(VXC)"
      : `(${adjustCurrency || currencyWalletsData?.primaryCurrency || "USD"})`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-0.75rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adjust Balance</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {selectedUser && (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <Avatar>
                <AvatarImage src={selectedUser.profilePicture ?? undefined} />
                <AvatarFallback>
                  {selectedUser.username.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{selectedUser.username}</p>
                <p className="text-sm text-muted-foreground">
                  Current Balance: {formatBalance(selectedUser.balance)}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Wallet</Label>
            <Select
              value={adjustWallet}
              onValueChange={(v: AdminBalanceAdjustWallet) =>
                setAdjustWallet(v)
              }
            >
              <SelectTrigger data-testid="select-adjust-wallet">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="usd">Real Currency Balance</SelectItem>
                <SelectItem value="vxc">Project Currency (VXC)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {adjustWallet === "usd" && currencyWalletsData && (
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select
                value={adjustCurrency || currencyWalletsData.primaryCurrency}
                onValueChange={(v: string) => setAdjustCurrency(v)}
              >
                <SelectTrigger data-testid="select-adjust-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={currencyWalletsData.primaryCurrency}>
                    {currencyWalletsData.primaryCurrency} (Primary)
                  </SelectItem>
                  {currencyWalletsData.allowedCurrencies
                    .filter((c) => c !== currencyWalletsData.primaryCurrency)
                    .map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Amount {amountSuffix}</Label>
            <Input
              type="number"
              placeholder="Enter amount"
              value={actionAmount}
              onChange={(e) => setActionAmount(e.target.value)}
              data-testid="input-action-amount"
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={adjustType}
              onValueChange={(v: AdminBalanceAdjustType) => setAdjustType(v)}
            >
              <SelectTrigger data-testid="select-adjust-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="add">Credit (Add)</SelectItem>
                <SelectItem value="subtract">Debit (Subtract)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Reason / Notes</Label>
            <Textarea
              placeholder="Enter reason for this action..."
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              data-testid="input-action-reason"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            className="min-h-[44px]"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="min-h-[44px]"
            onClick={handleConfirm}
            disabled={!actionReason || !actionAmount || isSubmitting}
            data-testid="button-confirm-action"
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
