import { useMemo, useRef, useState, type ComponentType } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useI18n } from "@/lib/i18n";
import {
    Plus,
    Pencil,
    Trash2,
    Award,
    Loader2,
    Star,
    Trophy,
    Crown,
    Sparkles,
    Upload,
    Shield,
    Users,
    Search,
    UserPlus,
    X,
    ShieldCheck,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import * as LucideIcons from "lucide-react";

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
        throw new Error(data.error || "Failed to fetch");
    }
    return res.json();
}

function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || "");
            if (!result.startsWith("data:")) {
                reject(new Error("Invalid file data"));
                return;
            }
            resolve(result);
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
    });
}

function isImagePath(value?: string | null): value is string {
    if (!value) return false;
    const normalized = value.trim();
    if (!normalized) return false;
    return normalized.startsWith("/") || /^https?:\/\//i.test(normalized);
}

interface TrustBadgeSummary {
    id: string;
    name: string;
    nameAr: string | null;
    iconUrl: string | null;
    iconName: string | null;
    color: string | null;
    level: number;
    points: number;
}

interface BadgeCatalog {
    id: string;
    name: string;
    nameAr: string | null;
    description: string | null;
    descriptionAr: string | null;
    iconUrl: string | null;
    iconName: string | null;
    color: string | null;
    category: string | null;
    requirement: string | null;
    level: number;
    p2pMonthlyLimit: string | null;
    challengeMaxAmount: string | null;
    grantsP2pPrivileges: boolean;
    showOnProfile: boolean;
    points: number;
    isActive: boolean;
    sortOrder: number;
    createdAt: string;
}

interface BadgeAssignableUser {
    id: string;
    username: string;
    nickname: string | null;
    accountId: string | null;
    profilePicture: string | null;
    createdAt: string;
    badgeCount: number;
    topBadge: TrustBadgeSummary | null;
}

interface AssignedBadge {
    badgeId: string;
    name: string;
    nameAr: string | null;
    iconUrl: string | null;
    iconName: string | null;
    color: string | null;
    category: string | null;
    level: number;
    points: number;
    earnedAt: string;
}

interface UserAssignedBadgeResponse {
    userId: string;
    assignedBadges: AssignedBadge[];
}

interface InitializeBadgesResponse {
    success: boolean;
    insertedCount: number;
    skippedCount: number;
    totalDefaults: number;
}

const DEFAULT_TRUST_BADGE_NAMES = [
    "Trusted Seed",
    "Trusted Bronze",
    "Trusted Silver",
    "Trusted Gold",
    "Elite Trader",
    "Platinum Vault",
    "Diamond Trust",
    "Master Merchant",
    "Grand Commander",
    "Royal Legend",
] as const;

const optionalLimitField = z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
}, z.number().min(0, "Must be >= 0").nullable());

const badgeSchema = z.object({
    name: z.string().min(1, "Name is required"),
    nameAr: z.string().optional(),
    description: z.string().optional(),
    descriptionAr: z.string().optional(),
    iconUrl: z.string().optional(),
    iconName: z.string().optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color").optional().or(z.literal("")),
    category: z.enum(["achievement", "vip", "special", "event", "trust"]),
    level: z.coerce.number().int().min(1, "Level must be at least 1").max(100, "Level must be <= 100"),
    p2pMonthlyLimit: optionalLimitField,
    challengeMaxAmount: optionalLimitField,
    grantsP2pPrivileges: z.boolean().default(false),
    showOnProfile: z.boolean().default(true),
    points: z.coerce.number().min(0, "Points must be positive"),
    sortOrder: z.coerce.number().int().min(0, "Sort order must be >= 0"),
    isActive: z.boolean().default(true),
});

type BadgeFormData = z.infer<typeof badgeSchema>;

const categoryIcons: Record<string, typeof Star> = {
    achievement: Trophy,
    vip: Crown,
    special: Sparkles,
    event: Star,
    trust: ShieldCheck,
};

function DynamicIcon({ name, className }: { name: string; className?: string }) {
    const IconComponent = (LucideIcons as unknown as Record<string, ComponentType<{ className?: string }>>)[name];
    if (IconComponent) {
        return <IconComponent className={className} />;
    }
    return <Award className={className} />;
}

function formatLimitValue(value: string | null): string {
    if (value === null || value === undefined || value === "") return "-";
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "-";
    return parsed.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function toBadgePayload(data: BadgeFormData) {
    return {
        ...data,
        iconName: data.iconName?.trim() || "Award",
        iconUrl: data.iconUrl?.trim() || null,
        nameAr: data.nameAr?.trim() || null,
        description: data.description?.trim() || null,
        descriptionAr: data.descriptionAr?.trim() || null,
        color: data.color?.trim() || "#10b981",
        p2pMonthlyLimit: data.p2pMonthlyLimit === null ? null : Number(data.p2pMonthlyLimit).toFixed(2),
        challengeMaxAmount: data.challengeMaxAmount === null ? null : Number(data.challengeMaxAmount).toFixed(2),
    };
}

export default function AdminBadgesPage() {
    const { toast } = useToast();
    const { language } = useI18n();
    const isArabic = language === "ar";

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingBadge, setEditingBadge] = useState<BadgeCatalog | null>(null);
    const [deleteBadge, setDeleteBadge] = useState<BadgeCatalog | null>(null);
    const [userSearch, setUserSearch] = useState("");
    const [selectedUserId, setSelectedUserId] = useState("");
    const [selectedBadgeId, setSelectedBadgeId] = useState("");
    const [replaceExisting, setReplaceExisting] = useState(true);

    const iconFileInputRef = useRef<HTMLInputElement | null>(null);

    const form = useForm<BadgeFormData>({
        resolver: zodResolver(badgeSchema),
        defaultValues: {
            name: "",
            nameAr: "",
            description: "",
            descriptionAr: "",
            iconUrl: "",
            iconName: "Award",
            color: "#10b981",
            category: "achievement",
            level: 1,
            p2pMonthlyLimit: null,
            challengeMaxAmount: null,
            grantsP2pPrivileges: false,
            showOnProfile: true,
            points: 0,
            sortOrder: 0,
            isActive: true,
        },
    });

    const { data: badges, isLoading } = useQuery<BadgeCatalog[]>({
        queryKey: ["/api/admin/badges"],
        queryFn: () => adminFetch("/api/admin/badges"),
    });

    const { data: users = [], isLoading: usersLoading } = useQuery<BadgeAssignableUser[]>({
        queryKey: ["/api/admin/badges/users", userSearch],
        queryFn: () => adminFetch(`/api/admin/badges/users?q=${encodeURIComponent(userSearch)}&limit=30`),
    });

    const { data: assignedData, isLoading: assignedLoading } = useQuery<UserAssignedBadgeResponse>({
        queryKey: ["/api/admin/badges/users", selectedUserId, "assigned"],
        queryFn: () => adminFetch(`/api/admin/badges/users/${selectedUserId}/assigned`),
        enabled: !!selectedUserId,
    });

    const uploadIconMutation = useMutation({
        mutationFn: async (file: File) => {
            const fileData = await fileToDataUrl(file);
            const uploadResult = await adminFetch("/api/upload", {
                method: "POST",
                body: JSON.stringify({
                    fileData,
                    fileName: file.name,
                }),
            }) as { url?: string };

            const uploadedUrl = typeof uploadResult?.url === "string" ? uploadResult.url : "";
            if (!uploadedUrl) {
                throw new Error(isArabic ? "فشل رفع الأيقونة" : "Failed to upload icon");
            }
            return uploadedUrl;
        },
        onSuccess: (url) => {
            form.setValue("iconUrl", url, { shouldDirty: true, shouldValidate: true });
            toast({
                title: isArabic ? "تم الرفع" : "Uploaded",
                description: isArabic ? "تم رفع أيقونة الشارة" : "Badge icon uploaded",
            });
        },
        onError: (error: Error) => {
            toast({ title: isArabic ? "خطأ" : "Error", description: error.message, variant: "destructive" });
        },
    });

    const createMutation = useMutation({
        mutationFn: async (data: BadgeFormData) => {
            return adminFetch("/api/admin/badges", {
                method: "POST",
                body: JSON.stringify(toBadgePayload(data)),
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/badges"] });
            toast({ title: isArabic ? "تم الإنشاء" : "Created", description: isArabic ? "تمت إضافة الشارة بنجاح" : "Badge added successfully" });
            closeDialog();
        },
        onError: (error: Error) => {
            toast({ title: isArabic ? "خطأ" : "Error", description: error.message, variant: "destructive" });
        },
    });

    const updateMutation = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: BadgeFormData }) => {
            return adminFetch(`/api/admin/badges/${id}`, {
                method: "PUT",
                body: JSON.stringify(toBadgePayload(data)),
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/badges"] });
            toast({ title: isArabic ? "تم التحديث" : "Updated", description: isArabic ? "تم تحديث الشارة بنجاح" : "Badge updated successfully" });
            closeDialog();
        },
        onError: (error: Error) => {
            toast({ title: isArabic ? "خطأ" : "Error", description: error.message, variant: "destructive" });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            return adminFetch(`/api/admin/badges/${id}`, { method: "DELETE" });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/badges"] });
            toast({ title: isArabic ? "تم الحذف" : "Deleted", description: isArabic ? "تم حذف الشارة" : "Badge deleted" });
            setDeleteBadge(null);
        },
        onError: (error: Error) => {
            toast({ title: isArabic ? "خطأ" : "Error", description: error.message, variant: "destructive" });
            setDeleteBadge(null);
        },
    });

    const initializeBadgesMutation = useMutation({
        mutationFn: async () => {
            return adminFetch("/api/admin/badges/initialize", { method: "POST" }) as Promise<InitializeBadgesResponse>;
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/badges"] });
            toast({
                title: isArabic ? "تمت التهيئة" : "Badges Initialized",
                description: isArabic
                    ? `تم إدراج ${result.insertedCount} شارة. المتبقي موجود مسبقًا: ${result.skippedCount}`
                    : `Inserted ${result.insertedCount} badges. Already existed: ${result.skippedCount}`,
            });
        },
        onError: (error: Error) => {
            toast({ title: isArabic ? "خطأ" : "Error", description: error.message, variant: "destructive" });
        },
    });

    const assignBadgeMutation = useMutation({
        mutationFn: async (payload: { userId: string; badgeId: string; replaceExisting: boolean }) => {
            return adminFetch("/api/admin/badges/assign", {
                method: "POST",
                body: JSON.stringify(payload),
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/badges/users"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/badges/users", selectedUserId, "assigned"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/p2p/ad-permissions"] });
            toast({
                title: isArabic ? "تم منح الشارة" : "Badge Assigned",
                description: isArabic ? "تم تطبيق الشارة وصلاحياتها" : "Badge and entitlements were applied",
            });
        },
        onError: (error: Error) => {
            toast({ title: isArabic ? "خطأ" : "Error", description: error.message, variant: "destructive" });
        },
    });

    const removeAssignedBadgeMutation = useMutation({
        mutationFn: async (payload: { userId: string; badgeId: string }) => {
            return adminFetch(`/api/admin/badges/users/${payload.userId}/${payload.badgeId}`, { method: "DELETE" });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/badges/users"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/badges/users", selectedUserId, "assigned"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/p2p/ad-permissions"] });
            toast({
                title: isArabic ? "تمت إزالة الشارة" : "Badge Removed",
                description: isArabic ? "تمت إزالة الشارة من المستخدم" : "Badge removed from user",
            });
        },
        onError: (error: Error) => {
            toast({ title: isArabic ? "خطأ" : "Error", description: error.message, variant: "destructive" });
        },
    });

    const openCreateDialog = () => {
        form.reset({
            name: "",
            nameAr: "",
            description: "",
            descriptionAr: "",
            iconUrl: "",
            iconName: "Award",
            color: "#10b981",
            category: "achievement",
            level: 1,
            p2pMonthlyLimit: null,
            challengeMaxAmount: null,
            grantsP2pPrivileges: false,
            showOnProfile: true,
            points: 0,
            sortOrder: 0,
            isActive: true,
        });
        setEditingBadge(null);
        setIsDialogOpen(true);
    };

    const openEditDialog = (badge: BadgeCatalog) => {
        form.reset({
            name: badge.name,
            nameAr: badge.nameAr || "",
            description: badge.description || "",
            descriptionAr: badge.descriptionAr || "",
            iconUrl: badge.iconUrl || "",
            iconName: badge.iconName || "Award",
            color: badge.color || "#10b981",
            category: (badge.category as "achievement" | "vip" | "special" | "event" | "trust") || "achievement",
            level: badge.level || 1,
            p2pMonthlyLimit: badge.p2pMonthlyLimit ? Number(badge.p2pMonthlyLimit) : null,
            challengeMaxAmount: badge.challengeMaxAmount ? Number(badge.challengeMaxAmount) : null,
            grantsP2pPrivileges: Boolean(badge.grantsP2pPrivileges),
            showOnProfile: Boolean(badge.showOnProfile),
            points: badge.points,
            sortOrder: badge.sortOrder,
            isActive: badge.isActive,
        });
        setEditingBadge(badge);
        setIsDialogOpen(true);
    };

    const closeDialog = () => {
        setIsDialogOpen(false);
        setEditingBadge(null);
        form.reset();
    };

    const handleAssignBadge = () => {
        if (!selectedUserId || !selectedBadgeId) {
            toast({
                title: isArabic ? "بيانات ناقصة" : "Missing data",
                description: isArabic ? "اختر مستخدمًا وشارة أولاً" : "Select a user and badge first",
                variant: "destructive",
            });
            return;
        }

        assignBadgeMutation.mutate({
            userId: selectedUserId,
            badgeId: selectedBadgeId,
            replaceExisting,
        });
    };

    const onSubmit = (data: BadgeFormData) => {
        if (editingBadge) {
            updateMutation.mutate({ id: editingBadge.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    const isPending = createMutation.isPending || updateMutation.isPending;

    const getCategoryLabel = (category: string) => {
        const labels: Record<string, { en: string; ar: string }> = {
            achievement: { en: "Achievement", ar: "إنجاز" },
            vip: { en: "VIP", ar: "VIP" },
            special: { en: "Special", ar: "خاص" },
            event: { en: "Event", ar: "حدث" },
            trust: { en: "Trust", ar: "ثقة" },
        };
        return labels[category]?.[isArabic ? "ar" : "en"] || category;
    };

    const watchedIconUrl = form.watch("iconUrl");
    const watchedIconName = form.watch("iconName") || "Award";

    const existingBadgeNames = new Set((badges || []).map((badge) => badge.name.trim().toLowerCase()));
    const hasAllDefaultTrustBadges = DEFAULT_TRUST_BADGE_NAMES.every((name) => existingBadgeNames.has(name.toLowerCase()));

    const assignableUserOptions = useMemo<SearchableSelectOption[]>(
        () => users.map((user) => ({
            value: user.id,
            label: `${user.nickname || user.username} (${user.username})`,
            keywords: [user.username, user.nickname || "", user.accountId || ""],
        })),
        [users],
    );

    const assignableBadgeOptions = useMemo<SearchableSelectOption[]>(
        () => (badges || [])
            .filter((badge) => badge.isActive)
            .map((badge) => ({
                value: badge.id,
                label: `L${badge.level} - ${isArabic && badge.nameAr ? badge.nameAr : badge.name}`,
                keywords: [badge.name, badge.nameAr || "", String(badge.level)],
            })),
        [badges, isArabic],
    );

    const badgeCategoryOptions = useMemo<SearchableSelectOption[]>(
        () => [
            { value: "achievement", label: isArabic ? "إنجاز" : "Achievement" },
            { value: "vip", label: "VIP" },
            { value: "special", label: isArabic ? "خاص" : "Special" },
            { value: "event", label: isArabic ? "حدث" : "Event" },
            { value: "trust", label: isArabic ? "ثقة" : "Trust" },
        ],
        [isArabic],
    );

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold" data-testid="text-page-title">
                        {isArabic ? "إدارة الشارات" : "Badge Management"}
                    </h1>
                    <p className="text-muted-foreground">
                        {isArabic ? "إدارة شارات الثقة والمكافآت والصلاحيات" : "Manage trust badges, rewards, and entitlement limits"}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {!hasAllDefaultTrustBadges && (
                        <Button
                            variant="outline"
                            onClick={() => initializeBadgesMutation.mutate()}
                            disabled={initializeBadgesMutation.isPending}
                            data-testid="button-initialize-badges"
                        >
                            {initializeBadgesMutation.isPending ? (
                                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Sparkles className="me-2 h-4 w-4" />
                            )}
                            {isArabic ? "تهيئة الشارات" : "Initialize Badges"}
                        </Button>
                    )}

                    <Button onClick={openCreateDialog} data-testid="button-add-badge">
                        <Plus className="me-2 h-4 w-4" />
                        {isArabic ? "إضافة شارة" : "Add Badge"}
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        {isArabic ? "منح الشارة للمستخدم" : "Assign Badge to User"}
                    </CardTitle>
                    <CardDescription>
                        {isArabic
                            ? "عند منح الشارة، يتم تفعيل مستوى الثقة ورفع حدود P2P والتحدي حسب إعدادات الشارة"
                            : "Assigning a badge activates trust level and applies its P2P/challenge limit boosts"}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-2 md:col-span-1">
                            <Label>{isArabic ? "بحث المستخدم" : "Search User"}</Label>
                            <div className="relative">
                                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={userSearch}
                                    onChange={(e) => setUserSearch(e.target.value)}
                                    className="ps-9"
                                    placeholder={isArabic ? "الاسم أو المعرف" : "Username or account ID"}
                                    data-testid="input-user-search"
                                />
                            </div>
                        </div>

                        <div className="space-y-2 md:col-span-1">
                            <Label>{isArabic ? "المستخدم" : "User"}</Label>
                            <SearchableSelect
                                value={selectedUserId}
                                onValueChange={setSelectedUserId}
                                options={assignableUserOptions}
                                placeholder={isArabic ? "اختر مستخدم" : "Select user"}
                                searchPlaceholder={isArabic ? "اكتب للبحث عن المستخدم" : "Type to search user"}
                                emptyText={isArabic ? "لا يوجد مستخدم مطابق" : "No matching user"}
                                triggerTestId="select-assign-user"
                                searchInputTestId="input-search-assign-user"
                            />
                            {usersLoading && <p className="text-xs text-muted-foreground">{isArabic ? "جاري تحميل المستخدمين..." : "Loading users..."}</p>}
                        </div>

                        <div className="space-y-2 md:col-span-1">
                            <Label>{isArabic ? "الشارة" : "Badge"}</Label>
                            <SearchableSelect
                                value={selectedBadgeId}
                                onValueChange={setSelectedBadgeId}
                                options={assignableBadgeOptions}
                                placeholder={isArabic ? "اختر شارة" : "Select badge"}
                                searchPlaceholder={isArabic ? "اكتب للبحث عن الشارة" : "Type to search badge"}
                                emptyText={isArabic ? "لا توجد شارة مطابقة" : "No matching badge"}
                                triggerTestId="select-assign-badge"
                                searchInputTestId="input-search-assign-badge"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                            <Switch
                                checked={replaceExisting}
                                onCheckedChange={setReplaceExisting}
                                data-testid="switch-replace-existing-badges"
                            />
                            <span className="text-sm text-muted-foreground">
                                {isArabic ? "استبدال الشارات الحالية" : "Replace existing badges"}
                            </span>
                        </div>
                        <Button
                            onClick={handleAssignBadge}
                            disabled={assignBadgeMutation.isPending || !selectedUserId || !selectedBadgeId}
                            data-testid="button-assign-badge"
                        >
                            {assignBadgeMutation.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <UserPlus className="me-2 h-4 w-4" />}
                            {isArabic ? "منح الشارة" : "Assign Badge"}
                        </Button>
                    </div>

                    {selectedUserId && (
                        <div className="rounded-lg border p-3">
                            <p className="mb-2 text-sm font-medium">{isArabic ? "الشارات الحالية للمستخدم" : "Current User Badges"}</p>
                            {assignedLoading ? (
                                <Skeleton className="h-12 w-full" />
                            ) : assignedData?.assignedBadges?.length ? (
                                <div className="flex flex-wrap gap-2">
                                    {assignedData.assignedBadges.map((badge) => (
                                        <div key={badge.badgeId} className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1">
                                            <Badge variant="secondary">L{badge.level}</Badge>
                                            <span className="text-sm">{isArabic && badge.nameAr ? badge.nameAr : badge.name}</span>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-6 w-6"
                                                onClick={() => removeAssignedBadgeMutation.mutate({ userId: selectedUserId, badgeId: badge.badgeId })}
                                                disabled={removeAssignedBadgeMutation.isPending}
                                                data-testid={`button-remove-assigned-badge-${badge.badgeId}`}
                                            >
                                                <X className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">{isArabic ? "لا توجد شارات مخصصة لهذا المستخدم" : "No assigned badges for this user"}</p>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {isLoading ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <Skeleton key={i} className="h-56" />
                    ))}
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {badges?.map((badge) => {
                        const CategoryIcon = categoryIcons[badge.category || "achievement"] || Star;
                        return (
                            <Card key={badge.id} data-testid={`card-badge-${badge.id}`}>
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="h-12 w-12 overflow-hidden rounded-full flex items-center justify-center"
                                                style={{ backgroundColor: badge.color || "#10b981" }}
                                            >
                                                {isImagePath(badge.iconUrl) ? (
                                                    <img src={badge.iconUrl} alt={badge.name} className="h-full w-full object-cover" loading="lazy" />
                                                ) : (
                                                    <DynamicIcon name={badge.iconName || "Award"} className="h-6 w-6 text-white" />
                                                )}
                                            </div>
                                            <div>
                                                <CardTitle className="text-base">{isArabic && badge.nameAr ? badge.nameAr : badge.name}</CardTitle>
                                                <div className="mt-1 flex items-center gap-2">
                                                    <Badge variant="outline" className="text-xs">
                                                        <CategoryIcon className="h-3 w-3 me-1" />
                                                        {getCategoryLabel(badge.category || "achievement")}
                                                    </Badge>
                                                    <Badge variant="secondary" className="text-xs">L{badge.level}</Badge>
                                                    <Badge variant={badge.isActive ? "default" : "secondary"} className="text-xs">
                                                        {badge.isActive ? (isArabic ? "نشط" : "Active") : (isArabic ? "غير نشط" : "Inactive")}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-1">
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => openEditDialog(badge)}
                                                data-testid={`button-edit-badge-${badge.id}`}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => setDeleteBadge(badge)}
                                                data-testid={`button-delete-badge-${badge.id}`}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <p className="line-clamp-2 text-sm text-muted-foreground">
                                        {isArabic && badge.descriptionAr ? badge.descriptionAr : badge.description || (isArabic ? "لا يوجد وصف" : "No description")}
                                    </p>
                                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                        <div className="rounded border bg-muted/40 p-2">
                                            <p className="font-medium text-foreground">P2P</p>
                                            <p>{formatLimitValue(badge.p2pMonthlyLimit)}</p>
                                        </div>
                                        <div className="rounded border bg-muted/40 p-2">
                                            <p className="font-medium text-foreground">Challenge</p>
                                            <p>{formatLimitValue(badge.challengeMaxAmount)}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                                            <Star className="h-3 w-3 text-yellow-500" /> {badge.points} {isArabic ? "نقطة" : "points"}
                                        </span>
                                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                                            <Shield className="h-3 w-3" />
                                            {badge.grantsP2pPrivileges
                                                ? (isArabic ? "صلاحيات P2P" : "P2P Privileges")
                                                : (isArabic ? "بدون صلاحيات" : "No privilege boost")}
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                    {!badges?.length && (
                        <Card className="col-span-full">
                            <CardContent className="py-12 text-center text-muted-foreground">
                                <Award className="mx-auto mb-4 h-12 w-12 opacity-50" />
                                <p>{isArabic ? "لا توجد شارات" : "No badges found"}</p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {editingBadge
                                ? (isArabic ? "تعديل الشارة" : "Edit Badge")
                                : (isArabic ? "إضافة شارة جديدة" : "Add New Badge")}
                        </DialogTitle>
                    </DialogHeader>

                    <input
                        ref={iconFileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (!file) return;

                            if (!file.type.startsWith("image/")) {
                                toast({
                                    title: isArabic ? "ملف غير صالح" : "Invalid file",
                                    description: isArabic ? "الرجاء اختيار صورة" : "Please choose an image file",
                                    variant: "destructive",
                                });
                                return;
                            }

                            uploadIconMutation.mutate(file);
                        }}
                    />

                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{isArabic ? "الاسم (إنجليزي)" : "Name (English)"}</FormLabel>
                                            <FormControl>
                                                <Input {...field} data-testid="input-badge-name" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="nameAr"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{isArabic ? "الاسم (عربي)" : "Name (Arabic)"}</FormLabel>
                                            <FormControl>
                                                <Input {...field} dir="rtl" data-testid="input-badge-name-ar" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{isArabic ? "الوصف (إنجليزي)" : "Description (English)"}</FormLabel>
                                        <FormControl>
                                            <Textarea {...field} rows={2} data-testid="input-badge-description" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="descriptionAr"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{isArabic ? "الوصف (عربي)" : "Description (Arabic)"}</FormLabel>
                                        <FormControl>
                                            <Textarea {...field} rows={2} dir="rtl" data-testid="input-badge-description-ar" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="rounded-lg border p-3">
                                <div className="mb-3 flex items-center justify-between">
                                    <Label>{isArabic ? "أيقونة الشارة" : "Badge Icon"}</Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => iconFileInputRef.current?.click()}
                                        disabled={uploadIconMutation.isPending}
                                        data-testid="button-upload-badge-icon"
                                    >
                                        {uploadIconMutation.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Upload className="me-2 h-4 w-4" />}
                                        {isArabic ? "رفع من الجهاز" : "Upload from device"}
                                    </Button>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div
                                        className="h-14 w-14 overflow-hidden rounded-full flex items-center justify-center"
                                        style={{ backgroundColor: form.watch("color") || "#10b981" }}
                                    >
                                        {isImagePath(watchedIconUrl) ? (
                                            <img src={watchedIconUrl} alt="badge" className="h-full w-full object-cover" loading="lazy" />
                                        ) : (
                                            <DynamicIcon name={watchedIconName} className="h-7 w-7 text-white" />
                                        )}
                                    </div>

                                    <div className="flex-1 space-y-2">
                                        <FormField
                                            control={form.control}
                                            name="iconName"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs">{isArabic ? "أيقونة احتياطية (Lucide)" : "Fallback Icon Name (Lucide)"}</FormLabel>
                                                    <FormControl>
                                                        <Input {...field} placeholder="Award, ShieldCheck, Crown..." data-testid="input-badge-icon-name" />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="iconUrl"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs">{isArabic ? "رابط الأيقونة المرفوعة" : "Uploaded Icon URL"}</FormLabel>
                                                    <FormControl>
                                                        <Input {...field} readOnly data-testid="input-badge-icon-url" />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="color"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{isArabic ? "اللون" : "Color"}</FormLabel>
                                            <FormControl>
                                                <div className="flex gap-2">
                                                    <Input {...field} placeholder="#10b981" data-testid="input-badge-color" />
                                                    <input
                                                        type="color"
                                                        value={field.value || "#10b981"}
                                                        onChange={(e) => field.onChange(e.target.value)}
                                                        className="h-10 w-10 cursor-pointer rounded border"
                                                    />
                                                </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="category"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{isArabic ? "الفئة" : "Category"}</FormLabel>
                                            <FormControl>
                                                <SearchableSelect
                                                    value={field.value}
                                                    onValueChange={field.onChange}
                                                    options={badgeCategoryOptions}
                                                    placeholder={isArabic ? "اختر الفئة" : "Select category"}
                                                    searchPlaceholder={isArabic ? "اكتب للبحث عن الفئة" : "Type to search category"}
                                                    emptyText={isArabic ? "لا توجد فئة مطابقة" : "No matching category"}
                                                    triggerTestId="select-badge-category"
                                                    searchInputTestId="input-search-badge-category"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <FormField
                                    control={form.control}
                                    name="level"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{isArabic ? "المستوى" : "Level"}</FormLabel>
                                            <FormControl>
                                                <Input {...field} type="number" min={1} data-testid="input-badge-level" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="points"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{isArabic ? "النقاط" : "Points"}</FormLabel>
                                            <FormControl>
                                                <Input {...field} type="number" min={0} data-testid="input-badge-points" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="sortOrder"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{isArabic ? "ترتيب العرض" : "Sort Order"}</FormLabel>
                                            <FormControl>
                                                <Input {...field} type="number" min={0} data-testid="input-badge-sort-order" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="p2pMonthlyLimit"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{isArabic ? "حد تداول P2P الشهري" : "P2P Monthly Limit"}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    value={field.value ?? ""}
                                                    onChange={(event) => field.onChange(event.target.value)}
                                                    placeholder={isArabic ? "فارغ = بدون تغيير" : "Empty = no badge limit"}
                                                    data-testid="input-badge-p2p-limit"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="challengeMaxAmount"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{isArabic ? "أقصى مبلغ للتحدي" : "Challenge Max Amount"}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    value={field.value ?? ""}
                                                    onChange={(event) => field.onChange(event.target.value)}
                                                    placeholder={isArabic ? "فارغ = بدون تغيير" : "Empty = no badge limit"}
                                                    data-testid="input-badge-challenge-limit"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-3">
                                <FormField
                                    control={form.control}
                                    name="grantsP2pPrivileges"
                                    render={({ field }) => (
                                        <FormItem className="flex items-center justify-between">
                                            <FormLabel className="!mt-0 text-sm">{isArabic ? "تمنح صلاحيات P2P" : "Grant P2P Privileges"}</FormLabel>
                                            <FormControl>
                                                <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-badge-p2p-privileges" />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="showOnProfile"
                                    render={({ field }) => (
                                        <FormItem className="flex items-center justify-between">
                                            <FormLabel className="!mt-0 text-sm">{isArabic ? "تظهر في البروفايل" : "Show on Profile"}</FormLabel>
                                            <FormControl>
                                                <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-badge-show-profile" />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="isActive"
                                    render={({ field }) => (
                                        <FormItem className="flex items-center justify-between">
                                            <FormLabel className="!mt-0 text-sm">{isArabic ? "نشط" : "Active"}</FormLabel>
                                            <FormControl>
                                                <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-badge-active" />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={closeDialog}>
                                    {isArabic ? "إلغاء" : "Cancel"}
                                </Button>
                                <Button type="submit" disabled={isPending} data-testid="button-save-badge">
                                    {isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                                    {editingBadge ? (isArabic ? "تحديث" : "Update") : (isArabic ? "إضافة" : "Add")}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={!!deleteBadge}
                title={isArabic ? "تأكيد الحذف" : "Confirm Deletion"}
                description={
                    isArabic
                        ? `هل أنت متأكد من حذف الشارة "${deleteBadge?.name}"؟ لا يمكن التراجع عن هذا الإجراء.`
                        : `Are you sure you want to delete the badge "${deleteBadge?.name}"? This action cannot be undone.`
                }
                variant="destructive"
                confirmLabel={isArabic ? "حذف" : "Delete"}
                cancelLabel={isArabic ? "إلغاء" : "Cancel"}
                loading={deleteMutation.isPending}
                onConfirm={() => deleteBadge && deleteMutation.mutate(deleteBadge.id)}
                onCancel={() => setDeleteBadge(null)}
            />
        </div>
    );
}
