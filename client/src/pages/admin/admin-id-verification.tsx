import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useUnreadAlertEntities, useMarkAlertReadByEntity } from "@/hooks/use-admin-alert-counts";
import {
  IdCard,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Loader2,
  Eye,
  Search,
} from "lucide-react";

interface VerificationRequest {
  id: string;
  username: string;
  nickname: string | null;
  email: string | null;
  phone: string | null;
  idFrontImage: string;
  idBackImage: string;
  idVerificationStatus: string;
  createdAt: string;
}

const SURFACE_CARD_CLASS = "rounded-[28px] border border-slate-200/70 bg-white/95 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/90";
const STAT_CARD_CLASS = `${SURFACE_CARD_CLASS} overflow-hidden`;
const DATA_CARD_CLASS = `${SURFACE_CARD_CLASS} overflow-hidden`;
const BUTTON_3D_CLASS = "rounded-2xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 shadow-[0_8px_0_0_rgba(226,232,240,0.95)] transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(226,232,240,0.95)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:shadow-[0_8px_0_0_rgba(15,23,42,0.95)]";
const BUTTON_3D_PRIMARY_CLASS = "rounded-2xl border border-sky-500 bg-sky-500 px-4 py-2 font-semibold text-white shadow-[0_8px_0_0_rgba(3,105,161,0.45)] transition-transform duration-150 hover:-translate-y-0.5 hover:bg-sky-400 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(3,105,161,0.45)]";
const BUTTON_3D_DESTRUCTIVE_CLASS = "rounded-2xl border border-red-500 bg-red-500 px-4 py-2 font-semibold text-white shadow-[0_8px_0_0_rgba(185,28,28,0.35)] transition-transform duration-150 hover:-translate-y-0.5 hover:bg-red-400 active:translate-y-1 active:shadow-[0_3px_0_0_rgba(185,28,28,0.35)]";
const INPUT_SURFACE_CLASS = "h-12 rounded-2xl border-slate-200 bg-white/90 shadow-none focus-visible:ring-2 focus-visible:ring-sky-200 dark:border-slate-700 dark:bg-slate-900/80 dark:focus-visible:ring-sky-900";
const TEXTAREA_SURFACE_CLASS = "min-h-[120px] rounded-2xl border-slate-200 bg-white/90 shadow-none focus-visible:ring-2 focus-visible:ring-sky-200 dark:border-slate-700 dark:bg-slate-900/80 dark:focus-visible:ring-sky-900";
const DIALOG_SURFACE_CLASS = "max-h-[92vh] overflow-y-auto rounded-[32px] border border-slate-200/80 bg-white/98 p-0 shadow-[0_24px_80px_-28px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-950/98 sm:max-w-4xl";

export default function AdminIdVerificationPage() {
  const { t, language } = useI18n();
  const { toast } = useToast();
  const isArabic = language === 'ar';

  const [selectedRequest, setSelectedRequest] = useState<VerificationRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Alert-based highlighting: track which verification requests have unread alerts
  const { data: unreadData } = useUnreadAlertEntities("/admin/id-verification");
  const unreadEntityIds = new Set(unreadData?.entityIds || []);
  const markAlertRead = useMarkAlertReadByEntity();

  const { data: verifications, isLoading } = useQuery<VerificationRequest[]>({
    queryKey: ['/api/admin/id-verifications'],
  });

  const reviewMutation = useMutation({
    mutationFn: ({ userId, action, reason }: { userId: string; action: string; reason?: string }) =>
      apiRequest('POST', `/api/admin/id-verifications/${userId}/review`, { action, reason }),
    onSuccess: () => {
      toast({
        title: isArabic ? 'تم التحديث' : 'Updated',
        description: isArabic ? 'تم تحديث حالة التوثيق' : 'Verification status updated'
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/id-verifications'] });
      setSelectedRequest(null);
      setRejectionReason("");
    },
    onError: (err: Error) => {
      toast({ title: isArabic ? 'خطأ' : 'Error', description: err.message, variant: "destructive" });
    }
  });

  const filteredVerifications = verifications?.filter(v => {
    const search = searchTerm.toLowerCase();
    const username = (v.username || '').toLowerCase();
    const nickname = (v.nickname || '').toLowerCase();
    const email = (v.email || '').toLowerCase();
    const matchesSearch = username.includes(search) || nickname.includes(search) || email.includes(search);
    const matchesStatus = filterStatus === 'all' || v.idVerificationStatus === filterStatus;
    return matchesSearch && matchesStatus;
  }) || [];

  const pendingCount = verifications?.filter(v => v.idVerificationStatus === 'pending').length || 0;
  const approvedCount = verifications?.filter(v => v.idVerificationStatus === 'approved').length || 0;
  const rejectedCount = verifications?.filter(v => v.idVerificationStatus === 'rejected').length || 0;
  const totalCount = verifications?.length || 0;

  const sortedFilteredVerifications = [...filteredVerifications].sort((left, right) => {
    const leftUnread = Number(unreadEntityIds.has(String(left.id)));
    const rightUnread = Number(unreadEntityIds.has(String(right.id)));
    if (leftUnread !== rightUnread) return rightUnread - leftUnread;

    const statusOrder: Record<string, number> = { pending: 0, approved: 1, rejected: 2 };
    const leftStatus = statusOrder[left.idVerificationStatus] ?? 99;
    const rightStatus = statusOrder[right.idVerificationStatus] ?? 99;
    if (leftStatus !== rightStatus) return leftStatus - rightStatus;

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });

  const formatSubmittedAt = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(isArabic ? 'ar-SA' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600"><Clock className="h-3 w-3 me-1" />{isArabic ? 'قيد المراجعة' : 'Pending'}</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-500/10 text-green-600"><CheckCircle className="h-3 w-3 me-1" />{isArabic ? 'موثق' : 'Approved'}</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-500/10 text-red-600"><XCircle className="h-3 w-3 me-1" />{isArabic ? 'مرفوض' : 'Rejected'}</Badge>;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-5 p-3 sm:p-4 md:p-6">
        <div className={`${SURFACE_CARD_CLASS} p-6`}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="rounded-[24px] border border-slate-200/70 p-5 dark:border-slate-800">
                <div className="h-6 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                <div className="mt-4 h-4 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-3 sm:p-4 md:p-6">
      <div className={`${SURFACE_CARD_CLASS} px-5 py-5 sm:px-6 sm:py-6`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-b from-sky-400 to-sky-700 text-white shadow-[0_10px_0_0_rgba(3,105,161,0.45)]">
              <IdCard className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl" data-testid="text-page-title">
                {isArabic ? 'طلبات التوثيق' : 'ID Verification Requests'}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                {isArabic ? 'مراجعة وإدارة طلبات التحقق من الهوية' : 'Review and manage ID verification requests'}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="w-fit rounded-full border-sky-200 bg-sky-50 px-3 py-1 text-sky-700 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300">
            <Clock className="me-2 h-3.5 w-3.5" />
            {isArabic ? `${pendingCount} قيد المراجعة` : `${pendingCount} pending`}
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
              <IdCard className="h-5 w-5" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{isArabic ? 'إجمالي الطلبات' : 'Total Requests'}</p>
                <p className="mt-1 text-2xl font-bold">{totalCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              <Clock className="h-5 w-5" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{isArabic ? 'قيد المراجعة' : 'Pending'}</p>
                <p className="mt-1 text-2xl font-bold text-yellow-600">{pendingCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{isArabic ? 'تم التوثيق' : 'Approved'}</p>
                <p className="mt-1 text-2xl font-bold text-green-600">{approvedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={STAT_CARD_CLASS}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-red-100 p-3 text-red-700 dark:bg-red-950/60 dark:text-red-300">
              <XCircle className="h-5 w-5" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{isArabic ? 'مرفوض' : 'Rejected'}</p>
                <p className="mt-1 text-2xl font-bold text-red-600">{rejectedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className={SURFACE_CARD_CLASS}>
        <CardHeader>
          <CardTitle>{isArabic ? 'البحث والتصفية' : 'Search and Filter'}</CardTitle>
          <CardDescription>
            {isArabic ? 'اعرض الطلبات بحسب الحالة أو ابحث باسم المستخدم والبريد والاسم الظاهر.' : 'Filter by status or search by username, email, and display name.'}
          </CardDescription>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1 md:max-w-sm">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={isArabic ? 'بحث...' : 'Search...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`${INPUT_SURFACE_CLASS} ps-9`}
                data-testid="input-search"
              />
            </div>
            <Tabs value={filterStatus} onValueChange={setFilterStatus}>
              <TabsList className="grid w-full grid-cols-2 gap-2 rounded-3xl bg-slate-100/80 p-1.5 md:w-auto md:grid-cols-4 dark:bg-slate-900/80">
                <TabsTrigger value="all" className="rounded-2xl">{isArabic ? 'الكل' : 'All'}</TabsTrigger>
                <TabsTrigger value="pending" className="rounded-2xl">{isArabic ? 'قيد المراجعة' : 'Pending'}</TabsTrigger>
                <TabsTrigger value="approved" className="rounded-2xl">{isArabic ? 'موثق' : 'Approved'}</TabsTrigger>
                <TabsTrigger value="rejected" className="rounded-2xl">{isArabic ? 'مرفوض' : 'Rejected'}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {sortedFilteredVerifications.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-300/80 py-12 text-center text-muted-foreground dark:border-slate-700">
              <IdCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{isArabic ? 'لا توجد طلبات' : 'No verification requests'}</p>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {sortedFilteredVerifications.map((request) => {
                const hasUnreadAlert = unreadEntityIds.has(String(request.id));
                return (
                  <Card
                    key={request.id}
                    className={`${DATA_CARD_CLASS} ${hasUnreadAlert ? 'ring-2 ring-sky-300 dark:ring-sky-900' : ''}`}
                    data-testid={`verification-request-${request.id}`}
                  >
                    <CardContent className="space-y-4 p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
                            <User className="h-5 w-5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate font-semibold">{request.nickname || request.username}</p>
                              {hasUnreadAlert ? <span className="h-2.5 w-2.5 rounded-full bg-sky-500" aria-hidden="true" /> : null}
                            </div>
                            <p className="truncate text-sm text-muted-foreground">
                              {request.email || request.phone || request.username}
                            </p>
                          </div>
                        </div>
                        {getStatusBadge(request.idVerificationStatus)}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                            {isArabic ? 'اسم المستخدم' : 'Username'}
                          </p>
                          <p className="mt-2 truncate text-sm font-semibold">{request.username}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                            {isArabic ? 'تاريخ الطلب' : 'Submitted'}
                          </p>
                          <p className="mt-2 text-sm font-semibold">{formatSubmittedAt(request.createdAt)}</p>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button
                          className={BUTTON_3D_CLASS}
                          onClick={() => {
                            if (hasUnreadAlert) {
                              markAlertRead.mutate({ entityType: "user", entityId: String(request.id) });
                            }
                            setSelectedRequest(request);
                          }}
                          data-testid={`button-view-${request.id}`}
                        >
                          <Eye className="me-2 h-4 w-4" />
                          {isArabic ? 'عرض' : 'View'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedRequest} onOpenChange={(open) => {
        if (!open) {
          setSelectedRequest(null);
          setRejectionReason("");
        }
      }}>
        <DialogContent className={DIALOG_SURFACE_CLASS}>
          <div className="space-y-5 p-5 sm:p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <IdCard className="h-5 w-5 text-primary" />
                {isArabic ? 'مراجعة طلب التوثيق' : 'Review Verification Request'}
              </DialogTitle>
              <DialogDescription>
                {selectedRequest?.nickname || selectedRequest?.username}
              </DialogDescription>
            </DialogHeader>

            {selectedRequest && (
              <div className="space-y-5">
                <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                        {isArabic ? 'اسم المستخدم' : 'Username'}
                      </p>
                      <p className="mt-2 text-base font-semibold">{selectedRequest.username}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{selectedRequest.email || selectedRequest.phone || selectedRequest.username}</p>
                    </div>
                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      {getStatusBadge(selectedRequest.idVerificationStatus)}
                      <p className="text-sm text-muted-foreground">{formatSubmittedAt(selectedRequest.createdAt)}</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">{isArabic ? 'الوجه الأمامي' : 'Front Side'}</p>
                    <img
                      src={selectedRequest.idFrontImage}
                      alt="Front ID"
                      loading="lazy"
                      className="w-full rounded-[24px] border border-slate-200/80 object-cover dark:border-slate-800"
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">{isArabic ? 'الوجه الخلفي' : 'Back Side'}</p>
                    <img
                      src={selectedRequest.idBackImage}
                      alt="Back ID"
                      loading="lazy"
                      className="w-full rounded-[24px] border border-slate-200/80 object-cover dark:border-slate-800"
                    />
                  </div>
                </div>

                {selectedRequest.idVerificationStatus === 'pending' && (
                  <>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">{isArabic ? 'سبب الرفض (اختياري)' : 'Rejection Reason (optional)'}</p>
                      <Textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder={isArabic ? 'أدخل سبب الرفض...' : 'Enter rejection reason...'}
                        className={TEXTAREA_SURFACE_CLASS}
                        data-testid="input-rejection-reason"
                      />
                    </div>

                    <DialogFooter className="gap-2 sm:justify-end">
                      <Button
                        className={BUTTON_3D_DESTRUCTIVE_CLASS}
                        onClick={() => reviewMutation.mutate({
                          userId: selectedRequest.id,
                          action: 'reject',
                          reason: rejectionReason
                        })}
                        disabled={reviewMutation.isPending}
                        data-testid="button-reject"
                      >
                        {reviewMutation.isPending ? (
                          <Loader2 className="me-2 h-4 w-4 animate-spin" />
                        ) : (
                          <XCircle className="me-2 h-4 w-4" />
                        )}
                        {isArabic ? 'رفض' : 'Reject'}
                      </Button>
                      <Button
                        className={BUTTON_3D_PRIMARY_CLASS}
                        onClick={() => reviewMutation.mutate({
                          userId: selectedRequest.id,
                          action: 'approve'
                        })}
                        disabled={reviewMutation.isPending}
                        data-testid="button-approve"
                      >
                        {reviewMutation.isPending ? (
                          <Loader2 className="me-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle className="me-2 h-4 w-4" />
                        )}
                        {isArabic ? 'موافقة' : 'Approve'}
                      </Button>
                    </DialogFooter>
                  </>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
