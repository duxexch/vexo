import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Gift, Upload, Plus, Image as ImageIcon } from "lucide-react";
import DOMPurify from "dompurify";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProjectCurrencyAmount } from "@/components/ProjectCurrencySymbol";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface GiftCatalogItem {
    id: string;
    name: string;
    nameAr?: string | null;
    price: string;
    iconUrl?: string | null;
    category?: string | null;
    animationType?: string | null;
    coinValue: number;
    isActive: boolean;
    sortOrder: number;
    createdAt: string;
}

interface UploadIconResponse {
    iconUrl: string;
}

interface GiftFormState {
    name: string;
    nameAr: string;
    price: string;
    iconUrl: string;
    category: string;
    animationType: string;
    coinValue: string;
}

const CATEGORY_OPTIONS = ["general", "love", "celebration", "gaming"];
const ANIMATION_OPTIONS = ["float", "burst", "rain", "spin"];
const LOCAL_ICON_PATH_PATTERN = /^\/[a-zA-Z0-9/_%.\-]+$/;

function toSafeIconPath(value: string | null | undefined): string | null {
    if (!value) return null;
    const normalized = value.trim();
    if (!normalized) return null;
    return LOCAL_ICON_PATH_PATTERN.test(normalized) ? normalized : null;
}

function sanitizeErrorMessage(error: unknown): string {
    const raw = error instanceof Error
        ? error.message
        : String(error || "Unexpected error");

    return DOMPurify.sanitize(raw, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: [],
    });
}

async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || "");
            const base64 = result.includes(",") ? result.split(",")[1] : result;
            resolve(base64);
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
    });
}

export default function AdminGiftsPage() {
    const { toast } = useToast();
    const [form, setForm] = useState<GiftFormState>({
        name: "",
        nameAr: "",
        price: "5.00",
        iconUrl: "",
        category: "general",
        animationType: "float",
        coinValue: "5",
    });

    const { data: gifts = [], isLoading } = useQuery<GiftCatalogItem[]>({
        queryKey: ["/api/admin/gifts"],
    });

    const uploadIconMutation = useMutation({
        mutationFn: async (file: File) => {
            const data = await fileToBase64(file);
            const response = await apiRequest("POST", "/api/admin/gifts/upload-icon", {
                data,
                mimeType: file.type,
                fileName: file.name,
            });
            return response.json() as Promise<UploadIconResponse>;
        },
        onSuccess: (payload) => {
            setForm((prev) => ({ ...prev, iconUrl: payload.iconUrl }));
            toast({ title: "Success", description: "Gift icon uploaded successfully" });
        },
        onError: (error: Error) => {
            toast({ title: "Error", description: sanitizeErrorMessage(error), variant: "destructive" });
        },
    });

    const createGiftMutation = useMutation({
        mutationFn: async (payload: GiftFormState) => {
            const response = await apiRequest("POST", "/api/admin/gifts", {
                name: payload.name,
                nameAr: payload.nameAr || null,
                price: payload.price,
                iconUrl: payload.iconUrl,
                category: payload.category,
                animationType: payload.animationType,
                coinValue: Number(payload.coinValue || 0),
            });
            return response.json() as Promise<GiftCatalogItem>;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/gifts"] });
            queryClient.invalidateQueries({ queryKey: ["/api/gifts"] });
            queryClient.invalidateQueries({ queryKey: ["/api/gifts/catalog"] });
            toast({ title: "Success", description: "Gift created successfully" });
            setForm({
                name: "",
                nameAr: "",
                price: "5.00",
                iconUrl: "",
                category: "general",
                animationType: "float",
                coinValue: "5",
            });
        },
        onError: (error: Error) => {
            toast({ title: "Error", description: sanitizeErrorMessage(error), variant: "destructive" });
        },
    });

    const handleIconFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            toast({ title: "Error", description: "Please choose an image file", variant: "destructive" });
            event.target.value = "";
            return;
        }

        uploadIconMutation.mutate(file);
        event.target.value = "";
    };

    const handleCreateGift = () => {
        if (!form.name.trim()) {
            toast({ title: "Error", description: "Gift name is required", variant: "destructive" });
            return;
        }

        if (!form.iconUrl.trim()) {
            toast({ title: "Error", description: "Gift icon is required", variant: "destructive" });
            return;
        }

        const parsedPrice = Number(form.price);
        if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
            toast({ title: "Error", description: "Gift price in project currency must be greater than zero", variant: "destructive" });
            return;
        }

        createGiftMutation.mutate(form);
    };

    const previewIconPath = toSafeIconPath(form.iconUrl);

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Gift className="h-7 w-7 text-primary" />
                        Gift Catalog
                    </h1>
                    <p className="text-muted-foreground">Manage game gifts, upload icon images, and set prices in project currency.</p>
                </div>
                <Badge variant="outline">{gifts.length} gifts</Badge>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Plus className="h-5 w-5" />
                        Add New Gift
                    </CardTitle>
                    <CardDescription>Upload icon from your local device, set project-currency price, then save.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="gift-name">Gift Name (EN)</Label>
                            <Input
                                id="gift-name"
                                value={form.name}
                                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                                placeholder="Rose"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="gift-name-ar">Gift Name (AR)</Label>
                            <Input
                                id="gift-name-ar"
                                value={form.nameAr}
                                onChange={(e) => setForm((prev) => ({ ...prev, nameAr: e.target.value }))}
                                placeholder="وردة"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="gift-price">Price (Project Currency)</Label>
                            <Input
                                id="gift-price"
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={form.price}
                                onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="gift-coin-value">Coin Value</Label>
                            <Input
                                id="gift-coin-value"
                                type="number"
                                min="1"
                                value={form.coinValue}
                                onChange={(e) => setForm((prev) => ({ ...prev, coinValue: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Category</Label>
                            <Select value={form.category} onValueChange={(value) => setForm((prev) => ({ ...prev, category: value }))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                                <SelectContent>
                                    {CATEGORY_OPTIONS.map((category) => (
                                        <SelectItem key={category} value={category}>{category}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Animation</Label>
                            <Select value={form.animationType} onValueChange={(value) => setForm((prev) => ({ ...prev, animationType: value }))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select animation" />
                                </SelectTrigger>
                                <SelectContent>
                                    {ANIMATION_OPTIONS.map((animation) => (
                                        <SelectItem key={animation} value={animation}>{animation}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="gift-icon-file">Gift Icon Image</Label>
                        <div className="flex flex-wrap gap-2 items-center">
                            <Input
                                id="gift-icon-file"
                                type="file"
                                accept="image/*"
                                onChange={handleIconFileChange}
                                className="max-w-sm"
                            />
                            <Button type="button" variant="secondary" disabled={uploadIconMutation.isPending}>
                                <Upload className="h-4 w-4 me-2" />
                                {uploadIconMutation.isPending ? "Uploading..." : "Upload"}
                            </Button>
                        </div>
                        <Input
                            value={form.iconUrl}
                            onChange={(e) => setForm((prev) => ({ ...prev, iconUrl: e.target.value }))}
                            placeholder="Uploaded icon URL"
                        />
                        {previewIconPath && (
                            <div className="inline-flex items-center gap-2 rounded-lg border p-2 bg-muted/30">
                                <img src={previewIconPath} alt="Gift icon preview" className="h-10 w-10 rounded object-cover" />
                                <span className="text-sm text-muted-foreground">Icon preview</span>
                            </div>
                        )}
                    </div>

                    <Button onClick={handleCreateGift} disabled={createGiftMutation.isPending || uploadIconMutation.isPending}>
                        <Plus className="h-4 w-4 me-2" />
                        {createGiftMutation.isPending ? "Saving..." : "Save Gift"}
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ImageIcon className="h-5 w-5" />
                        Existing Gifts
                    </CardTitle>
                    <CardDescription>Current gift catalog entries available in the platform.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-muted-foreground">Loading gifts...</div>
                    ) : gifts.length === 0 ? (
                        <div className="text-muted-foreground">No gifts found.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Icon</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Arabic</TableHead>
                                        <TableHead>Price</TableHead>
                                        <TableHead>Category</TableHead>
                                        <TableHead>Animation</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {gifts.map((gift) => {
                                        const safeIconPath = toSafeIconPath(gift.iconUrl || "");
                                        return (
                                            <TableRow key={gift.id}>
                                                <TableCell>
                                                    {safeIconPath ? (
                                                        <img src={safeIconPath} alt={gift.name} className="h-9 w-9 rounded object-cover border" />
                                                    ) : (
                                                        <Badge variant="secondary">gift</Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="font-medium">{gift.name}</TableCell>
                                                <TableCell>{gift.nameAr || "-"}</TableCell>
                                                <TableCell>
                                                    <ProjectCurrencyAmount amount={gift.price || 0} fractionDigits={2} />
                                                </TableCell>
                                                <TableCell>{gift.category || "general"}</TableCell>
                                                <TableCell>{gift.animationType || "float"}</TableCell>
                                                <TableCell>
                                                    <Badge variant={gift.isActive ? "default" : "outline"}>
                                                        {gift.isActive ? "Active" : "Inactive"}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
