import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  GripVertical
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
    if (!formData.label || !formData.value) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }

    if (editingContact) {
      updateMutation.mutate({ id: editingContact.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleToggleActive = (contact: SupportContact) => {
    updateMutation.mutate({
      id: contact.id,
      data: { isActive: !contact.isActive },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Headset className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-admin-support-title">
              Support Contacts Management
            </h1>
            <p className="text-muted-foreground">
              Manage customer support contact methods
            </p>
          </div>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-contact">
          <Plus className="h-4 w-4 me-2" />
          Add Contact
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contact Methods</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : !contacts?.length ? (
            <div className="text-center py-12">
              <Headset className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No contacts yet</h3>
              <p className="text-muted-foreground mb-4">
                Add your first support contact method
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 me-2" />
                Add Contact
              </Button>
            </div>
          ) : (
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
                {contacts
                  .sort((a, b) => a.displayOrder - b.displayOrder)
                  .map((contact, index) => {
                    const Icon = getIcon(contact.type);
                    return (
                      <TableRow key={contact.id} data-testid={`row-contact-${contact.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                            {index + 1}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            <span className="capitalize">{contact.type}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{contact.label}</TableCell>
                        <TableCell className="text-muted-foreground max-w-[200px] truncate">
                          {contact.value}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={contact.isActive}
                            onCheckedChange={() => handleToggleActive(contact)}
                            data-testid={`switch-contact-${contact.id}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(contact)}
                              data-testid={`button-edit-${contact.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteMutation.mutate(contact.id)}
                              data-testid={`button-delete-${contact.id}`}
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
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingContact ? "Edit Contact" : "Add New Contact"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger data-testid="select-contact-type">
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
                placeholder="e.g., Customer Support"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                data-testid="input-contact-label"
              />
            </div>

            <div className="space-y-2">
              <Label>Value *</Label>
              <Input
                placeholder="e.g., +1234567890 or @username"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                data-testid="input-contact-value"
              />
              <p className="text-xs text-muted-foreground">
                {formData.type === "whatsapp" && "Enter phone number with country code"}
                {formData.type === "telegram" && "Enter username or link"}
                {formData.type === "email" && "Enter email address"}
                {formData.type === "phone" && "Enter phone number"}
                {formData.type === "facebook" && "Enter page name or link"}
                {formData.type === "instagram" && "Enter username"}
                {formData.type === "twitter" && "Enter username"}
                {formData.type === "discord" && "Enter invite code or link"}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Display Order</Label>
              <Input
                type="number"
                min="0"
                value={formData.displayOrder}
                onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) || 0 })}
                data-testid="input-contact-order"
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                data-testid="switch-contact-active"
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>
              <X className="h-4 w-4 me-2" />
              Cancel
            </Button>
            <Button 
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
