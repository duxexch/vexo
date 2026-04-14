import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  RefreshCw,
  Loader2,
  DollarSign,
  Swords,
  Ban,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const adminToken = () => localStorage.getItem("adminToken") || "";

const SURFACE_CARD_CLASS = "rounded-[28px] border border-slate-200/70 bg-white/95 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/90";
const STAT_CARD_CLASS = `${SURFACE_CARD_CLASS} overflow-hidden`;
const DATA_CARD_CLASS = `${SURFACE_CARD_CLASS} overflow-hidden`;
const BUTTON_3D_CLASS = "rounded-2xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 shadow-[0_8px_0_0_rgba(226,232,240,0.95)] transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(226,232,240,0.95)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:shadow-[0_8px_0_0_rgba(15,23,42,0.95)]";
const BUTTON_3D_PRIMARY_CLASS = "rounded-2xl border border-sky-500 bg-sky-500 px-4 py-2 font-semibold text-white shadow-[0_8px_0_0_rgba(3,105,161,0.45)] transition-transform duration-150 hover:-translate-y-0.5 hover:bg-sky-400 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(3,105,161,0.45)]";
const BUTTON_3D_DESTRUCTIVE_CLASS = "rounded-2xl border border-red-500 bg-red-500 px-4 py-2 font-semibold text-white shadow-[0_8px_0_0_rgba(185,28,28,0.35)] transition-transform duration-150 hover:-translate-y-0.5 hover:bg-red-400 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(185,28,28,0.35)]";
const INPUT_SURFACE_CLASS = "h-12 rounded-2xl border-slate-200 bg-white/90 shadow-none focus-visible:ring-2 focus-visible:ring-sky-200 dark:border-slate-700 dark:bg-slate-900/80 dark:focus-visible:ring-sky-900";
const ALERT_DIALOG_SURFACE_CLASS = "rounded-[28px] border border-slate-200/80 bg-white/98 p-0 shadow-[0_24px_80px_-28px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-950/98";

interface Challenge {
  id: string;
  gameType: string;
  betAmount: string;
  status: string;
  player1Id: string;
  player2Id: string | null;
  player1Name: string;
  player2Name: string | null;
  visibility: string;
  currencyType: string;
  createdAt: string;
  updatedAt: string;
}

interface ChallengesResponse {
  challenges: Challenge[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ChallengeStats {
  total: number;
  waiting: number;
  active: number;
  completed: number;
  cancelled: number;
  totalCommission: number;
  totalVolume: number;
  todayChallenges: number;
  todayCommission: number;
}

export default function AdminChallengesPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [gameTypeFilter, setGameTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading } = useQuery<ChallengeStats>({
    queryKey: ["/api/admin/challenge-stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/challenge-stats", {
        headers: { "x-admin-token": adminToken() },
      });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const { data, isLoading } = useQuery<ChallengesResponse>({
    queryKey: ["/api/admin/challenges", statusFilter, gameTypeFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        status: statusFilter,
        gameType: gameTypeFilter,
        page: page.toString(),
        limit: "20",
      });
      const res = await fetch(`/api/admin/challenges?${params}`, {
        headers: { "x-admin-token": adminToken() },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (challengeId: string) => {
      const res = await fetch(`/api/admin/challenges/${challengeId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken(),
        },
        body: JSON.stringify({ reason: "Admin force-cancel" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to cancel");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/challenges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/challenge-stats"] });
      toast({ title: "تم الإلغاء", description: "تم إلغاء التحدي واسترداد المبالغ" });
      setCancellingId(null);
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const gameTypeNames: Record<string, string> = {
    chess: "شطرنج",
    backgammon: "طاولة",
    domino: "دومينو",
    tarneeb: "طرنيب",
    baloot: "بلوت",
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "waiting":
        return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20"><Clock className="h-3 w-3 ml-1" />منتظر</Badge>;
      case "active":
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20"><Swords className="h-3 w-3 ml-1" />نشط</Badge>;
      case "completed":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle2 className="h-3 w-3 ml-1" />مكتمل</Badge>;
      case "cancelled":
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20"><XCircle className="h-3 w-3 ml-1" />ملغي</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("ar-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const visibilityBadge = (visibility: string) => (
    <Badge variant="outline" className="text-[10px]">
      {visibility === "private" ? "🔒 خاص" : "🌍 عام"}
    </Badge>
  );

  const currencyBadge = (currencyType: string) => (
    <Badge variant="outline" className="text-[10px]">
      {currencyType === "project" ? "VEX" : "USD"}
    </Badge>
  );

  const challenges = data?.challenges || [];

  if (isLoading && statsLoading) {
    return (
      <div className="space-y-5 p-3 sm:p-4 md:p-6">
        <div className={`${SURFACE_CARD_CLASS} p-6`}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} className="rounded-[24px] border border-slate-200/70 p-5 dark:border-slate-800">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="mt-4 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-2/3" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-3 sm:p-4 md:p-6" dir="rtl">
      <div className={`${SURFACE_CARD_CLASS} px-5 py-5 sm:px-6 sm:py-6`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-b from-sky-400 to-sky-700 text-white shadow-[0_10px_0_0_rgba(3,105,161,0.45)]">
              <Swords className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">إدارة التحديات</h1>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                مراقبة وإدارة جميع التحديات المالية
              </p>
            </div>
          </div>
          <Button
            className={BUTTON_3D_CLASS}
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/admin/challenges"] });
              queryClient.invalidateQueries({ queryKey: ["/api/admin/challenge-stats"] });
            }}
          >
            <RefreshCw className="h-4 w-4 ml-1" />
            تحديث
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
              <Swords className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats?.total || 0}</div>
              <div className="text-xs text-muted-foreground">إجمالي التحديات</div>
            </div>
          </CardContent>
        </Card>
        <Card className={`${STAT_CARD_CLASS} border-yellow-500/20`}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-yellow-100 p-3 text-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-300">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">{stats?.waiting || 0}</div>
              <div className="text-xs text-muted-foreground">منتظرة</div>
            </div>
          </CardContent>
        </Card>
        <Card className={`${STAT_CARD_CLASS} border-blue-500/20`}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-blue-100 p-3 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">{stats?.active || 0}</div>
              <div className="text-xs text-muted-foreground">نشطة</div>
            </div>
          </CardContent>
        </Card>
        <Card className={`${STAT_CARD_CLASS} border-green-500/20`}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-green-100 p-3 text-green-700 dark:bg-green-950/60 dark:text-green-300">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">${stats?.totalCommission?.toFixed(2) || "0.00"}</div>
              <div className="text-xs text-muted-foreground">إجمالي العمولة</div>
            </div>
          </CardContent>
        </Card>
        <Card className={`${STAT_CARD_CLASS} border-purple-500/20`}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-violet-100 p-3 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">${stats?.totalVolume?.toFixed(2) || "0.00"}</div>
              <div className="text-xs text-muted-foreground">حجم الرهانات</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today Stats */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card className={`${DATA_CARD_CLASS} bg-gradient-to-r from-green-500/5 to-transparent`}>
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-green-500" />
            <div>
              <div className="text-lg font-bold">{stats?.todayChallenges || 0} تحدي</div>
              <div className="text-xs text-muted-foreground">تحديات اليوم</div>
            </div>
          </CardContent>
        </Card>
        <Card className={`${DATA_CARD_CLASS} bg-gradient-to-r from-blue-500/5 to-transparent`}>
          <CardContent className="p-4 flex items-center gap-3">
            <DollarSign className="h-8 w-8 text-blue-500" />
            <div>
              <div className="text-lg font-bold">${stats?.todayCommission?.toFixed(2) || '0.00'}</div>
              <div className="text-xs text-muted-foreground">عمولة اليوم</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className={DATA_CARD_CLASS}>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle className="text-lg">قائمة التحديات</CardTitle>
              <CardDescription className="mt-1">مراجعة الحالات، الرهانات، والأطراف مع إمكانية الإلغاء الإداري عند الحاجة.</CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className={`${INPUT_SURFACE_CLASS} w-full sm:w-[160px]`}>
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="waiting">منتظر</SelectItem>
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="completed">مكتمل</SelectItem>
                  <SelectItem value="cancelled">ملغي</SelectItem>
                </SelectContent>
              </Select>
              <Select value={gameTypeFilter} onValueChange={(v) => { setGameTypeFilter(v); setPage(1); }}>
                <SelectTrigger className={`${INPUT_SURFACE_CLASS} w-full sm:w-[160px]`}>
                  <SelectValue placeholder="اللعبة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="chess">شطرنج</SelectItem>
                  <SelectItem value="backgammon">طاولة</SelectItem>
                  <SelectItem value="domino">دومينو</SelectItem>
                  <SelectItem value="tarneeb">طرنيب</SelectItem>
                  <SelectItem value="baloot">بلوت</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:hidden">
            {challenges.length > 0 ? (
              challenges.map((challenge) => (
                <div key={challenge.id} className="rounded-[24px] border border-slate-200/80 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold">{gameTypeNames[challenge.gameType] || challenge.gameType}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {statusBadge(challenge.status)}
                        {visibilityBadge(challenge.visibility)}
                        {currencyBadge(challenge.currencyType)}
                      </div>
                    </div>
                    {(challenge.status === "waiting" || challenge.status === "active") && (
                      <Button
                        className={`${BUTTON_3D_DESTRUCTIVE_CLASS} h-10 w-10 p-0`}
                        onClick={() => setCancellingId(challenge.id)}
                      >
                        <Ban className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                      <p className="text-xs text-muted-foreground">الأطراف</p>
                      <p className="mt-2 text-sm font-semibold">{challenge.player1Name}</p>
                      <p className="text-sm text-muted-foreground">{challenge.player2Name || "—"}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                      <p className="text-xs text-muted-foreground">المبلغ</p>
                      <p className="mt-2 text-sm font-semibold">${parseFloat(challenge.betAmount).toFixed(2)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                      <p className="text-xs text-muted-foreground">أنشئ في</p>
                      <p className="mt-2 text-sm font-semibold">{formatDate(challenge.createdAt)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                      <p className="text-xs text-muted-foreground">المعرف</p>
                      <p className="mt-2 break-all text-sm font-semibold">{challenge.id}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-300 p-6 text-center text-sm text-muted-foreground dark:border-slate-700">
                لا توجد تحديات مطابقة للفلتر
              </div>
            )}
          </div>

          <div className="hidden lg:block overflow-x-auto rounded-[24px] border border-slate-200/80 dark:border-slate-800">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">اللعبة</TableHead>
                  <TableHead className="text-right">اللاعب 1</TableHead>
                  <TableHead className="text-right">اللاعب 2</TableHead>
                  <TableHead className="text-center">المبلغ</TableHead>
                  <TableHead className="text-center">العملة</TableHead>
                  <TableHead className="text-center">الحالة</TableHead>
                  <TableHead className="text-center">الرؤية</TableHead>
                  <TableHead className="text-center">التاريخ</TableHead>
                  <TableHead className="text-center">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {challenges.length > 0 ? (
                  challenges.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {gameTypeNames[c.gameType] || c.gameType}
                      </TableCell>
                      <TableCell>{c.player1Name}</TableCell>
                      <TableCell>{c.player2Name || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-center font-semibold">
                        ${parseFloat(c.betAmount).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">{currencyBadge(c.currencyType)}</TableCell>
                      <TableCell className="text-center">{statusBadge(c.status)}</TableCell>
                      <TableCell className="text-center">{visibilityBadge(c.visibility)}</TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {formatDate(c.createdAt)}
                      </TableCell>
                      <TableCell className="text-center">
                        {(c.status === 'waiting' || c.status === 'active') && (
                          <Button
                            className={`${BUTTON_3D_DESTRUCTIVE_CLASS} h-10 w-10 p-0`}
                            onClick={() => setCancellingId(c.id)}
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      لا توجد تحديات مطابقة للفلتر
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <Button
                className={BUTTON_3D_CLASS}
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronRight className="h-4 w-4" />
                السابق
              </Button>
              <span className="text-sm text-muted-foreground">
                صفحة {page} من {data.totalPages} ({data.total} تحدي)
              </span>
              <Button
                className={BUTTON_3D_CLASS}
                disabled={page >= data.totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                التالي
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={!!cancellingId} onOpenChange={(open) => !open && setCancellingId(null)}>
        <AlertDialogContent dir="rtl" className={ALERT_DIALOG_SURFACE_CLASS}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              إلغاء التحدي
            </AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من إلغاء هذا التحدي؟ سيتم استرداد المبالغ بالكامل لجميع اللاعبين.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BUTTON_3D_CLASS}>تراجع</AlertDialogCancel>
            <AlertDialogAction
              className={BUTTON_3D_DESTRUCTIVE_CLASS}
              onClick={() => cancellingId && cancelMutation.mutate(cancellingId)}
            >
              {cancelMutation.isPending && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              إلغاء التحدي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
