import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
      <div className="p-4 md:p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-12 bg-muted rounded w-1/3" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <IdCard className="h-6 w-6 text-primary" />
          {isArabic ? 'طلبات التوثيق' : 'ID Verification Requests'}
        </h1>
        <p className="text-muted-foreground">
          {isArabic ? 'مراجعة وإدارة طلبات التحقق من الهوية' : 'Review and manage ID verification requests'}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isArabic ? 'قيد المراجعة' : 'Pending'}</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isArabic ? 'تم التوثيق' : 'Approved'}</p>
                <p className="text-2xl font-bold text-green-600">{approvedCount}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isArabic ? 'مرفوض' : 'Rejected'}</p>
                <p className="text-2xl font-bold text-red-600">{rejectedCount}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4 justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={isArabic ? 'بحث...' : 'Search...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="ps-9"
                data-testid="input-search"
              />
            </div>
            <Tabs value={filterStatus} onValueChange={setFilterStatus}>
              <TabsList>
                <TabsTrigger value="all">{isArabic ? 'الكل' : 'All'}</TabsTrigger>
                <TabsTrigger value="pending">{isArabic ? 'قيد المراجعة' : 'Pending'}</TabsTrigger>
                <TabsTrigger value="approved">{isArabic ? 'موثق' : 'Approved'}</TabsTrigger>
                <TabsTrigger value="rejected">{isArabic ? 'مرفوض' : 'Rejected'}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {filteredVerifications.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <IdCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{isArabic ? 'لا توجد طلبات' : 'No verification requests'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredVerifications.map((request) => {
                const hasUnreadAlert = unreadEntityIds.has(String(request.id));
                return (
                <div
                  key={request.id}
                  className={`flex items-center justify-between p-4 border rounded-lg hover-elevate transition-colors ${hasUnreadAlert ? 'bg-primary/5 border-s-2 border-s-primary/40' : (request.idVerificationStatus === 'pending' ? 'bg-yellow-500/5 border-s-2 border-s-yellow-500/50' : '')}`}
                  data-testid={`verification-request-${request.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{request.nickname || request.username}</p>
                      <p className="text-sm text-muted-foreground">
                        {request.email || request.phone || request.username}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(request.idVerificationStatus)}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (hasUnreadAlert) {
                          markAlertRead.mutate({ entityType: "user", entityId: String(request.id) });
                        }
                        setSelectedRequest(request);
                      }}
                      data-testid={`button-view-${request.id}`}
                    >
                      <Eye className="h-4 w-4 me-1" />
                      {isArabic ? 'عرض' : 'View'}
                    </Button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent className="max-w-2xl">
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
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{isArabic ? 'اسم المستخدم' : 'Username'}</p>
                  <p className="font-medium">{selectedRequest.username}</p>
                </div>
                {getStatusBadge(selectedRequest.idVerificationStatus)}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">{isArabic ? 'الوجه الأمامي' : 'Front Side'}</p>
                  <img
                    src={selectedRequest.idFrontImage}
                    alt="Front ID"
                    loading="lazy"
                    className="w-full rounded-lg border"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">{isArabic ? 'الوجه الخلفي' : 'Back Side'}</p>
                  <img
                    src={selectedRequest.idBackImage}
                    alt="Back ID"
                    loading="lazy"
                    className="w-full rounded-lg border"
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
                      data-testid="input-rejection-reason"
                    />
                  </div>

                  <DialogFooter className="gap-2">
                    <Button
                      variant="destructive"
                      onClick={() => reviewMutation.mutate({
                        userId: selectedRequest.id,
                        action: 'reject',
                        reason: rejectionReason
                      })}
                      disabled={reviewMutation.isPending}
                      data-testid="button-reject"
                    >
                      {reviewMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin me-1" />
                      ) : (
                        <XCircle className="h-4 w-4 me-1" />
                      )}
                      {isArabic ? 'رفض' : 'Reject'}
                    </Button>
                    <Button
                      onClick={() => reviewMutation.mutate({
                        userId: selectedRequest.id,
                        action: 'approve'
                      })}
                      disabled={reviewMutation.isPending}
                      data-testid="button-approve"
                    >
                      {reviewMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin me-1" />
                      ) : (
                        <CheckCircle className="h-4 w-4 me-1" />
                      )}
                      {isArabic ? 'موافقة' : 'Approve'}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
