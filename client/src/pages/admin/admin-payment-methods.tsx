import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CreditCard,
  Building2,
  Wallet,
  Bitcoin,
  Plus,
  Edit2,
  Trash2,
  CheckSquare,
  Play,
} from "lucide-react";
import type { CountryPaymentMethod } from "@shared/schema";

const paymentMethodSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["bank_transfer", "e_wallet", "crypto", "card"]),
  countryCode: z.string().min(2, "Country code is required"),
  minAmount: z.string().min(1, "Minimum amount is required"),
  maxAmount: z.string().min(1, "Maximum amount is required"),
  iconUrl: z.string().optional(),
  processingTime: z.string().optional(),
  instructions: z.string().optional(),
  sortOrder: z.number().int().min(0),
  isActive: z.boolean(),
  isWithdrawalEnabled: z.boolean(),
});

type PaymentMethodForm = z.infer<typeof paymentMethodSchema>;

const TYPE_ICONS = {
  bank_transfer: Building2,
  e_wallet: Wallet,
  crypto: Bitcoin,
  card: CreditCard,
};

const TYPE_LABELS = {
  bank_transfer: "Bank Transfer",
  e_wallet: "E-Wallet",
  crypto: "Cryptocurrency",
  card: "Credit/Debit Card",
};

type BulkAction = "activate" | "deactivate" | "enable_withdrawal" | "disable_withdrawal" | "delete";

const BULK_ACTION_OPTIONS: SearchableSelectOption[] = [
  { value: "activate", label: "Activate selected methods" },
  { value: "deactivate", label: "Deactivate selected methods" },
  { value: "enable_withdrawal", label: "Enable withdrawals for selected" },
  { value: "disable_withdrawal", label: "Disable withdrawals for selected" },
  { value: "delete", label: "Delete selected methods" },
];

export default function AdminPaymentMethodsPage() {
  const { t, language } = useI18n();
  const { toast } = useToast();
  const [editingMethod, setEditingMethod] = useState<CountryPaymentMethod | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [deleteMethodId, setDeleteMethodId] = useState<string | null>(null);
  const [selectedMethodIds, setSelectedMethodIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<BulkAction>("activate");
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const { data: paymentMethods, isLoading } = useQuery<CountryPaymentMethod[]>({
    queryKey: ["/api/admin/payment-methods"],
  });

  const countryCodeOptions = useMemo(() => {
    const defaults = ["ALL", "EG", "SA", "AE", "US", "GB", "EU", "QA", "KW", "OM", "BH"];
    const codes = new Set(defaults);

    for (const method of paymentMethods || []) {
      const normalizedCode = String(method.countryCode || "").trim().toUpperCase();
      if (normalizedCode) {
        codes.add(normalizedCode);
      }
    }

    return Array.from(codes).sort((left, right) => {
      if (left === "ALL") return -1;
      if (right === "ALL") return 1;
      return left.localeCompare(right);
    });
  }, [paymentMethods]);

  const countrySelectOptions = useMemo<SearchableSelectOption[]>(
    () => countryCodeOptions.map((countryCode) => ({ value: countryCode, label: countryCode })),
    [countryCodeOptions],
  );

  const typeSelectOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { value: "bank_transfer", label: "Bank Transfer" },
      { value: "e_wallet", label: "E-Wallet" },
      { value: "crypto", label: "Cryptocurrency" },
      { value: "card", label: "Credit/Debit Card" },
    ],
    [],
  );

  const form = useForm<PaymentMethodForm>({
    resolver: zodResolver(paymentMethodSchema),
    defaultValues: {
      name: "",
      type: "bank_transfer",
      countryCode: "ALL",
      minAmount: "10",
      maxAmount: "10000",
      iconUrl: "",
      processingTime: "",
      instructions: "",
      sortOrder: 0,
      isActive: true,
      isWithdrawalEnabled: false,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: PaymentMethodForm) =>
      apiRequest("POST", "/api/admin/payment-methods", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-methods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      toast({ title: "Success", description: "Payment method created" });
      setShowDialog(false);
      form.reset();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<PaymentMethodForm>) =>
      apiRequest("PATCH", `/api/admin/payment-methods/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-methods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      toast({ title: "Success", description: "Payment method updated" });
      setShowDialog(false);
      setEditingMethod(null);
      form.reset();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/admin/payment-methods/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-methods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      toast({ title: "Success", description: "Payment method deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<Pick<PaymentMethodForm, "isActive" | "isWithdrawalEnabled">>;
    }) => apiRequest("PATCH", `/api/admin/payment-methods/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-methods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const bulkActionMutation = useMutation({
    mutationFn: async (payload: { ids: string[]; action: BulkAction }) => {
      const response = await apiRequest("POST", "/api/admin/payment-methods/bulk-action", payload);
      return response.json() as Promise<{ success: boolean; action: BulkAction; affectedCount: number }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-methods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      setSelectedMethodIds([]);
      setShowBulkDeleteConfirm(false);

      toast({
        title: "Success",
        description: `Bulk action completed on ${result.affectedCount} method(s)`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!paymentMethods) {
      return;
    }

    const existingIds = new Set(paymentMethods.map((method) => method.id));
    setSelectedMethodIds((previous) => previous.filter((id) => existingIds.has(id)));
  }, [paymentMethods]);

  const handleToggleSelectMethod = (methodId: string, checked: boolean) => {
    setSelectedMethodIds((previous) => {
      if (checked) {
        if (previous.includes(methodId)) return previous;
        return [...previous, methodId];
      }
      return previous.filter((id) => id !== methodId);
    });
  };

  const handleToggleSelectAll = (checked: boolean) => {
    if (!paymentMethods?.length) {
      setSelectedMethodIds([]);
      return;
    }

    setSelectedMethodIds(checked ? paymentMethods.map((method) => method.id) : []);
  };

  const handleApplyBulkAction = () => {
    if (selectedMethodIds.length === 0) {
      toast({ title: "Error", description: "Select at least one method", variant: "destructive" });
      return;
    }

    if (bulkAction === "delete") {
      setShowBulkDeleteConfirm(true);
      return;
    }

    bulkActionMutation.mutate({ ids: selectedMethodIds, action: bulkAction });
  };

  const openEditDialog = (method: CountryPaymentMethod) => {
    setEditingMethod(method);
    form.reset({
      name: method.name,
      type: method.type as "bank_transfer" | "e_wallet" | "crypto" | "card",
      countryCode: method.countryCode,
      minAmount: method.minAmount,
      maxAmount: method.maxAmount,
      iconUrl: method.iconUrl || "",
      processingTime: method.processingTime || "",
      instructions: method.instructions || "",
      sortOrder: method.sortOrder,
      isActive: method.isActive,
      isWithdrawalEnabled: method.isWithdrawalEnabled,
    });
    setShowDialog(true);
  };

  const openCreateDialog = () => {
    setEditingMethod(null);
    form.reset({
      name: "",
      type: "bank_transfer",
      countryCode: "ALL",
      minAmount: "10",
      maxAmount: "10000",
      iconUrl: "",
      processingTime: "",
      instructions: "",
      sortOrder: (paymentMethods?.length || 0) + 1,
      isActive: true,
      isWithdrawalEnabled: false,
    });
    setShowDialog(true);
  };

  const onSubmit = (data: PaymentMethodForm) => {
    if (editingMethod) {
      updateMutation.mutate({ id: editingMethod.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const totalMethods = paymentMethods?.length || 0;
  const selectedCount = selectedMethodIds.length;
  const selectAllState: boolean | "indeterminate" = selectedCount === 0
    ? false
    : selectedCount === totalMethods
      ? true
      : "indeterminate";

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" dir={language === "ar" ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="h-7 w-7 text-primary" />
            Payment Methods
          </h1>
          <p className="text-muted-foreground">Manage payment methods for deposits and withdrawals</p>
        </div>
        <Button onClick={openCreateDialog} data-testid="button-add-payment-method">
          <Plus className="h-4 w-4 me-2" />
          Add Payment Method
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Payment Methods</CardTitle>
          <CardDescription>Configure method availability and which ones users can select in withdrawal requests</CardDescription>
        </CardHeader>
        <CardContent>
          {paymentMethods && paymentMethods.length > 0 ? (
            <>
              <div className="mb-4 flex flex-col gap-3 rounded-lg border p-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectAllState}
                    onCheckedChange={(checked) => handleToggleSelectAll(Boolean(checked))}
                    data-testid="checkbox-select-all-payment-methods"
                  />
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckSquare className="h-4 w-4" />
                    <span>{selectedCount} selected</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="w-full sm:w-72">
                    <SearchableSelect
                      value={bulkAction}
                      onValueChange={(value) => setBulkAction(value as BulkAction)}
                      options={BULK_ACTION_OPTIONS}
                      placeholder="Choose bulk action"
                      searchPlaceholder="Type to filter action"
                      emptyText="No actions found"
                      triggerTestId="select-bulk-action"
                      searchInputTestId="input-search-bulk-action"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleApplyBulkAction}
                    disabled={selectedCount === 0 || bulkActionMutation.isPending}
                    data-testid="button-apply-bulk-action"
                  >
                    <Play className="me-2 h-4 w-4" />
                    Apply to selected
                  </Button>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectAllState}
                        onCheckedChange={(checked) => handleToggleSelectAll(Boolean(checked))}
                        data-testid="checkbox-select-all-payment-methods-header"
                      />
                    </TableHead>
                    <TableHead>Icon</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Limits</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Withdrawals</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentMethods.map((method) => {
                    const TypeIcon = TYPE_ICONS[method.type as keyof typeof TYPE_ICONS] || CreditCard;
                    const isSelected = selectedMethodIds.includes(method.id);

                    return (
                      <TableRow key={method.id} data-testid={`row-payment-method-${method.id}`}>
                        <TableCell>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => handleToggleSelectMethod(method.id, Boolean(checked))}
                            data-testid={`checkbox-select-payment-method-${method.id}`}
                          />
                        </TableCell>
                        <TableCell>
                          {method.iconUrl ? (
                            <img src={method.iconUrl} alt={method.name} loading="lazy" className="h-8 w-8 rounded object-contain" />
                          ) : (
                            <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center">
                              <TypeIcon className="h-4 w-4 text-primary" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{method.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{TYPE_LABELS[method.type as keyof typeof TYPE_LABELS]}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          ${method.minAmount} - ${method.maxAmount}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{method.countryCode}</Badge>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={method.isWithdrawalEnabled}
                            onCheckedChange={(checked) => toggleMutation.mutate({ id: method.id, data: { isWithdrawalEnabled: checked } })}
                            data-testid={`switch-withdrawal-enabled-${method.id}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={method.isActive}
                            onCheckedChange={(checked) => toggleMutation.mutate({ id: method.id, data: { isActive: checked } })}
                            data-testid={`switch-toggle-${method.id}`}
                          />
                        </TableCell>
                        <TableCell>{method.sortOrder}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(method)}
                              data-testid={`button-edit-${method.id}`}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteMethodId(method.id)}
                              data-testid={`button-delete-${method.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No payment methods configured</p>
              <Button onClick={openCreateDialog} variant="outline" className="mt-4">
                <Plus className="h-4 w-4 me-2" />
                Add First Payment Method
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingMethod ? "Edit Payment Method" : "Add Payment Method"}</DialogTitle>
            <DialogDescription>
              Configure a payment method for deposit and withdrawal flows
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="countryCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <FormControl>
                      <SearchableSelect
                        value={String(field.value || "ALL").toUpperCase()}
                        onValueChange={(value) => field.onChange(value.toUpperCase())}
                        options={countrySelectOptions}
                        placeholder="Select country"
                        searchPlaceholder="Type country code"
                        emptyText="No country found"
                        triggerTestId="select-country-code"
                        searchInputTestId="input-search-country-code"
                      />
                    </FormControl>
                    <FormDescription>Use ALL for global availability</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Vodafone Cash" {...field} data-testid="input-method-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <FormControl>
                      <SearchableSelect
                        value={field.value}
                        onValueChange={field.onChange}
                        options={typeSelectOptions}
                        placeholder="Select type"
                        searchPlaceholder="Type payment type"
                        emptyText="No type found"
                        triggerTestId="select-method-type"
                        searchInputTestId="input-search-method-type"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="minAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Min Amount</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="10" {...field} data-testid="input-min-amount" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="maxAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Amount</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="10000" {...field} data-testid="input-max-amount" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4">
                <FormField
                  control={form.control}
                  name="sortOrder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sort Order</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="0"
                          {...field}
                          onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                          data-testid="input-sort-order"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="iconUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Icon URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://..." {...field} data-testid="input-icon-url" />
                    </FormControl>
                    <FormDescription>URL to the payment method icon (3D style recommended)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="processingTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Processing Time</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Instant, 1-2 hours" {...field} data-testid="input-processing-time" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="instructions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instructions</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Instructions for the user..."
                        {...field}
                        className="min-h-[80px]"
                        data-testid="input-instructions"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel>Active</FormLabel>
                      <FormDescription>Show this method to users</FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-is-active"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isWithdrawalEnabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel>Enable for withdrawals</FormLabel>
                      <FormDescription>Allow users to pick this method when creating a withdrawal request</FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-is-withdrawal-enabled"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-submit-method"
                >
                  {editingMethod ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showBulkDeleteConfirm}
        title="Delete selected payment methods"
        description={`Are you sure you want to delete ${selectedCount} selected method(s)? This action cannot be undone.`}
        variant="destructive"
        confirmLabel="Delete selected"
        loading={bulkActionMutation.isPending}
        onConfirm={() => bulkActionMutation.mutate({ ids: selectedMethodIds, action: "delete" })}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />

      <ConfirmDialog
        open={!!deleteMethodId}
        title={t("admin.payments.deleteTitle") || "Delete Payment Method"}
        description={t("admin.payments.deleteDescription") || "Are you sure you want to delete this payment method? This action cannot be undone."}
        variant="destructive"
        confirmLabel={t("common.delete") || "Delete"}
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteMethodId) {
            deleteMutation.mutate(deleteMethodId, {
              onSettled: () => setDeleteMethodId(null),
            });
          }
        }}
        onCancel={() => setDeleteMethodId(null)}
      />
    </div>
  );
}
