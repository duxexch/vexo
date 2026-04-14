import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Headset,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  MessageCircle,
  Phone,
  Mail,
} from "lucide-react";
import {
  SiWhatsapp,
  SiTelegram,
  SiFacebook,
  SiInstagram,
  SiDiscord
} from "react-icons/si";
import { FaTwitter } from "react-icons/fa";

interface SupportContact {
  id: string;
  type: string;
  label: string;
  value: string;
  icon: string | null;
  isActive: boolean;
  displayOrder: number;
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
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

const contactTypes = [
  { value: "whatsapp", label: "WhatsApp", icon: SiWhatsapp },
  { value: "telegram", label: "Telegram", icon: SiTelegram },
  { value: "email", label: "Email", icon: Mail },
  { value: "phone", label: "Phone", icon: Phone },
  { value: "facebook", label: "Facebook", icon: SiFacebook },
  { value: "instagram", label: "Instagram", icon: SiInstagram },
  { value: "twitter", label: "Twitter", icon: FaTwitter },
  { value: "discord", label: "Discord", icon: SiDiscord },
  { value: "other", label: "Other", icon: MessageCircle },
];

const getIcon = (type: string) => {
  const found = contactTypes.find(t => t.value === type);
  return found?.icon || MessageCircle;
};

const SURFACE_CARD_CLASS = "rounded-[24px] border border-slate-200/80 bg-gradient-to-b from-white via-slate-50 to-slate-100/70 shadow-[0_14px_40px_-24px_rgba(15,23,42,0.55)] dark:border-slate-800/80 dark:from-slate-900 dark:via-slate-950 dark:to-slate-950";
const BUTTON_3D_CLASS = "rounded-xl border border-slate-300/80 bg-gradient-to-b from-white to-slate-100 text-slate-900 shadow-[0_8px_0_0_rgba(148,163,184,0.5)] transition active:translate-y-[1px] active:shadow-[0_5px_0_0_rgba(148,163,184,0.45)] hover:brightness-105 dark:border-slate-700 dark:from-slate-800 dark:to-slate-900 dark:text-slate-100 dark:shadow-[0_8px_0_0_rgba(15,23,42,0.82)]";
const BUTTON_3D_PRIMARY_CLASS = "rounded-xl border border-sky-600 bg-gradient-to-b from-sky-400 via-sky-500 to-sky-700 text-white shadow-[0_8px_0_0_rgba(3,105,161,0.58)] transition active:translate-y-[1px] active:shadow-[0_5px_0_0_rgba(3,105,161,0.52)] hover:brightness-105";
const BUTTON_3D_DANGER_CLASS = "rounded-xl border border-red-700 bg-gradient-to-b from-red-500 via-red-600 to-red-800 text-white shadow-[0_8px_0_0_rgba(127,29,29,0.58)] transition active:translate-y-[1px] active:shadow-[0_5px_0_0_rgba(127,29,29,0.52)] hover:brightness-105";
const INPUT_SURFACE_CLASS = "min-h-[46px] rounded-xl border-slate-200/80 bg-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_10px_24px_-20px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900";
const DIALOG_SURFACE_CLASS = "max-w-[calc(100vw-1rem)] sm:max-w-2xl rounded-[28px] border border-slate-200/80 bg-gradient-to-b from-white via-slate-50 to-slate-100 p-0 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:from-slate-900 dark:via-slate-950 dark:to-slate-950";
const DATA_CARD_CLASS = "rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-[0_12px_28px_-22px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-900/60";
const TABLE_WRAP_CLASS = "hidden md:block overflow-x-auto rounded-[24px] border border-slate-200/80 bg-white/70 shadow-[0_14px_40px_-24px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-950/60";
const SETTING_ROW_CLASS = "flex items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/70 p-3 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-900/60";

function getValueHint(type: string) {
  if (type === "whatsapp") return "Enter phone number with country code";
  if (type === "telegram") return "Enter username or link";
  if (type === "email") return "Enter email address";
  if (type === "phone") return "Enter phone number";
  if (type === "facebook") return "Enter page name or link";
  if (type === "instagram") return "Enter username";
  if (type === "twitter") return "Enter username";
  if (type === "discord") return "Enter invite code or link";
  return "Enter support contact value";
}

export default function AdminSupportPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<SupportContact | null>(null);
  const [formData, setFormData] = useState({
    type: "whatsapp",
    label: "",
    value: "",
    isActive: true,
    displayOrder: 0,
  });

  const { data: contacts, isLoading } = useQuery<SupportContact[]>({
    queryKey: ["/api/admin/support/contacts"],
    queryFn: () => adminFetch("/api/admin/support/contacts"),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) =>
      adminFetch("/api/admin/support/contacts", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/contacts"] });
      toast({ title: "Contact added successfully" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to add contact", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof formData> }) =>
      adminFetch(`/api/admin/support/contacts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/contacts"] });
      toast({ title: "Contact updated successfully" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to update contact", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      adminFetch(`/api/admin/support/contacts/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/contacts"] });
      toast({ title: "Contact deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete contact", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      type: "whatsapp",
      label: "",
      value: "",
      isActive: true,
      displayOrder: 0,
    });
    setEditingContact(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (contact: SupportContact) => {
    setEditingContact(contact);
    setFormData({
      type: contact.type,
      label: contact.label,
      value: contact.value,
      isActive: contact.isActive,
      displayOrder: contact.displayOrder,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    const normalizedLabel = formData.label.trim();
    const normalizedValue = formData.value.trim();
    const normalizedDisplayOrder = Math.max(0, Number.isFinite(formData.displayOrder) ? formData.displayOrder : 0);

    if (!normalizedLabel || !normalizedValue) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }

    const payload = {
      ...formData,
      label: normalizedLabel,
      value: normalizedValue,
      displayOrder: normalizedDisplayOrder,
    };

    if (editingContact) {
      updateMutation.mutate({ id: editingContact.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleToggleActive = (contact: SupportContact) => {
    updateMutation.mutate({
      id: contact.id,
      data: { isActive: !contact.isActive },
    });
  };

  const sortedContacts = [...(contacts ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);
  const SelectedTypeIcon = getIcon(formData.type);
  const surfaceCardClass = SURFACE_CARD_CLASS;
  const button3dClass = BUTTON_3D_CLASS;
  const button3dPrimaryClass = BUTTON_3D_PRIMARY_CLASS;
  const button3dDangerClass = BUTTON_3D_DANGER_CLASS;

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-5 md:space-y-6">
      <div className={`${surfaceCardClass} px-5 py-5 sm:px-6 sm:py-6`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-b from-sky-400 to-sky-700 text-white shadow-[0_10px_0_0_rgba(3,105,161,0.45)]">
              <Headset className="h-7 w-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl" data-testid="text-admin-support-title">
                  Support Contacts Management
                </h1>
                <Badge variant="outline" className="border-slate-300 bg-white/80 text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
                  {sortedContacts.length}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                Manage customer support contact methods
              </p>
            </div>
          </div>
          <Button className={button3dPrimaryClass} onClick={() => setIsDialogOpen(true)} data-testid="button-add-contact">
            <Plus className="h-4 w-4 me-2" />
            Add Contact
          </Button>
        </div>
      </div>

      <Card className={surfaceCardClass}>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Contact Methods</CardTitle>
          {sortedContacts.length > 0 ? (
            <Badge variant="secondary">{sortedContacts.length}</Badge>
          ) : null}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-28 rounded-2xl" />
              ))}
            </div>
          ) : !sortedContacts.length ? (
            <div className="text-center py-12">
              <Headset className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No contacts yet</h3>
              <p className="text-muted-foreground mb-4">
                Add your first support contact method
              </p>
              <Button className={button3dPrimaryClass} onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 me-2" />
                Add Contact
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {sortedContacts.map((contact) => {
                  const Icon = getIcon(contact.type);
                  return (
                    <div key={contact.id} className={DATA_CARD_CLASS} data-testid={`row-contact-${contact.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold">{contact.label}</p>
                              <Badge variant="outline" className="capitalize">{contact.type}</Badge>
                            </div>
                            <p className="mt-1 break-all text-sm text-muted-foreground">{contact.value}</p>
                          </div>
                        </div>
                        <Badge variant={contact.isActive ? "default" : "secondary"}>
                          {contact.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <div>
                          <p className="text-xs text-muted-foreground">#{contact.displayOrder}</p>
                          <p className="text-sm font-medium capitalize">{contact.type}</p>
                        </div>
                        <Switch
                          checked={contact.isActive}
                          onCheckedChange={() => handleToggleActive(contact)}
                          data-testid={`switch-contact-${contact.id}`}
                        />
                      </div>

                      <div className="mt-4 flex gap-2">
                        <Button
                          className={`${button3dClass} flex-1`}
                          onClick={() => handleEdit(contact)}
                          data-testid={`button-edit-${contact.id}`}
                        >
                          <Pencil className="h-4 w-4 me-2" />
                          Edit
                        </Button>
                        <Button
                          className={`${button3dDangerClass} flex-1`}
                          onClick={() => deleteMutation.mutate(contact.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${contact.id}`}
                        >
                          <Trash2 className="h-4 w-4 me-2" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className={TABLE_WRAP_CLASS}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedContacts.map((contact) => {
                      const Icon = getIcon(contact.type);
                      return (
                        <TableRow key={contact.id} data-testid={`row-contact-${contact.id}-desktop`}>
                          <TableCell>
                            <Badge variant="outline">#{contact.displayOrder}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              <span className="capitalize">{contact.type}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{contact.label}</TableCell>
                          <TableCell className="max-w-[280px] truncate text-muted-foreground">
                            {contact.value}
                          </TableCell>
                          <TableCell>
                            <Badge variant={contact.isActive ? "default" : "secondary"}>
                              {contact.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={contact.isActive}
                                onCheckedChange={() => handleToggleActive(contact)}
                                data-testid={`switch-contact-${contact.id}-desktop`}
                              />
                              <Button
                                className={`${button3dClass} h-10 w-10 p-0`}
                                onClick={() => handleEdit(contact)}
                                data-testid={`button-edit-${contact.id}-desktop`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                className={`${button3dDangerClass} h-10 w-10 p-0`}
                                onClick={() => deleteMutation.mutate(contact.id)}
                                disabled={deleteMutation.isPending}
                                data-testid={`button-delete-${contact.id}-desktop`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        if (!open) {
          resetForm();
          return;
        }

        setIsDialogOpen(true);
      }}>
        <DialogContent className={DIALOG_SURFACE_CLASS}>
          <DialogHeader className="border-b border-slate-200/70 px-6 py-5 dark:border-slate-800">
            <DialogTitle>
              {editingContact ? "Edit Contact" : "Add New Contact"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300">
                <SelectedTypeIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">{editingContact ? "Edit Contact" : "Add New Contact"}</p>
                <p className="text-sm text-muted-foreground capitalize">{formData.type}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger className={INPUT_SURFACE_CLASS} data-testid="select-contact-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {contactTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <type.icon className="h-4 w-4" />
                        {type.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Label *</Label>
              <Input
                className={INPUT_SURFACE_CLASS}
                placeholder="e.g., Customer Support"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                data-testid="input-contact-label"
              />
            </div>

            <div className="space-y-2">
              <Label>Value *</Label>
              <Input
                className={INPUT_SURFACE_CLASS}
                placeholder="e.g., +1234567890 or @username"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                data-testid="input-contact-value"
              />
              <p className="text-xs text-muted-foreground">
                {getValueHint(formData.type)}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Display Order</Label>
              <Input
                className={INPUT_SURFACE_CLASS}
                type="number"
                min="0"
                value={formData.displayOrder}
                onChange={(e) => setFormData({ ...formData, displayOrder: Math.max(0, parseInt(e.target.value) || 0) })}
                data-testid="input-contact-order"
              />
            </div>

            <div className={SETTING_ROW_CLASS}>
              <div>
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">Control whether this contact is visible to users</p>
              </div>
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                data-testid="switch-contact-active"
              />
            </div>
          </div>
          <DialogFooter className="border-t border-slate-200/70 px-6 py-5 dark:border-slate-800">
            <Button variant="outline" className={button3dClass} onClick={resetForm}>
              <X className="h-4 w-4 me-2" />
              Cancel
            </Button>
            <Button
              className={button3dPrimaryClass}
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-contact"
            >
              <Save className="h-4 w-4 me-2" />
              {editingContact ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
