import { useMemo, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  ToggleLeft,
  ToggleRight,
  Image,
  ArrowUpDown,
  Settings2
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

export default function AdminPaymentMethodsPage() {
  const { t, language } = useI18n();
  const { toast } = useToast();
  const [editingMethod, setEditingMethod] = useState<CountryPaymentMethod | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [deleteMethodId, setDeleteMethodId] = useState<string | null>(null);

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
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/admin/payment-methods/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-methods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

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
          <p className="text-muted-foreground">Manage deposit payment methods for users</p>
        </div>
        <Button onClick={openCreateDialog} data-testid="button-add-payment-method">
          <Plus className="h-4 w-4 me-2" />
          Add Payment Method
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Payment Methods</CardTitle>
          <CardDescription>Configure which payment methods are available for deposits</CardDescription>
        </CardHeader>
        <CardContent>
          {paymentMethods && paymentMethods.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Icon</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Limits</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentMethods.map((method) => {
                  const TypeIcon = TYPE_ICONS[method.type as keyof typeof TYPE_ICONS] || CreditCard;
                  return (
                    <TableRow key={method.id} data-testid={`row-payment-method-${method.id}`}>
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
                          checked={method.isActive}
                          onCheckedChange={(checked) => toggleMutation.mutate({ id: method.id, isActive: checked })}
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
              Configure a payment method that will be shown to users during deposits
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
                    <Select onValueChange={(value) => field.onChange(value.toUpperCase())} value={String(field.value || "ALL").toUpperCase()}>
                      <FormControl>
                        <SelectTrigger data-testid="select-country-code">
                          <SelectValue placeholder="Select country" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {countryCodeOptions.map((countryCode) => (
                          <SelectItem key={countryCode} value={countryCode}>
                            {countryCode}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-method-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="e_wallet">E-Wallet</SelectItem>
                        <SelectItem value="crypto">Cryptocurrency</SelectItem>
                        <SelectItem value="card">Credit/Debit Card</SelectItem>
                      </SelectContent>
                    </Select>
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
