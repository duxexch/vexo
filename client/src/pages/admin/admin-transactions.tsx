import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useI18n } from "@/lib/i18n";
import { useMarkAlertReadByEntity, useUnreadAlertEntities } from "@/hooks/use-admin-alert-counts";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Clock3,
  Copy,
  Loader2,
  Repeat,
  RotateCcw,
  Search,
  Wallet,
  XCircle,
} from "lucide-react";

type TransactionTypeFilter = "all" | "deposit" | "withdrawal" | "conversion";
type TransactionStatusFilter = "all" | "pending" | "completed" | "rejected";
type ProcessStatus = "completed" | "rejected";

interface AdminTransaction {
  id: string;
  publicReference: string;
  userId: string;
  type: "deposit" | "withdrawal" | string;
  status: string;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  description: string | null;
  referenceId: string | null;
  adminNote: string | null;
  processedBy: string | null;
  processedAt: string | null;
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

interface TransactionsArchiveResponse {
  data: AdminTransaction[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    pending: number;
    completed: number;
    rejected: number;
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

  const [filterType, setFilterType] = useState<TransactionTypeFilter>("all");
  const [filterStatus, setFilterStatus] = useState<TransactionStatusFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [amountOverrides, setAmountOverrides] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const { data: unreadData } = useUnreadAlertEntities("/admin/transactions");
  const unreadEntityIds = new Set(unreadData?.entityIds || []);
  const markAlertRead = useMarkAlertReadByEntity();

  const { data: archiveResponse, isLoading, isFetching } = useQuery<TransactionsArchiveResponse>({
    queryKey: ["/api/admin/transactions", filterType, filterStatus, searchQuery],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterType !== "all") {
        params.set("type", filterType);
      }
      if (filterStatus !== "all") {
        params.set("status", filterStatus);
      }
      if (searchQuery) {
        params.set("q", searchQuery);
      }
      params.set("pageSize", "150");

      const queryString = params.toString();
      return adminFetch(queryString ? `/api/admin/transactions?${queryString}` : "/api/admin/transactions");
    },
  });

  const transactionRows = archiveResponse?.data || [];
  const summary = archiveResponse?.summary || { pending: 0, completed: 0, rejected: 0 };

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

      queryClient.invalidateQueries({ queryKey: ["/api/admin/transactions"] });
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

  const [reverseTarget, setReverseTarget] = useState<AdminTransaction | null>(null);
  const [reverseReason, setReverseReason] = useState("");

  const reverseMutation = useMutation({
    mutationFn: async ({ transactionId, reason }: { transactionId: string; reason: string }) => {
      return adminFetch(
        `/api/admin/wallet-conversion/transactions/${transactionId}/reverse`,
        {
          method: "POST",
          body: JSON.stringify({ reason }),
        },
      );
    },
    onSuccess: () => {
      toast({
        title: isArabic ? "تم عكس التحويل" : "Conversion reversed",
        description: isArabic
          ? "تم عكس طرفي التحويل بنجاح"
          : "Both legs of the conversion have been reversed",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/transactions"] });
      setReverseTarget(null);
      setReverseReason("");
    },
    onError: (error: Error) => {
      toast({
        title: isArabic ? "تعذر عكس التحويل" : "Could not reverse conversion",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const statsByType = useMemo(() => {
    const deposits = transactionRows.filter((tx) => tx.type === "deposit").length;
    const withdrawals = transactionRows.filter((tx) => tx.type === "withdrawal").length;
    const conversions = transactionRows.filter(
      (tx) => tx.type === "currency_conversion",
    ).length;
    return { deposits, withdrawals, conversions };
  }, [transactionRows]);

  const activeTransactionId = processMutation.variables?.id;

  const getAmountValue = (transaction: AdminTransaction): string => {
    return amountOverrides[transaction.id] ?? transaction.amount;
  };

  const isValidApprovedAmount = (transaction: AdminTransaction): boolean => {
    const parsed = Number.parseFloat(getAmountValue(transaction));
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 1_000_000;
  };

  const getDisplayReference = (transaction: AdminTransaction): string => {
    return transaction.publicReference || transaction.referenceId || transaction.id;
  };

  const copyReference = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({
        title: isArabic ? "تم النسخ" : "Copied",
        description: isArabic ? "تم نسخ الرقم المرجعي" : "Reference copied",
      });
    } catch {
      toast({
        title: isArabic ? "فشل النسخ" : "Copy failed",
        description: isArabic ? "تعذر نسخ الرقم المرجعي" : "Unable to copy reference",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === "pending") {
      return <Badge variant="secondary">{isArabic ? "معلق" : "Pending"}</Badge>;
    }
    if (status === "approved" || status === "completed") {
      return <Badge className="bg-green-600 hover:bg-green-600">{isArabic ? "مقبول" : "Approved"}</Badge>;
    }
    if (status === "rejected") {
      return <Badge variant="destructive">{isArabic ? "مرفوض" : "Rejected"}</Badge>;
    }
    return <Badge variant="outline">{status}</Badge>;
  };

  const handleProcess = (transaction: AdminTransaction, status: ProcessStatus) => {
    if (transaction.status !== "pending") {
      return;
    }

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
      <div className="min-h-[100svh] p-3 sm:p-4 md:p-6 space-y-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-52 bg-muted rounded" />
          <div className="h-24 bg-muted rounded" />
          <div className="h-40 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100svh] p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
              <p className="text-sm text-muted-foreground">{isArabic ? "المعلقة" : "Pending"}</p>
              <p className="text-2xl font-bold">{summary.pending}</p>
            </div>
            <Clock3 className="h-7 w-7 text-amber-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{isArabic ? "المقبولة" : "Approved"}</p>
              <p className="text-2xl font-bold">{summary.completed}</p>
            </div>
            <CheckCircle2 className="h-7 w-7 text-emerald-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{isArabic ? "المرفوضة" : "Rejected"}</p>
              <p className="text-2xl font-bold">{summary.rejected}</p>
            </div>
            <XCircle className="h-7 w-7 text-red-500" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>{isArabic ? "أرشيف العمليات" : "Operations Archive"}</CardTitle>
            <div className="relative w-full md:w-96">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                className="min-h-[44px] ps-9"
                placeholder={isArabic ? "بحث ذكي: مرجع، مستخدم، مبلغ، حالة..." : "Smart search: reference, user, amount, status..."}
                data-testid="admin-transactions-smart-search"
              />
            </div>
          </div>

          <Tabs value={filterStatus} onValueChange={(value) => setFilterStatus(value as TransactionStatusFilter)}>
            <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <TabsTrigger value="all">{isArabic ? "الكل" : "All"}</TabsTrigger>
              <TabsTrigger value="pending">{isArabic ? "معلقة" : "Pending"}</TabsTrigger>
              <TabsTrigger value="completed">{isArabic ? "مقبولة" : "Approved"}</TabsTrigger>
              <TabsTrigger value="rejected">{isArabic ? "مرفوضة" : "Rejected"}</TabsTrigger>
            </TabsList>
          </Tabs>

          <Tabs value={filterType} onValueChange={(value) => setFilterType(value as TransactionTypeFilter)}>
            <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <TabsTrigger value="all">{isArabic ? "الكل" : "All"}</TabsTrigger>
              <TabsTrigger value="deposit">{isArabic ? "إيداع" : "Deposits"}</TabsTrigger>
              <TabsTrigger value="withdrawal">{isArabic ? "سحب" : "Withdrawals"}</TabsTrigger>
              <TabsTrigger value="conversion" data-testid="filter-type-conversion">
                {isArabic ? "تحويلات المحفظة" : "Conversions"}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {isArabic ? "المعروض" : "Showing"}: {transactionRows.length}
              {archiveResponse?.total !== undefined ? ` / ${archiveResponse.total}` : ""}
            </span>
            <span>
              {isArabic ? "إيداع" : "Deposits"}: {statsByType.deposits} | {isArabic ? "سحب" : "Withdrawals"}: {statsByType.withdrawals} | {isArabic ? "تحويلات" : "Conversions"}: {statsByType.conversions}
              {isFetching ? (
                <Loader2 className="inline ms-2 h-3 w-3 animate-spin" />
              ) : null}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {transactionRows.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground" data-testid="admin-transactions-empty">
              <Clock3 className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>{isArabic ? "لا توجد عمليات مطابقة" : "No matching operations"}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {transactionRows.map((transaction) => {
                const isBusy = processMutation.isPending && activeTransactionId === transaction.id;
                const isPendingTransaction = transaction.status === "pending";
                const hasUnreadAlert = unreadEntityIds.has(transaction.id);
                const displayReference = getDisplayReference(transaction);
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
                        <Badge
                          variant={
                            transaction.type === "deposit"
                              ? "default"
                              : transaction.type === "currency_conversion"
                                ? "outline"
                                : "secondary"
                          }
                          className="gap-1"
                        >
                          {transaction.type === "deposit" ? (
                            <ArrowDownToLine className="h-3.5 w-3.5" />
                          ) : transaction.type === "currency_conversion" ? (
                            <Repeat className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowUpFromLine className="h-3.5 w-3.5" />
                          )}
                          {transaction.type === "deposit"
                            ? (isArabic ? "إيداع" : "Deposit")
                            : transaction.type === "currency_conversion"
                              ? (isArabic ? "تحويل عملة" : "Conversion")
                              : (isArabic ? "سحب" : "Withdrawal")}
                        </Badge>
                        {getStatusBadge(transaction.status)}
                        <Badge variant="outline">
                          {isArabic ? "المبلغ المطلوب" : "Requested"}: {formatUsd(transaction.amount)}
                        </Badge>
                        <Badge variant="outline">
                          {isArabic ? "الرصيد الحالي" : "Current Balance"}: {formatUsd(transaction.user.balance)}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{isArabic ? "المرجع الفريد" : "Unique Reference"}: {displayReference}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => copyReference(displayReference)}
                        data-testid={`copy-reference-${transaction.id}`}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      {transaction.referenceId && transaction.referenceId !== displayReference ? (
                        <span>{isArabic ? "مرجع الدفع" : "Payment Ref"}: {transaction.referenceId}</span>
                      ) : null}
                    </div>

                    {transaction.description && (
                      <p className="text-xs text-muted-foreground break-words">
                        {transaction.description}
                      </p>
                    )}

                    {transaction.type === "currency_conversion" ? (
                      (() => {
                        const isReversalRow = (transaction.description || "")
                          .trim()
                          .toLowerCase()
                          .startsWith("reversal:");
                        const isReversingThis =
                          reverseMutation.isPending &&
                          reverseMutation.variables?.transactionId === transaction.id;
                        return (
                          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                            {isReversalRow ? (
                              <Badge variant="secondary" data-testid={`conversion-reversal-${transaction.id}`}>
                                {isArabic ? "صف عكسي" : "Reversal entry"}
                              </Badge>
                            ) : (
                              <Button
                                variant="destructive"
                                className="min-h-[44px] w-full sm:w-auto"
                                onClick={() => {
                                  setReverseTarget(transaction);
                                  setReverseReason("");
                                }}
                                disabled={reverseMutation.isPending}
                                data-testid={`reverse-conversion-${transaction.id}`}
                              >
                                {isReversingThis ? (
                                  <Loader2 className="h-4 w-4 animate-spin me-1" />
                                ) : (
                                  <RotateCcw className="h-4 w-4 me-1" />
                                )}
                                {isArabic ? "عكس التحويل" : "Reverse"}
                              </Button>
                            )}
                          </div>
                        );
                      })()
                    ) : isPendingTransaction ? (
                      <>
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
                              className="min-h-[44px]"
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
                              className="min-h-[92px]"
                              value={notes[transaction.id] || ""}
                              onChange={(e) => setNotes((prev) => ({ ...prev, [transaction.id]: e.target.value }))}
                              placeholder={isArabic ? "سبب الرفض أو ملاحظة للعميل" : "Reason or internal note"}
                              data-testid={`admin-note-${transaction.id}`}
                            />
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                          <Button
                            variant="destructive"
                            className="min-h-[44px] w-full sm:w-auto"
                            onClick={() => handleProcess(transaction, "rejected")}
                            disabled={isBusy}
                            data-testid={`reject-transaction-${transaction.id}`}
                          >
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : <XCircle className="h-4 w-4 me-1" />}
                            {isArabic ? "رفض" : "Reject"}
                          </Button>
                          <Button
                            className="min-h-[44px] w-full sm:w-auto"
                            onClick={() => handleProcess(transaction, "completed")}
                            disabled={isBusy || !isValidApprovedAmount(transaction)}
                            data-testid={`approve-transaction-${transaction.id}`}
                          >
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : <CheckCircle2 className="h-4 w-4 me-1" />}
                            {isArabic ? "موافقة" : "Approve"}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                        <p>
                          {isArabic ? "الحالة النهائية" : "Final Status"}: {transaction.status}
                        </p>
                        <p>
                          {isArabic ? "تمت المعالجة" : "Processed"}: {transaction.processedAt ? new Date(transaction.processedAt).toLocaleString() : (isArabic ? "غير متاح" : "N/A")}
                        </p>
                        {transaction.adminNote ? (
                          <p>{isArabic ? "ملاحظة الأدمن" : "Admin Note"}: {transaction.adminNote}</p>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={reverseTarget !== null}
        onOpenChange={(open) => {
          if (!open && !reverseMutation.isPending) {
            setReverseTarget(null);
            setReverseReason("");
          }
        }}
      >
        <DialogContent data-testid="reverse-conversion-dialog">
          <DialogHeader>
            <DialogTitle>
              {isArabic ? "عكس تحويل المحفظة" : "Reverse Wallet Conversion"}
            </DialogTitle>
            <DialogDescription>
              {isArabic
                ? "سيتم إعادة الأموال إلى عملة المصدر وخصمها من عملة الوجهة. إذا لم يكن لدى المستخدم رصيد كافٍ في الوجهة، سيتم رفض العملية."
                : "Funds will be returned to the source currency and debited from the destination. The reversal is rejected if the user no longer has sufficient destination balance."}
            </DialogDescription>
          </DialogHeader>

          {reverseTarget ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">
                  {isArabic ? "المرجع" : "Reference"}:
                </span>{" "}
                {getDisplayReference(reverseTarget)}
              </p>
              {reverseTarget.description ? (
                <p className="break-words">{reverseTarget.description}</p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="reverse-reason">
              {isArabic ? "السبب (إلزامي)" : "Reason (required)"}
            </label>
            <Textarea
              id="reverse-reason"
              rows={3}
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              placeholder={
                isArabic
                  ? "اشرح سبب عكس هذا التحويل..."
                  : "Explain why this conversion is being reversed..."
              }
              data-testid="reverse-conversion-reason"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (!reverseMutation.isPending) {
                  setReverseTarget(null);
                  setReverseReason("");
                }
              }}
              disabled={reverseMutation.isPending}
              data-testid="reverse-conversion-cancel"
            >
              {isArabic ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!reverseTarget) return;
                const trimmed = reverseReason.trim();
                if (!trimmed) {
                  toast({
                    title: isArabic ? "مطلوب سبب" : "Reason required",
                    description: isArabic
                      ? "الرجاء إدخال سبب لعكس التحويل"
                      : "Please provide a reason for the reversal",
                    variant: "destructive",
                  });
                  return;
                }
                reverseMutation.mutate({
                  transactionId: reverseTarget.id,
                  reason: trimmed,
                });
              }}
              disabled={reverseMutation.isPending || reverseReason.trim().length === 0}
              data-testid="reverse-conversion-confirm"
            >
              {reverseMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin me-1" />
              ) : (
                <RotateCcw className="h-4 w-4 me-1" />
              )}
              {isArabic ? "تأكيد العكس" : "Confirm Reversal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
