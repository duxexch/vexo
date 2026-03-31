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

  if (isLoading && statsLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Swords className="h-6 w-6 text-primary" />
            إدارة التحديات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            مراقبة وإدارة جميع التحديات المالية
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/challenges"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/challenge-stats"] });
          }}
        >
          <RefreshCw className="h-4 w-4 ml-1" />
          تحديث
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <div className="text-xs text-muted-foreground">إجمالي التحديات</div>
          </CardContent>
        </Card>
        <Card className="border-yellow-500/20">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">{stats?.waiting || 0}</div>
            <div className="text-xs text-muted-foreground">منتظرة</div>
          </CardContent>
        </Card>
        <Card className="border-blue-500/20">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats?.active || 0}</div>
            <div className="text-xs text-muted-foreground">نشطة</div>
          </CardContent>
        </Card>
        <Card className="border-green-500/20">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">${stats?.totalCommission?.toFixed(2) || '0.00'}</div>
            <div className="text-xs text-muted-foreground">إجمالي العمولة</div>
          </CardContent>
        </Card>
        <Card className="border-purple-500/20">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">${stats?.totalVolume?.toFixed(2) || '0.00'}</div>
            <div className="text-xs text-muted-foreground">حجم الرهانات</div>
          </CardContent>
        </Card>
      </div>

      {/* Today Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-gradient-to-r from-green-500/5 to-transparent">
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-green-500" />
            <div>
              <div className="text-lg font-bold">{stats?.todayChallenges || 0} تحدي</div>
              <div className="text-xs text-muted-foreground">تحديات اليوم</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-blue-500/5 to-transparent">
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
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">قائمة التحديات</CardTitle>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[140px]">
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
                <SelectTrigger className="w-[140px]">
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
        <CardContent>
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
              {data?.challenges && data.challenges.length > 0 ? (
                data.challenges.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {gameTypeNames[c.gameType] || c.gameType}
                    </TableCell>
                    <TableCell>{c.player1Name}</TableCell>
                    <TableCell>{c.player2Name || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-center font-semibold">
                      ${parseFloat(c.betAmount).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-[10px]">
                        {c.currencyType === 'project' ? 'VEX' : 'USD'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{statusBadge(c.status)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-[10px]">
                        {c.visibility === 'private' ? '🔒 خاص' : '🌍 عام'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {formatDate(c.createdAt)}
                    </TableCell>
                    <TableCell className="text-center">
                      {(c.status === 'waiting' || c.status === 'active') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-600"
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

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-4">
              <Button
                variant="outline"
                size="sm"
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
                variant="outline"
                size="sm"
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
        <AlertDialogContent dir="rtl">
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
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
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
