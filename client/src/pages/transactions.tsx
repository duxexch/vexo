import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth, useAuthHeaders } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { Transaction, CountryPaymentMethod } from "@shared/schema";
import { ArrowDownCircle, ArrowUpCircle, Clock, CheckCircle, XCircle, Loader2, Wallet, Copy, AlertCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function TransactionsPage() {
  const { user, updateUser } = useAuth();
  const headers = useAuthHeaders();
  const { toast } = useToast();
  const { t, dir } = useI18n();
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [walletNumber, setWalletNumber] = useState("");
  const [depositStep, setDepositStep] = useState<'method' | 'details' | 'confirm'>('method');

  const { data: transactions, isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
    queryFn: async () => {
      const res = await fetch("/api/transactions?pageSize=100", { headers });
      if (!res.ok) throw new Error("Failed to fetch transactions");
      const json = await res.json();
      return json.data ?? json;
    },
  });

  const { data: paymentMethods } = useQuery<CountryPaymentMethod[]>({
    queryKey: ["/api/payment-methods"],
    queryFn: async () => {
      const res = await fetch("/api/payment-methods", { headers });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: pendingTx } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions/pending"],
    queryFn: async () => {
      const res = await fetch("/api/transactions/pending", { headers });
      if (!res.ok) throw new Error("Failed to fetch pending");
      return res.json();
    },
    enabled: user?.role === "admin" || user?.role === "agent",
  });

  const depositMutation = useMutation({
    mutationFn: async (data: { amount: string; paymentMethod: string; paymentReference: string; walletNumber?: string }) => {
      return apiRequest("POST", "/api/transactions/deposit", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      setDepositOpen(false);
      resetDepositForm();
      toast({ title: t('transactions.success'), description: t('transactions.depositSuccess') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async (data: { amount: string }) => {
      return apiRequest("POST", "/api/transactions/withdraw", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      setWithdrawOpen(false);
      setAmount("");
      toast({ title: t('transactions.success'), description: t('transactions.withdrawSuccess') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    },
  });

  const processMutation = useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: string; note?: string }) => {
      return apiRequest("PATCH", `/api/transactions/${id}/process`, { status, note });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({ title: t('transactions.success'), description: t('transactions.processed') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    },
  });

  const resetDepositForm = () => {
    setAmount("");
    setPaymentMethod("");
    setPaymentReference("");
    setWalletNumber("");
    setDepositStep('method');
  };

  const selectedMethod = paymentMethods?.find(m => m.id === paymentMethod);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary"><Clock className="w-3 h-3 me-1" /> {t('transactions.pending')}</Badge>;
      case "completed":
      case "approved":
        return <Badge className="bg-primary"><CheckCircle className="w-3 h-3 me-1" /> {t('transactions.completed')}</Badge>;
      case "rejected":
      case "cancelled":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 me-1" /> {t('common.rejected')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "deposit":
        return <ArrowDownCircle className="w-5 h-5 text-primary" />;
      case "withdrawal":
        return <ArrowUpCircle className="w-5 h-5 text-destructive" />;
      case "stake":
        return <Wallet className="w-5 h-5 text-muted-foreground" />;
      case "win":
        return <CheckCircle className="w-5 h-5 text-primary" />;
      default:
        return <Wallet className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: t('transactions.copied'), description: t('transactions.copiedToClipboard') });
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const isAgentOrAdmin = user?.role === "admin" || user?.role === "agent";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">{t('transactions.title')}</h1>
        <div className="flex gap-2 flex-wrap">
          <Dialog open={depositOpen} onOpenChange={(open) => {
            setDepositOpen(open);
            if (!open) resetDepositForm();
          }}>
            <DialogTrigger asChild>
              <Button data-testid="button-deposit">
                <ArrowDownCircle className="me-2 h-4 w-4" /> {t('transactions.deposit')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{t('transactions.depositFunds')}</DialogTitle>
                <DialogDescription>
                  {t('transactions.selectPaymentMethod')}
                </DialogDescription>
              </DialogHeader>
              
              {depositStep === 'method' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t('transactions.selectMethod')}</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger data-testid="select-payment-method">
                        <SelectValue placeholder={t('transactions.chooseMethod')} />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentMethods?.map((method) => (
                          <SelectItem key={method.id} value={method.id}>
                            <div className="flex items-center gap-2">
                              <span>{method.name}</span>
                              <Badge variant="outline" className="text-xs">{method.type}</Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedMethod && (
                    <Card className="bg-muted/50">
                      <CardContent className="p-4 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{t('transactions.minAmount')}</span>
                          <span className="font-medium">${selectedMethod.minAmount}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{t('transactions.maxAmount')}</span>
                          <span className="font-medium">${selectedMethod.maxAmount}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{t('transactions.processingTime')}</span>
                          <span className="font-medium">{selectedMethod.processingTime || 'Varies'}</span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <div className="space-y-2">
                    <Label>{t('transactions.amount')} ($)</Label>
                    <Input
                      type="number"
                      data-testid="input-deposit-amount"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder={selectedMethod ? `${selectedMethod.minAmount} - ${selectedMethod.maxAmount}` : t('transactions.enterAmount')}
                      min={selectedMethod?.minAmount || "10"}
                      max={selectedMethod?.maxAmount || "10000"}
                      step="0.01"
                    />
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => setDepositStep('details')}
                    disabled={!paymentMethod || !amount || (selectedMethod && (parseFloat(amount) < parseFloat(selectedMethod.minAmount) || parseFloat(amount) > parseFloat(selectedMethod.maxAmount)))}
                    data-testid="button-next-step"
                  >
                    {t('transactions.continue')}
                  </Button>
                </div>
              )}

              {depositStep === 'details' && selectedMethod && (
                <div className="space-y-4">
                  <Card className="bg-primary/10 border-primary/20">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-primary mt-0.5" />
                        <div className="space-y-2 text-sm">
                          <p className="font-medium">{t('transactions.paymentInstructions')}</p>
                          <p className="text-muted-foreground">
                            {selectedMethod.instructions || `Send ${amount} USD via ${selectedMethod.name} to the agent wallet provided below.`}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="space-y-2">
                    <Label>{t('transactions.paymentReference')}</Label>
                    <Input
                      data-testid="input-payment-reference"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder={t('transactions.enterReference')}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('transactions.referenceNote')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>{t('transactions.walletNumber')}</Label>
                    <Input
                      data-testid="input-wallet-number"
                      value={walletNumber}
                      onChange={(e) => setWalletNumber(e.target.value)}
                      placeholder={t('transactions.senderWallet')}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setDepositStep('method')}
                      className="flex-1"
                    >
                      {t('transactions.back')}
                    </Button>
                    <Button
                      className="flex-1"
                      data-testid="button-submit-deposit"
                      onClick={() => depositMutation.mutate({ 
                        amount, 
                        paymentMethod: selectedMethod.name, 
                        paymentReference,
                        walletNumber: walletNumber || undefined
                      })}
                      disabled={depositMutation.isPending || !paymentReference}
                    >
                      {depositMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                      {t('transactions.submitRequest')}
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-withdraw">
                <ArrowUpCircle className="me-2 h-4 w-4" /> {t('transactions.withdraw')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('transactions.requestWithdrawal')}</DialogTitle>
                <DialogDescription>
                  {t('transactions.enterWithdrawAmount')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('transactions.amount')} ($)</Label>
                  <Input
                    type="number"
                    data-testid="input-withdraw-amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={t('transactions.enterAmount')}
                    min="20"
                    step="0.01"
                    max={user?.balance}
                  />
                  <p className="text-sm text-muted-foreground">
                    {t('transactions.availableBalance')}: <span className="text-primary font-medium">${parseFloat(user?.balance || "0").toFixed(2)}</span>
                  </p>
                </div>
                <Button
                  className="w-full"
                  data-testid="button-submit-withdraw"
                  onClick={() => withdrawMutation.mutate({ amount })}
                  disabled={withdrawMutation.isPending || !amount || parseFloat(amount) > parseFloat(user?.balance || "0")}
                >
                  {withdrawMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                  {t('transactions.submitRequest')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all" data-testid="tab-all-transactions">{t('transactions.myTransactions')}</TabsTrigger>
          {isAgentOrAdmin && <TabsTrigger value="pending" data-testid="tab-pending">{t('transactions.pending')} ({pendingTx?.length || 0})</TabsTrigger>}
        </TabsList>
        
        <TabsContent value="all" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {transactions?.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between gap-4 p-4"
                    data-testid={`row-transaction-${tx.id}`}
                  >
                    <div className="flex items-center gap-3">
                      {getTypeIcon(tx.type)}
                      <div>
                        <p className="font-medium capitalize">{tx.type}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(tx.createdAt).toLocaleString()}
                        </p>
                        {tx.referenceId && (
                          <p className="text-xs text-muted-foreground">
                            Ref: {tx.referenceId}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`font-bold ${tx.type === "deposit" || tx.type === "win" || tx.type === "bonus" ? "text-primary" : "text-destructive"}`}>
                        {tx.type === "deposit" || tx.type === "win" || tx.type === "bonus" ? "+" : "-"}${tx.amount}
                      </span>
                      {getStatusBadge(tx.status)}
                    </div>
                  </div>
                ))}
                
                {transactions?.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">
                    {t('transactions.noTransactions')}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {isAgentOrAdmin && (
          <TabsContent value="pending" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('transactions.pendingApprovals')}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {pendingTx?.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between gap-4 p-4"
                      data-testid={`row-pending-${tx.id}`}
                    >
                      <div className="flex items-center gap-3">
                        {getTypeIcon(tx.type)}
                        <div>
                          <p className="font-medium capitalize">{tx.type}</p>
                          <p className="text-sm text-muted-foreground">
                            User ID: {tx.userId.slice(0, 8)}...
                          </p>
                          {tx.referenceId && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              Ref: {tx.referenceId}
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-4 w-4"
                                onClick={() => copyToClipboard(tx.referenceId!)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold">${tx.amount}</span>
                        <Button
                          size="sm"
                          data-testid={`button-approve-${tx.id}`}
                          onClick={() => processMutation.mutate({ id: tx.id, status: "completed" })}
                          disabled={processMutation.isPending}
                        >
                          {processMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('transactions.approve')}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          data-testid={`button-reject-${tx.id}`}
                          onClick={() => processMutation.mutate({ id: tx.id, status: "rejected" })}
                          disabled={processMutation.isPending}
                        >
                          {t('transactions.reject')}
                        </Button>
                      </div>
                    </div>
                  ))}
                  
                  {pendingTx?.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground">
                      {t('transactions.noPending')}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
