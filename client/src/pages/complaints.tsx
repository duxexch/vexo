import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth, useAuthHeaders } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import type { Complaint, ComplaintMessage, ComplaintStatus } from "@shared/schema";
import { AlertTriangle, MessageSquare, Clock, CheckCircle, Loader2, Plus, Send } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { TableSkeleton } from "@/components/skeletons";
import { QueryErrorState } from "@/components/QueryErrorState";

interface ComplaintWithMessages extends Complaint {
  messages?: ComplaintMessage[];
}

export default function ComplaintsPage() {
  const { user } = useAuth();
  const headers = useAuthHeaders();
  const { toast } = useToast();
  const { t, dir } = useI18n();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintWithMessages | null>(null);
  const [newMessage, setNewMessage] = useState("");
  
  const [formData, setFormData] = useState({
    category: "financial",
    priority: "medium",
    subject: "",
    description: "",
  });

  const { data: complaints, isLoading, isError, error, refetch } = useQuery<Complaint[]>({
    queryKey: ["/api/complaints"],
    queryFn: async () => {
      const res = await fetch("/api/complaints", { headers });
      if (!res.ok) throw new Error("Failed to fetch complaints");
      return res.json();
    },
  });

  const { data: complaintDetails, refetch: refetchDetails } = useQuery<ComplaintWithMessages>({
    queryKey: ["/api/complaints", selectedComplaint?.id],
    queryFn: async () => {
      const res = await fetch(`/api/complaints/${selectedComplaint?.id}`, { headers });
      if (!res.ok) throw new Error("Failed to fetch complaint");
      return res.json();
    },
    enabled: !!selectedComplaint?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/complaints", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/complaints"] });
      setIsDialogOpen(false);
      setFormData({ category: "financial", priority: "medium", subject: "", description: "" });
      toast({ title: t('common.success'), description: t('complaints.submitSuccess') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Complaint> }) => {
      return apiRequest("PATCH", `/api/complaints/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/complaints"] });
      refetchDetails();
      toast({ title: t('common.success'), description: t('complaints.updateSuccess') });
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    },
  });

  const messageMutation = useMutation({
    mutationFn: async ({ complaintId, message }: { complaintId: string; message: string }) => {
      return apiRequest("POST", `/api/complaints/${complaintId}/messages`, { message });
    },
    onSuccess: () => {
      refetchDetails();
      setNewMessage("");
    },
    onError: (error: Error) => {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    },
  });

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ComponentType<{ className?: string }> }> = {
      open: { variant: "secondary", icon: AlertTriangle },
      assigned: { variant: "outline", icon: Clock },
      in_progress: { variant: "outline", icon: Clock },
      escalated: { variant: "destructive", icon: AlertTriangle },
      resolved: { variant: "default", icon: CheckCircle },
      closed: { variant: "secondary", icon: CheckCircle },
    };
    const config = statusConfig[status] || { variant: "outline", icon: AlertTriangle };
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className={status === "resolved" ? "bg-primary" : ""}>
        <Icon className="w-3 h-3 me-1" /> {t('complaints.statuses.' + status)}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      low: "bg-blue-500/20 text-blue-400",
      medium: "bg-yellow-500/20 text-yellow-400",
      high: "bg-orange-500/20 text-orange-400",
      urgent: "bg-red-500/20 text-red-400",
    };
    return <Badge className={colors[priority] || ""}>{priority}</Badge>;
  };

  const isAgentOrAdmin = user?.role === "admin" || user?.role === "agent";

  if (isLoading) {
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-48 mb-6" />
        <TableSkeleton rows={5} columns={4} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <QueryErrorState error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" dir={dir}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">{t('complaints.title')}</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-complaint">
              <Plus className="me-2 h-4 w-4" /> {t('complaints.newComplaint')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('complaints.submitComplaint')}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate(formData);
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('complaints.category')}</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(v) => setFormData((p) => ({ ...p, category: v }))}
                  >
                    <SelectTrigger data-testid="select-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="financial">{t('complaints.categories.financial')}</SelectItem>
                      <SelectItem value="technical">{t('complaints.categories.technical')}</SelectItem>
                      <SelectItem value="account">{t('complaints.categories.account')}</SelectItem>
                      <SelectItem value="game">{t('complaints.categories.game')}</SelectItem>
                      <SelectItem value="other">{t('complaints.categories.other')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('complaints.priorityLabel')}</Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(v) => setFormData((p) => ({ ...p, priority: v }))}
                  >
                    <SelectTrigger data-testid="select-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">{t('complaints.priorities.low')}</SelectItem>
                      <SelectItem value="medium">{t('complaints.priorities.medium')}</SelectItem>
                      <SelectItem value="high">{t('complaints.priorities.high')}</SelectItem>
                      <SelectItem value="urgent">{t('complaints.priorities.urgent')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>{t('complaints.subject')}</Label>
                <Input
                  data-testid="input-subject"
                  value={formData.subject}
                  onChange={(e) => setFormData((p) => ({ ...p, subject: e.target.value }))}
                  placeholder={t('complaints.subjectPlaceholder')}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label>{t('complaints.description')}</Label>
                <Textarea
                  data-testid="input-description"
                  value={formData.description}
                  onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                  placeholder={t('complaints.descriptionPlaceholder')}
                  rows={4}
                  required
                />
              </div>
              
              <Button
                type="submit"
                className="w-full"
                data-testid="button-submit-complaint"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t('complaints.submitComplaint')}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('complaints.allComplaints')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              <div className="divide-y">
                {complaints?.map((complaint) => (
                  <div
                    key={complaint.id}
                    className={`p-4 cursor-pointer hover-elevate ${
                      selectedComplaint?.id === complaint.id ? "bg-muted" : ""
                    }`}
                    data-testid={`row-complaint-${complaint.id}`}
                    onClick={() => setSelectedComplaint(complaint)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="font-medium line-clamp-1">{complaint.subject}</p>
                      {getStatusBadge(complaint.status)}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{complaint.ticketNumber}</span>
                      <span>|</span>
                      {getPriorityBadge(complaint.priority)}
                      <span>|</span>
                      <span>{new Date(complaint.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
                
                {complaints?.length === 0 && (
                  <EmptyState icon={AlertTriangle} title={t('complaints.noComplaints')} />
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {selectedComplaint ? (
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  {selectedComplaint.ticketNumber}
                </div>
              ) : (
                t('complaints.selectComplaint')
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedComplaint && complaintDetails ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h3 className="font-semibold">{complaintDetails.subject}</h3>
                    <div className="flex gap-2">
                      {getStatusBadge(complaintDetails.status)}
                      {getPriorityBadge(complaintDetails.priority)}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{complaintDetails.description}</p>
                  {complaintDetails.slaDeadline && (
                    <p className="text-xs text-muted-foreground">
                      {t('complaints.slaDeadline')} {new Date(complaintDetails.slaDeadline).toLocaleString()}
                    </p>
                  )}
                </div>

                {isAgentOrAdmin && (
                  <div className="flex gap-2">
                    <Select
                      value={complaintDetails.status}
                      onValueChange={(v) =>
                        updateMutation.mutate({ id: complaintDetails.id, data: { status: v as ComplaintStatus } })
                      }
                    >
                      <SelectTrigger data-testid="select-update-status" className="w-40">
                        <SelectValue placeholder={t('complaints.updateStatus')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">{t('complaints.statuses.open')}</SelectItem>
                        <SelectItem value="assigned">{t('complaints.statuses.assigned')}</SelectItem>
                        <SelectItem value="in_progress">{t('complaints.statuses.in_progress')}</SelectItem>
                        <SelectItem value="escalated">{t('complaints.statuses.escalated')}</SelectItem>
                        <SelectItem value="resolved">{t('complaints.statuses.resolved')}</SelectItem>
                        <SelectItem value="closed">{t('complaints.statuses.closed')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">{t('complaints.messages')}</h4>
                  <ScrollArea className="h-48 mb-4">
                    <div className="space-y-3">
                      {complaintDetails.messages?.map((msg) => (
                        <div
                          key={msg.id}
                          className={`p-3 rounded-lg ${
                            msg.senderId === user?.id
                              ? "bg-primary/20 ms-8"
                              : "bg-muted me-8"
                          }`}
                        >
                          <p className="text-sm">{msg.message}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(msg.createdAt).toLocaleString()}
                          </p>
                        </div>
                      ))}
                      
                      {(!complaintDetails.messages || complaintDetails.messages.length === 0) && (
                        <p className="text-center text-muted-foreground text-sm">
                          {t('complaints.noMessages')}
                        </p>
                      )}
                    </div>
                  </ScrollArea>

                  <div className="flex gap-2">
                    <Input
                      data-testid="input-message"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder={t('complaints.messagePlaceholder')}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newMessage.trim()) {
                          messageMutation.mutate({
                            complaintId: complaintDetails.id,
                            message: newMessage,
                          });
                        }
                      }}
                    />
                    <Button
                      size="icon"
                      data-testid="button-send-message"
                      onClick={() => {
                        if (newMessage.trim()) {
                          messageMutation.mutate({
                            complaintId: complaintDetails.id,
                            message: newMessage,
                          });
                        }
                      }}
                      disabled={messageMutation.isPending || !newMessage.trim()}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState icon={MessageSquare} title={t('complaints.selectToView')} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
