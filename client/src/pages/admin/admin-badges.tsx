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

const SURFACE_CARD_CLASS = "rounded-[24px] border border-slate-200/80 bg-gradient-to-b from-white via-slate-50 to-slate-100/70 shadow-[0_14px_40px_-24px_rgba(15,23,42,0.55)] dark:border-slate-800/80 dark:from-slate-900 dark:via-slate-950 dark:to-slate-950";
const STAT_CARD_CLASS = "rounded-[22px] border border-slate-200/80 bg-white/80 p-4 shadow-[0_12px_30px_-22px_rgba(15,23,42,0.4)] dark:border-slate-800 dark:bg-slate-900/70";
const BADGE_CARD_CLASS = "rounded-[22px] border border-slate-200/80 bg-white/85 shadow-[0_14px_34px_-24px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-900/70";
const BUTTON_3D_CLASS = "rounded-xl border border-slate-300/80 bg-gradient-to-b from-white to-slate-100 text-slate-900 shadow-[0_8px_0_0_rgba(148,163,184,0.5)] transition active:translate-y-[1px] active:shadow-[0_5px_0_0_rgba(148,163,184,0.45)] hover:brightness-105 dark:border-slate-700 dark:from-slate-800 dark:to-slate-900 dark:text-slate-100 dark:shadow-[0_8px_0_0_rgba(15,23,42,0.82)]";
const BUTTON_3D_PRIMARY_CLASS = "rounded-xl border border-sky-600 bg-gradient-to-b from-sky-400 via-sky-500 to-sky-700 text-white shadow-[0_8px_0_0_rgba(3,105,161,0.58)] transition active:translate-y-[1px] active:shadow-[0_5px_0_0_rgba(3,105,161,0.52)] hover:brightness-105";
const BUTTON_3D_DANGER_CLASS = "rounded-xl border border-rose-700 bg-gradient-to-b from-rose-400 via-rose-500 to-rose-700 text-white shadow-[0_8px_0_0_rgba(159,18,57,0.48)] transition active:translate-y-[1px] active:shadow-[0_5px_0_0_rgba(159,18,57,0.44)] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none";
const INPUT_SURFACE_CLASS = "min-h-[46px] rounded-xl border-slate-200/80 bg-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_10px_24px_-20px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900";
const TEXTAREA_SURFACE_CLASS = "min-h-[96px] rounded-xl border-slate-200/80 bg-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_10px_24px_-20px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900";
const TOGGLE_ROW_CLASS = "flex items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/75 p-4 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-900/60";
const DIALOG_SURFACE_CLASS = "max-h-[92vh] max-w-3xl overflow-y-auto rounded-[28px] border border-slate-200/80 bg-gradient-to-b from-white via-slate-50 to-slate-100 p-0 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.6)] dark:border-slate-800/80 dark:from-slate-900 dark:via-slate-950 dark:to-slate-950";

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
    const sortedBadges = [...(badges || [])].sort((left, right) => {
        if (left.isActive !== right.isActive) return Number(right.isActive) - Number(left.isActive);
        if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
        if (left.level !== right.level) return left.level - right.level;
        return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    });
    const activeBadgesCount = sortedBadges.filter((badge) => badge.isActive).length;
    const trustBadgesCount = sortedBadges.filter((badge) => badge.category === "trust").length;
    const privilegeBadgesCount = sortedBadges.filter((badge) => badge.grantsP2pPrivileges).length;
    const selectedAssignedBadges = assignedData?.assignedBadges || [];

    const assignableUserOptions = useMemo<SearchableSelectOption[]>(
        () => users.map((user) => ({
            value: user.id,
            label: `${user.nickname || user.username} (${user.username})`,
            keywords: [user.username, user.nickname || "", user.accountId || ""],
        })),
        [users],
    );

    const assignableBadgeOptions = useMemo<SearchableSelectOption[]>(
        () => sortedBadges
            .filter((badge) => badge.isActive)
            .map((badge) => ({
                value: badge.id,
                label: `L${badge.level} - ${isArabic && badge.nameAr ? badge.nameAr : badge.name}`,
                keywords: [badge.name, badge.nameAr || "", String(badge.level)],
            })),
        [sortedBadges, isArabic],
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
        <div className="space-y-5 p-3 sm:p-4 md:p-6">
            <div className={`${SURFACE_CARD_CLASS} px-5 py-5 sm:px-6 sm:py-6`}>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex items-start gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-b from-sky-400 to-sky-700 text-white shadow-[0_10px_0_0_rgba(3,105,161,0.45)]">
                            <Award className="h-7 w-7" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl" data-testid="text-page-title">
                                {isArabic ? "إدارة الشارات" : "Badge Management"}
                            </h1>
                            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                                {isArabic ? "إدارة شارات الثقة والمكافآت والصلاحيات" : "Manage trust badges, rewards, and entitlement limits"}
                            </p>
                        </div>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                        {!hasAllDefaultTrustBadges && (
                            <Button
                                className={`${BUTTON_3D_CLASS} w-full sm:w-auto`}
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

                        <Button className={`${BUTTON_3D_PRIMARY_CLASS} w-full sm:w-auto`} onClick={openCreateDialog} data-testid="button-add-badge">
                            <Plus className="me-2 h-4 w-4" />
                            {isArabic ? "إضافة شارة" : "Add Badge"}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Card className={STAT_CARD_CLASS}>
                    <CardContent className="flex items-center gap-4 p-4">
                        <div className="rounded-2xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                            <Award className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                                {isArabic ? "الشارات" : "Badges"}
                            </p>
                            <p className="mt-1 text-2xl font-bold">{sortedBadges.length}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className={STAT_CARD_CLASS}>
                    <CardContent className="flex items-center gap-4 p-4">
                        <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                            <Shield className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                                {isArabic ? "نشط" : "Active"}
                            </p>
                            <p className="mt-1 text-2xl font-bold">{activeBadgesCount}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className={STAT_CARD_CLASS}>
                    <CardContent className="flex items-center gap-4 p-4">
                        <div className="rounded-2xl bg-violet-100 p-3 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                            <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                                {isArabic ? "ثقة" : "Trust"}
                            </p>
                            <p className="mt-1 text-2xl font-bold">{trustBadgesCount}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className={STAT_CARD_CLASS}>
                    <CardContent className="flex items-center gap-4 p-4">
                        <div className="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                            <Users className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                                {isArabic ? "صلاحيات P2P" : "P2P Privileges"}
                            </p>
                            <p className="mt-1 text-2xl font-bold">{privilegeBadgesCount}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className={SURFACE_CARD_CLASS}>
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
                    <div className="grid gap-4 xl:grid-cols-3">
                        <div className="space-y-2 xl:col-span-1">
                            <Label>{isArabic ? "بحث المستخدم" : "Search User"}</Label>
                            <div className="relative">
                                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={userSearch}
                                    onChange={(e) => setUserSearch(e.target.value)}
                                    className={`${INPUT_SURFACE_CLASS} ps-9`}
                                    placeholder={isArabic ? "الاسم أو المعرف" : "Username or account ID"}
                                    data-testid="input-user-search"
                                />
                            </div>
                        </div>

                        <div className="space-y-2 xl:col-span-1">
                            <Label>{isArabic ? "المستخدم" : "User"}</Label>
                            <SearchableSelect
                                value={selectedUserId}
                                onValueChange={setSelectedUserId}
                                options={assignableUserOptions}
                                placeholder={isArabic ? "اختر مستخدم" : "Select user"}
                                searchPlaceholder={isArabic ? "اكتب للبحث عن المستخدم" : "Type to search user"}
                                emptyText={isArabic ? "لا يوجد مستخدم مطابق" : "No matching user"}
                                className={INPUT_SURFACE_CLASS}
                                triggerTestId="select-assign-user"
                                searchInputTestId="input-search-assign-user"
                            />
                            {usersLoading && <p className="text-xs text-muted-foreground">{isArabic ? "جاري تحميل المستخدمين..." : "Loading users..."}</p>}
                        </div>

                        <div className="space-y-2 xl:col-span-1">
                            <Label>{isArabic ? "الشارة" : "Badge"}</Label>
                            <SearchableSelect
                                value={selectedBadgeId}
                                onValueChange={setSelectedBadgeId}
                                options={assignableBadgeOptions}
                                placeholder={isArabic ? "اختر شارة" : "Select badge"}
                                searchPlaceholder={isArabic ? "اكتب للبحث عن الشارة" : "Type to search badge"}
                                emptyText={isArabic ? "لا توجد شارة مطابقة" : "No matching badge"}
                                className={INPUT_SURFACE_CLASS}
                                triggerTestId="select-assign-badge"
                                searchInputTestId="input-search-assign-badge"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div className={`${TOGGLE_ROW_CLASS} w-full xl:w-auto xl:min-w-[320px]`}>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold">{isArabic ? "استبدال الشارات الحالية" : "Replace existing badges"}</p>
                                <p className="text-xs text-muted-foreground">
                                    {isArabic ? "استبدال الشارات الممنوحة للمستخدم الحالي بالشارة الجديدة" : "Replace the selected user's current badges with the new one"}
                                </p>
                            </div>
                            <Switch
                                checked={replaceExisting}
                                onCheckedChange={setReplaceExisting}
                                data-testid="switch-replace-existing-badges"
                            />
                        </div>
                        <Button
                            className={`${BUTTON_3D_PRIMARY_CLASS} w-full xl:w-auto`}
                            onClick={handleAssignBadge}
                            disabled={assignBadgeMutation.isPending || !selectedUserId || !selectedBadgeId}
                            data-testid="button-assign-badge"
                        >
                            {assignBadgeMutation.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <UserPlus className="me-2 h-4 w-4" />}
                            {isArabic ? "منح الشارة" : "Assign Badge"}
                        </Button>
                    </div>

                    {selectedUserId && (
                        <div className="rounded-[22px] border border-slate-200/80 bg-white/75 p-4 shadow-[0_12px_28px_-22px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-900/60">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold">{isArabic ? "الشارات الحالية للمستخدم" : "Current User Badges"}</p>
                                <Badge variant="outline" className="rounded-full px-3 py-1">{selectedAssignedBadges.length}</Badge>
                            </div>
                            {assignedLoading ? (
                                <Skeleton className="h-12 w-full" />
                            ) : selectedAssignedBadges.length ? (
                                <div className="flex flex-wrap gap-2">
                                    {selectedAssignedBadges.map((badge) => (
                                        <div key={badge.badgeId} className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/90 px-3 py-2 shadow-[0_8px_18px_-18px_rgba(15,23,42,0.4)] dark:border-slate-700 dark:bg-slate-900">
                                            <Badge variant="secondary">L{badge.level}</Badge>
                                            <span className="text-sm font-medium">{isArabic && badge.nameAr ? badge.nameAr : badge.name}</span>
                                            <Button
                                                size="icon"
                                                className={`${BUTTON_3D_DANGER_CLASS} h-7 w-7 rounded-full shadow-none`}
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
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className={`${BADGE_CARD_CLASS} p-5`}>
                            <Skeleton className="h-12 w-12 rounded-full" />
                            <Skeleton className="mt-4 h-5 w-40" />
                            <Skeleton className="mt-3 h-4 w-full" />
                            <Skeleton className="mt-2 h-4 w-3/4" />
                            <Skeleton className="mt-4 h-20 w-full rounded-2xl" />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {sortedBadges.map((badge) => {
                        const CategoryIcon = categoryIcons[badge.category || "achievement"] || Star;
                        return (
                            <Card key={badge.id} className={BADGE_CARD_CLASS} data-testid={`card-badge-${badge.id}`}>
                                <CardHeader className="pb-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <div
                                                className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full shadow-[0_10px_24px_-18px_rgba(15,23,42,0.55)]"
                                                style={{ backgroundColor: badge.color || "#10b981" }}
                                            >
                                                {isImagePath(badge.iconUrl) ? (
                                                    <img src={badge.iconUrl} alt={badge.name} className="h-full w-full object-cover" loading="lazy" />
                                                ) : (
                                                    <DynamicIcon name={badge.iconName || "Award"} className="h-7 w-7 text-white" />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <CardTitle className="truncate text-base">{isArabic && badge.nameAr ? badge.nameAr : badge.name}</CardTitle>
                                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                                    <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                                                        <CategoryIcon className="me-1 h-3 w-3" />
                                                        {getCategoryLabel(badge.category || "achievement")}
                                                    </Badge>
                                                    <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">L{badge.level}</Badge>
                                                    <Badge className={`rounded-full border-none px-3 py-1 text-xs text-white ${badge.isActive ? "bg-emerald-600" : "bg-slate-500"}`}>
                                                        {badge.isActive ? (isArabic ? "نشط" : "Active") : (isArabic ? "غير نشط" : "Inactive")}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                size="icon"
                                                className={`${BUTTON_3D_CLASS} h-10 w-10`}
                                                onClick={() => openEditDialog(badge)}
                                                data-testid={`button-edit-badge-${badge.id}`}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="icon"
                                                className={`${BUTTON_3D_DANGER_CLASS} h-10 w-10`}
                                                onClick={() => setDeleteBadge(badge)}
                                                data-testid={`button-delete-badge-${badge.id}`}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <p className="line-clamp-2 min-h-[40px] text-sm text-muted-foreground">
                                        {isArabic && badge.descriptionAr ? badge.descriptionAr : badge.description || (isArabic ? "لا يوجد وصف" : "No description")}
                                    </p>
                                    <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                                        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                                            <p className="font-medium text-foreground">P2P</p>
                                            <p className="mt-1">{formatLimitValue(badge.p2pMonthlyLimit)}</p>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                                            <p className="font-medium text-foreground">Challenge</p>
                                            <p className="mt-1">{formatLimitValue(badge.challengeMaxAmount)}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
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
                    {!sortedBadges.length && (
                        <Card className={`${BADGE_CARD_CLASS} col-span-full`}>
                            <CardContent className="py-12 text-center text-muted-foreground">
                                <Award className="mx-auto mb-4 h-12 w-12 opacity-50" />
                                <p>{isArabic ? "لا توجد شارات" : "No badges found"}</p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            <Dialog
                open={isDialogOpen}
                onOpenChange={(open) => {
                    if (!open) {
                        closeDialog();
                        return;
                    }
                    setIsDialogOpen(true);
                }}
            >
                <DialogContent className={DIALOG_SURFACE_CLASS}>
                    <div className="p-5 sm:p-6">
                        <DialogHeader className="space-y-3">
                            <div className="flex items-start gap-4">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-b from-sky-400 to-sky-700 text-white shadow-[0_8px_0_0_rgba(3,105,161,0.42)]">
                                    <Award className="h-5 w-5" />
                                </div>
                                <div>
                                    <DialogTitle className="text-xl font-bold">
                                        {editingBadge
                                            ? (isArabic ? "تعديل الشارة" : "Edit Badge")
                                            : (isArabic ? "إضافة شارة جديدة" : "Add New Badge")}
                                    </DialogTitle>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {isArabic ? "تكوين هوية الشارة وحدودها وصلاحياتها" : "Configure badge identity, limits, and entitlement behavior"}
                                    </p>
                                </div>
                            </div>
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
                            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-5">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <FormField
                                        control={form.control}
                                        name="name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{isArabic ? "الاسم (إنجليزي)" : "Name (English)"}</FormLabel>
                                                <FormControl>
                                                    <Input {...field} className={INPUT_SURFACE_CLASS} data-testid="input-badge-name" />
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
                                                    <Input {...field} className={INPUT_SURFACE_CLASS} dir="rtl" data-testid="input-badge-name-ar" />
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
                                                <Textarea {...field} className={TEXTAREA_SURFACE_CLASS} rows={3} data-testid="input-badge-description" />
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
                                                <Textarea {...field} className={TEXTAREA_SURFACE_CLASS} rows={3} dir="rtl" data-testid="input-badge-description-ar" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <div className="rounded-[22px] border border-slate-200/80 bg-white/75 p-4 shadow-[0_12px_28px_-22px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-900/60">
                                    <div className="mb-3 flex items-center justify-between">
                                        <Label>{isArabic ? "أيقونة الشارة" : "Badge Icon"}</Label>
                                        <Button
                                            type="button"
                                            className={BUTTON_3D_CLASS}
                                            size="sm"
                                            onClick={() => iconFileInputRef.current?.click()}
                                            disabled={uploadIconMutation.isPending}
                                            data-testid="button-upload-badge-icon"
                                        >
                                            {uploadIconMutation.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Upload className="me-2 h-4 w-4" />}
                                            {isArabic ? "رفع من الجهاز" : "Upload from device"}
                                        </Button>
                                    </div>

                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                                        <div
                                            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full shadow-[0_10px_24px_-18px_rgba(15,23,42,0.55)]"
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
                                                            <Input {...field} className={INPUT_SURFACE_CLASS} placeholder="Award, ShieldCheck, Crown..." data-testid="input-badge-icon-name" />
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
                                                            <Input {...field} className={INPUT_SURFACE_CLASS} readOnly data-testid="input-badge-icon-url" />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <FormField
                                        control={form.control}
                                        name="color"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{isArabic ? "اللون" : "Color"}</FormLabel>
                                                <FormControl>
                                                    <div className="flex gap-2">
                                                        <Input {...field} className={INPUT_SURFACE_CLASS} placeholder="#10b981" data-testid="input-badge-color" />
                                                        <input
                                                            type="color"
                                                            value={field.value || "#10b981"}
                                                            onChange={(e) => field.onChange(e.target.value)}
                                                            className="h-11 w-11 shrink-0 cursor-pointer rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900"
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
                                                        className={INPUT_SURFACE_CLASS}
                                                        triggerTestId="select-badge-category"
                                                        searchInputTestId="input-search-badge-category"
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className="grid gap-4 sm:grid-cols-3">
                                    <FormField
                                        control={form.control}
                                        name="level"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{isArabic ? "المستوى" : "Level"}</FormLabel>
                                                <FormControl>
                                                    <Input {...field} className={INPUT_SURFACE_CLASS} type="number" min={1} data-testid="input-badge-level" />
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
                                                    <Input {...field} className={INPUT_SURFACE_CLASS} type="number" min={0} data-testid="input-badge-points" />
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
                                                    <Input {...field} className={INPUT_SURFACE_CLASS} type="number" min={0} data-testid="input-badge-sort-order" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <FormField
                                        control={form.control}
                                        name="p2pMonthlyLimit"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{isArabic ? "حد تداول P2P الشهري" : "P2P Monthly Limit"}</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        className={INPUT_SURFACE_CLASS}
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
                                                        className={INPUT_SURFACE_CLASS}
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

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                    <FormField
                                        control={form.control}
                                        name="grantsP2pPrivileges"
                                        render={({ field }) => (
                                            <FormItem className={TOGGLE_ROW_CLASS}>
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
                                            <FormItem className={TOGGLE_ROW_CLASS}>
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
                                            <FormItem className={TOGGLE_ROW_CLASS}>
                                                <FormLabel className="!mt-0 text-sm">{isArabic ? "نشط" : "Active"}</FormLabel>
                                                <FormControl>
                                                    <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-badge-active" />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <DialogFooter className="flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                                    <Button className={`${BUTTON_3D_CLASS} w-full sm:w-auto`} type="button" onClick={closeDialog}>
                                        {isArabic ? "إلغاء" : "Cancel"}
                                    </Button>
                                    <Button className={`${BUTTON_3D_PRIMARY_CLASS} w-full sm:w-auto`} type="submit" disabled={isPending} data-testid="button-save-badge">
                                        {isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                                        {editingBadge ? (isArabic ? "تحديث" : "Update") : (isArabic ? "إضافة" : "Add")}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    </div>
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
