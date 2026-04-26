import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WORLD_CURRENCIES } from "@/lib/currencies";

export interface PerCurrencyWalletEntry {
  currency: string;
  balance: string;
  isPrimary: boolean;
  isAllowed: boolean;
}

export interface PerCurrencyWalletsTableProps {
  wallets: PerCurrencyWalletEntry[];
  onAdjust: (currency: string) => void;
}

export function PerCurrencyWalletsTable({
  wallets,
  onAdjust,
}: PerCurrencyWalletsTableProps) {
  if (!wallets.length) return null;

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Per-currency balances</div>
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Currency</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right w-44">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {wallets.map((w) => {
              const meta = WORLD_CURRENCIES.find((c) => c.code === w.currency);
              const symbol = meta?.symbol || w.currency;
              return (
                <TableRow
                  key={w.currency}
                  data-testid={`row-wallet-${w.currency}`}
                >
                  <TableCell className="font-mono">{w.currency}</TableCell>
                  <TableCell>
                    <Badge variant={w.isPrimary ? "default" : "outline"}>
                      {w.isPrimary
                        ? "Primary"
                        : w.isAllowed
                          ? "Allowed"
                          : "Legacy"}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className="text-right font-semibold"
                    data-testid={`text-balance-${w.currency}`}
                  >
                    {symbol} {Number.parseFloat(w.balance).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onAdjust(w.currency)}
                      data-testid={`button-adjust-${w.currency}`}
                    >
                      Adjust
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
