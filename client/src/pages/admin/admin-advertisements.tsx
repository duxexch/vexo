import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Plus, Trash2, Edit, Image, Video, Link, Code, GripVertical } from "lucide-react";
import type { Advertisement } from "@shared/schema";

function getAdminToken() {
  return localStorage.getItem("adminToken");
}

async function adminFetch(url: string, options?: RequestInit) {
  const token = getAdminToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

const typeIcons: Record<string, any> = {
  image: Image,
  video: Video,
  link: Link,
  embed: Code,
};

export default function AdminAdvertisementsPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAd, setEditingAd] = useState<Advertisement | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    titleAr: "",
    type: "image" as "image" | "video" | "link" | "embed",
    assetUrl: "",
    targetUrl: "",
    embedCode: "",
    displayDuration: 5000,
    sortOrder: 0,
    isActive: true,
  });

  const { data: ads = [], isLoading } = useQuery<Advertisement[]>({
    queryKey: ["/api/admin/advertisements"],
    queryFn: () => adminFetch("/api/admin/advertisements"),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) =>
      adminFetch("/api/admin/advertisements", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/advertisements"] });
      setIsDialogOpen(false);
      resetForm();
      toast({ title: "Advertisement created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create advertisement", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof formData> }) =>
      adminFetch(`/api/admin/advertisements/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/advertisements"] });
      setIsDialogOpen(false);
      setEditingAd(null);
      resetForm();
      toast({ title: "Advertisement updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update advertisement", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      adminFetch(`/api/admin/advertisements/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/advertisements"] });
      toast({ title: "Advertisement deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete advertisement", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      titleAr: "",
      type: "image",
      assetUrl: "",
      targetUrl: "",
      embedCode: "",
      displayDuration: 5000,
      sortOrder: 0,
      isActive: true,
    });
  };

  const handleEdit = (ad: Advertisement) => {
    setEditingAd(ad);
    setFormData({
      title: ad.title,
      titleAr: ad.titleAr || "",
      type: ad.type as "image" | "video" | "link" | "embed",
      assetUrl: ad.assetUrl || "",
      targetUrl: ad.targetUrl || "",
      embedCode: ad.embedCode || "",
      displayDuration: ad.displayDuration,
      sortOrder: ad.sortOrder,
      isActive: ad.isActive,
    });
    setIsDialogOpen(true);
  };

  const validateForm = (): string | null => {
    if (!formData.title.trim()) return "Title is required";
    if ((formData.type === "image" || formData.type === "video") && !formData.assetUrl.trim()) {
      return "Asset URL is required for image/video types";
    }
    if (formData.type === "embed" && !formData.embedCode.trim()) {
      return "Embed code is required for embed type";
    }
    if (isNaN(formData.displayDuration) || formData.displayDuration < 1000) {
      return "Display duration must be at least 1000ms";
    }
    if (isNaN(formData.sortOrder)) {
      return "Sort order must be a valid number";
    }
    return null;
  };

  const handleSubmit = () => {
    const error = validateForm();
    if (error) {
      toast({ title: error, variant: "destructive" });
      return;
    }
    
    const sanitizedData = {
      ...formData,
      displayDuration: Math.max(1000, formData.displayDuration || 5000),
      sortOrder: formData.sortOrder || 0,
    };
    
    if (editingAd) {
      updateMutation.mutate({ id: editingAd.id, data: sanitizedData });
    } else {
      createMutation.mutate(sanitizedData);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Advertisements</h1>
          <p className="text-muted-foreground">Manage carousel advertisements on the games page</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingAd(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-advertisement">
              <Plus className="h-4 w-4 me-2" />
              Add Advertisement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingAd ? "Edit Advertisement" : "Add Advertisement"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Title (English)</Label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Advertisement title"
                    data-testid="input-ad-title"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Title (Arabic)</Label>
                  <Input
                    value={formData.titleAr}
                    onChange={(e) => setFormData({ ...formData, titleAr: e.target.value })}
                    placeholder="عنوان الإعلان"
                    dir="rtl"
                    data-testid="input-ad-title-ar"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value as "image" | "video" | "link" | "embed" })}
                >
                  <SelectTrigger data-testid="select-ad-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="link">Link</SelectItem>
                    <SelectItem value="embed">Embed Code</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(formData.type === "image" || formData.type === "video") && (
                <div className="space-y-2">
                  <Label>Asset URL</Label>
                  <Input
                    value={formData.assetUrl}
                    onChange={(e) => setFormData({ ...formData, assetUrl: e.target.value })}
                    placeholder="https://example.com/image.jpg"
                    data-testid="input-ad-asset-url"
                  />
                </div>
              )}

              {(formData.type === "image" || formData.type === "link") && (
                <div className="space-y-2">
                  <Label>Target URL (click destination)</Label>
                  <Input
                    value={formData.targetUrl}
                    onChange={(e) => setFormData({ ...formData, targetUrl: e.target.value })}
                    placeholder="https://example.com"
                    data-testid="input-ad-target-url"
                  />
                </div>
              )}

              {formData.type === "embed" && (
                <div className="space-y-2">
                  <Label>Embed Code (HTML)</Label>
                  <Textarea
                    value={formData.embedCode}
                    onChange={(e) => setFormData({ ...formData, embedCode: e.target.value })}
                    placeholder="<iframe src='...'></iframe>"
                    rows={4}
                    data-testid="input-ad-embed-code"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Display Duration (ms)</Label>
                  <Input
                    type="number"
                    value={formData.displayDuration}
                    onChange={(e) => setFormData({ ...formData, displayDuration: parseInt(e.target.value) })}
                    data-testid="input-ad-duration"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sort Order</Label>
                  <Input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) })}
                    data-testid="input-ad-sort-order"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                  data-testid="switch-ad-active"
                />
                <Label>Active</Label>
              </div>

              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-advertisement"
              >
                {editingAd ? "Update Advertisement" : "Create Advertisement"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {ads.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No advertisements yet. Click "Add Advertisement" to create one.
            </CardContent>
          </Card>
        ) : (
          ads.map((ad) => {
            const TypeIcon = typeIcons[ad.type] || Image;
            return (
              <Card key={ad.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                      <div className="p-2 rounded-lg bg-primary/10">
                        <TypeIcon className="h-5 w-5 text-primary" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{ad.title}</h3>
                        <Badge variant={ad.isActive ? "default" : "secondary"}>
                          {ad.isActive ? "Active" : "Inactive"}
                        </Badge>
                        <Badge variant="outline">{ad.type}</Badge>
                      </div>
                      {ad.titleAr && (
                        <p className="text-sm text-muted-foreground" dir="rtl">{ad.titleAr}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Duration: {ad.displayDuration}ms | Order: {ad.sortOrder}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(ad)}
                        data-testid={`button-edit-ad-${ad.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(ad.id)}
                        className="text-destructive hover:text-destructive"
                        data-testid={`button-delete-ad-${ad.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
