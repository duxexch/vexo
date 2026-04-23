import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { Lock, Wallet } from "lucide-react";

export interface ChatUnlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  balance: number;
  onConfirm: () => void;
  isPending?: boolean;
  recipientName?: string;
}

/**
 * Confirms a one-time stranger-DM unlock fee before the first message is
 * delivered. Shown in response to a 402 from POST /api/chat/:userId/messages.
 */
export function ChatUnlockDialog({
  open,
  onOpenChange,
  amount,
  balance,
  onConfirm,
  isPending,
  recipientName,
}: ChatUnlockDialogProps) {
  const { t } = useI18n();
  const insufficient = balance < amount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-chat-unlock">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            {t("chat.unlock.title") || "Unlock conversation"}
          </DialogTitle>
          <DialogDescription>
            {t("chat.unlock.description") ||
              `You're about to start a new conversation${recipientName ? ` with ${recipientName}` : ""}. A one-time unlock fee applies. Conversations with friends are always free.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
          <div>
            <div className="text-muted-foreground">{t("chat.unlock.fee") || "Unlock fee"}</div>
            <div className="text-lg font-bold text-primary">{amount.toFixed(2)} VXC</div>
          </div>
          <div>
            <div className="text-muted-foreground">{t("common.balance") || "Balance"}</div>
            <div className={`text-lg font-bold ${insufficient ? "text-destructive" : ""}`}>
              <Wallet className="me-1 inline h-4 w-4" />
              {balance.toFixed(2)} VXC
            </div>
          </div>
        </div>

        {insufficient && (
          <p className="text-sm text-destructive" data-testid="text-chat-unlock-insufficient">
            {t("chat.unlock.insufficient") || "Insufficient balance. Please top up your wallet."}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            data-testid="button-chat-unlock-cancel"
          >
            {t("common.cancel") || "Cancel"}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={insufficient || isPending}
            data-testid="button-chat-unlock-confirm"
          >
            {isPending
              ? (t("common.processing") || "Processing…")
              : (t("chat.unlock.confirm") || `Pay ${amount.toFixed(2)} VXC`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
