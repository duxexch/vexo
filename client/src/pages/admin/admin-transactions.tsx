import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useI18n } from "@/lib/i18n";
import { useMarkAlertReadByEntity, useUnreadAlertEntities } from "@/hooks/use-admin-alert-counts";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Clock3,
  Loader2,
  Wallet,
  XCircle,
} from "lucide-react";

type TransactionFilter = "all" | "deposit" | "withdrawal";
type ProcessStatus = "completed" | "rejected";

interface PendingTransaction {
  id: string;
  userId: string;
  type: "deposit" | "withdrawal" | string;
  status: string;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  description: string | null;
  referenceId: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    username: string;
    nickname: string | null;
    accountId: string | null;
    balance: string;
  };
}

interface ProcessPayload {
  id: string;
  status: ProcessStatus;
  approvedAmount?: number;
  adminNote?: string;
  entityId: string;
}

function getAdminToken() {
  return localStorage.getItem("adminToken");
}

async function adminFetch(url: string, options?: RequestInit) {
  const token = getAdminToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token || "",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return res.json();
}

function formatUsd(value: string | number): string {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) {
    return "$0.00";
  }
  return `$${parsed.toFixed(2)}`;
}

export default function AdminTransactionsPage() {
  const { language } = useI18n();
  const { toast } = useToast();
  const isArabic = language === "ar";

  const [filterType, setFilterType] = useState<TransactionFilter>("all");
  const [amountOverrides, setAmountOverrides] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data: unreadData } = useUnreadAlertEntities("/admin/transactions");
  const unreadEntityIds = new Set(unreadData?.entityIds || []);
  const markAlertRead = useMarkAlertReadByEntity();

  const { data: pendingTransactions = [], isLoading } = useQuery<PendingTransaction[]>({
    queryKey: ["/api/admin/transactions/pending", filterType],
    queryFn: () => {
      const url = filterType === "all"
        ? "/api/admin/transactions/pending"
        : `/api/admin/transactions/pending?type=${filterType}`;
      return adminFetch(url);
    },
  });

  const processMutation = useMutation({
    mutationFn: ({ entityId: _entityId, ...payload }: ProcessPayload) => {
      return adminFetch(`/api/admin/transactions/${payload.id}/process`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (_response, variables) => {
      toast({
        title: isArabic ? "تم تحديث الطلب" : "Request updated",
        description: variables.status === "completed"
          ? (isArabic ? "تمت الموافقة على المعاملة" : "Transaction approved")
          : (isArabic ? "تم رفض المعاملة" : "Transaction rejected"),
      });

      queryClient.invalidateQueries({ queryKey: ["/api/admin/transactions/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts/unread-by-section"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts/unread-entities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts/count"] });

      if (unreadEntityIds.has(variables.entityId)) {
        markAlertRead.mutate({ entityType: "transaction", entityId: variables.entityId });
      }

      setAmountOverrides((prev) => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
      setNotes((prev) => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
    },
    onError: (error: Error) => {
      toast({
        title: isArabic ? "فشل التحديث" : "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const stats = useMemo(() => {
    const total = pendingTransactions.length;
    const deposits = pendingTransactions.filter((tx) => tx.type === "deposit").length;
    const withdrawals = pendingTransactions.filter((tx) => tx.type === "withdrawal").length;
    return { total, deposits, withdrawals };
  }, [pendingTransactions]);

  const activeTransactionId = processMutation.variables?.id;

  const getAmountValue = (transaction: PendingTransaction): string => {
    return amountOverrides[transaction.id] ?? transaction.amount;
  };

  const isValidApprovedAmount = (transaction: PendingTransaction): boolean => {
    const parsed = Number.parseFloat(getAmountValue(transaction));
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 1_000_000;
  };

  const handleProcess = (transaction: PendingTransaction, status: ProcessStatus) => {
    const adminNote = (notes[transaction.id] || "").trim() || undefined;

    if (status === "completed") {
      const approvedAmount = Number.parseFloat(getAmountValue(transaction));
      if (!Number.isFinite(approvedAmount) || approvedAmount <= 0 || approvedAmount > 1_000_000) {
        toast({
          title: isArabic ? "مبلغ غير صالح" : "Invalid amount",
          description: isArabic
            ? "يجب أن يكون المبلغ بين 0.01 و 1,000,000"
            : "Amount must be between 0.01 and 1,000,000",
          variant: "destructive",
        });
        return;
      }

      processMutation.mutate({
        id: transaction.id,
        status,
        approvedAmount,
        adminNote,
        entityId: transaction.id,
      });
      return;
    }

    processMutation.mutate({
      id: transaction.id,
      status,
      adminNote,
      entityId: transaction.id,
    });
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-52 bg-muted rounded" />
          <div className="h-24 bg-muted rounded" />
          <div className="h-40 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="admin-transactions-title">
          <Wallet className="h-6 w-6 text-primary" />
          {isArabic ? "طلبات الإيداع والسحب" : "Deposit & Withdrawal Requests"}
        </h1>
        <p className="text-muted-foreground">
          {isArabic
            ? "قسم إداري مخصص لمعالجة طلبات الإيداع والسحب مع تعديل المبلغ قبل الموافقة"
            : "Dedicated admin queue to approve, reject, and adjust transaction amounts before approval"}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{isArabic ? "الإجمالي" : "Total Pending"}</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
            <Clock3 className="h-7 w-7 text-amber-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{isArabic ? "الإيداعات" : "Deposits"}</p>
              <p className="text-2xl font-bold">{stats.deposits}</p>
            </div>
            <ArrowDownToLine className="h-7 w-7 text-emerald-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{isArabic ? "السحوبات" : "Withdrawals"}</p>
              <p className="text-2xl font-bold">{stats.withdrawals}</p>
            </div>
            <ArrowUpFromLine className="h-7 w-7 text-orange-500" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <CardTitle>{isArabic ? "قائمة الطلبات" : "Request Queue"}</CardTitle>
          <Tabs value={filterType} onValueChange={(value) => setFilterType(value as TransactionFilter)}>
            <TabsList>
              <TabsTrigger value="all">{isArabic ? "الكل" : "All"}</TabsTrigger>
              <TabsTrigger value="deposit">{isArabic ? "إيداع" : "Deposits"}</TabsTrigger>
              <TabsTrigger value="withdrawal">{isArabic ? "سحب" : "Withdrawals"}</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {pendingTransactions.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground" data-testid="admin-transactions-empty">
              <Clock3 className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>{isArabic ? "لا توجد طلبات معلقة" : "No pending requests"}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingTransactions.map((transaction) => {
                const isBusy = processMutation.isPending && activeTransactionId === transaction.id;
                const hasUnreadAlert = unreadEntityIds.has(transaction.id);
                return (
                  <div
                    key={transaction.id}
                    className={`rounded-lg border p-4 space-y-4 ${hasUnreadAlert ? "border-primary/50 bg-primary/5" : ""}`}
                    data-testid={`admin-transaction-${transaction.id}`}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-1">
                        <p className="font-semibold">
                          {transaction.user.nickname || transaction.user.username}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          @{transaction.user.username}
                          {transaction.user.accountId ? ` | ${transaction.user.accountId}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(transaction.createdAt).toLocaleString()}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={transaction.type === "deposit" ? "default" : "secondary"}>
                          {transaction.type === "deposit"
                            ? (isArabic ? "إيداع" : "Deposit")
                            : (isArabic ? "سحب" : "Withdrawal")}
                        </Badge>
                        <Badge variant="outline">
                          {isArabic ? "المبلغ المطلوب" : "Requested"}: {formatUsd(transaction.amount)}
                        </Badge>
                        <Badge variant="outline">
                          {isArabic ? "الرصيد الحالي" : "Current Balance"}: {formatUsd(transaction.user.balance)}
                        </Badge>
                      </div>
                    </div>

                    {transaction.referenceId && (
                      <p className="text-xs text-muted-foreground">
                        {isArabic ? "المرجع" : "Reference"}: {transaction.referenceId}
                      </p>
                    )}
                    {transaction.description && (
                      <p className="text-xs text-muted-foreground break-words">
                        {transaction.description}
                      </p>
                    )}

                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          {isArabic ? "المبلغ المعتمد (USD)" : "Approved Amount (USD)"}
                        </p>
                        <Input
                          type="number"
                          min="0.01"
                          max="1000000"
                          step="0.01"
                          value={getAmountValue(transaction)}
                          onChange={(e) => {
                            const nextValue = e.target.value;
                            setAmountOverrides((prev) => ({ ...prev, [transaction.id]: nextValue }));
                          }}
                          data-testid={`approved-amount-${transaction.id}`}
                        />
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          {isArabic ? "ملاحظة (اختياري)" : "Note (optional)"}
                        </p>
                        <Textarea
                          rows={2}
                          value={notes[transaction.id] || ""}
                          onChange={(e) => setNotes((prev) => ({ ...prev, [transaction.id]: e.target.value }))}
                          placeholder={isArabic ? "سبب الرفض أو ملاحظة للعميل" : "Reason or internal note"}
                          data-testid={`admin-note-${transaction.id}`}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 justify-end">
                      <Button
                        variant="destructive"
                        onClick={() => handleProcess(transaction, "rejected")}
                        disabled={isBusy}
                        data-testid={`reject-transaction-${transaction.id}`}
                      >
                        {isBusy ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : <XCircle className="h-4 w-4 me-1" />}
                        {isArabic ? "رفض" : "Reject"}
                      </Button>
                      <Button
                        onClick={() => handleProcess(transaction, "completed")}
                        disabled={isBusy || !isValidApprovedAmount(transaction)}
                        data-testid={`approve-transaction-${transaction.id}`}
                      >
                        {isBusy ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : <CheckCircle2 className="h-4 w-4 me-1" />}
                        {isArabic ? "موافقة" : "Approve"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
