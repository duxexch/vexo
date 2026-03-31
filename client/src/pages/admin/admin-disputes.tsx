import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useUnreadAlertEntities, useMarkAlertReadByEntity } from "@/hooks/use-admin-alert-counts";
import {
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  MessageSquare,
  User,
  DollarSign,
  Eye,
} from "lucide-react";

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

export default function AdminDisputesPage() {
  const { toast } = useToast();
  const [selectedDispute, setSelectedDispute] = useState<any>(null);
  const [resolution, setResolution] = useState("");
  const [resolutionType, setResolutionType] = useState<string>("");

  // Alert-based highlighting: track which disputes have unread alerts
  const { data: unreadData } = useUnreadAlertEntities("/admin/disputes");
  const unreadEntityIds = new Set(unreadData?.entityIds || []);
  const markAlertRead = useMarkAlertReadByEntity();

  const { data: complaints, isLoading } = useQuery({
    queryKey: ["/api/admin/complaints"],
    queryFn: () => adminFetch("/api/admin/complaints"),
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, status, resolution }: { id: string; status: string; resolution: string }) => {
      return adminFetch(`/api/admin/complaints/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, adminNote: resolution }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/complaints"] });
      toast({ title: "Dispute Resolved", description: "The dispute has been resolved" });
      setSelectedDispute(null);
      setResolution("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to resolve dispute", variant: "destructive" });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "resolved": return "default";
      case "pending": return "secondary";
      case "open": return "destructive";
      case "in_review": return "outline";
      default: return "secondary";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "destructive";
      case "high": return "secondary";
      case "medium": return "outline";
      case "low": return "default";
      default: return "outline";
    }
  };

  const handleResolve = () => {
    if (!selectedDispute || !resolution || !resolutionType) return;
    resolveMutation.mutate({
      id: selectedDispute.id,
      status: resolutionType,
      resolution,
    });
  };

  const stats = {
    total: complaints?.length || 0,
    pending: complaints?.filter((c: { status: string }) => c.status === "pending" || c.status === "open").length || 0,
    inReview: complaints?.filter((c: { status: string }) => c.status === "in_review").length || 0,
    resolved: complaints?.filter((c: { status: string }) => c.status === "resolved").length || 0,
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
      <div>
        <h1 className="text-3xl font-bold">Disputes & Complaints</h1>
        <p className="text-muted-foreground">Manage P2P disputes and user complaints</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Disputes</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-yellow-500">{stats.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">In Review</p>
                <p className="text-2xl font-bold text-blue-500">{stats.inReview}</p>
              </div>
              <Eye className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Resolved</p>
                <p className="text-2xl font-bold text-green-500">{stats.resolved}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {complaints?.map((dispute: { id: string; subject?: string; status: string; priority?: string; description?: string; userId?: string; relatedAmount?: string; createdAt: string }) => {
          const hasUnreadAlert = unreadEntityIds.has(String(dispute.id));
          return (
          <Card key={dispute.id} className={`transition-colors ${hasUnreadAlert ? 'border-s-2 border-s-primary/40 bg-primary/5' : (dispute.status === 'pending' || dispute.status === 'open' ? 'border-s-2 border-s-yellow-500/50 bg-yellow-500/5' : '')}`}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{dispute.subject}</h3>
                    <Badge variant={getStatusColor(dispute.status)}>{dispute.status}</Badge>
                    <Badge variant={getPriorityColor(dispute.priority || "medium")}>{dispute.priority || "medium"}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {dispute.description}
                  </p>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      User: {dispute.userId}
                    </span>
                    {dispute.relatedAmount && (
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        ${dispute.relatedAmount}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(dispute.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (hasUnreadAlert) {
                        markAlertRead.mutate({ entityType: "complaint", entityId: String(dispute.id) });
                      }
                      setSelectedDispute(dispute);
                    }}
                    data-testid={`button-view-dispute-${dispute.id}`}
                  >
                    <MessageSquare className="h-4 w-4 me-1" />
                    Review
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          );
        })}

        {(!complaints || complaints.length === 0) && (
          <Card>
            <CardContent className="p-6 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <p className="text-muted-foreground">No disputes to review</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={selectedDispute !== null} onOpenChange={() => setSelectedDispute(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dispute Details</DialogTitle>
          </DialogHeader>

          {selectedDispute && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={getStatusColor(selectedDispute.status)}>
                    {selectedDispute.status}
                  </Badge>
                  <Badge variant={getPriorityColor(selectedDispute.priority)}>
                    {selectedDispute.priority}
                  </Badge>
                </div>
                <h3 className="font-semibold">{selectedDispute.subject}</h3>
                <p className="text-sm">{selectedDispute.description}</p>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>User ID: {selectedDispute.userId}</span>
                  <span>Created: {new Date(selectedDispute.createdAt).toLocaleString()}</span>
                </div>
              </div>

              {selectedDispute.status !== "resolved" && (
                <>
                  <div className="space-y-2">
                    <Label>Resolution Type</Label>
                    <Select value={resolutionType} onValueChange={setResolutionType}>
                      <SelectTrigger data-testid="select-resolution-type">
                        <SelectValue placeholder="Select resolution" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="resolved">Resolved - Issue Fixed</SelectItem>
                        <SelectItem value="rejected">Rejected - Invalid Claim</SelectItem>
                        <SelectItem value="in_review">Mark as In Review</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Admin Notes</Label>
                    <Textarea
                      placeholder="Enter resolution notes..."
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      rows={4}
                      data-testid="input-resolution-notes"
                    />
                  </div>
                </>
              )}

              {selectedDispute.adminNote && (
                <div className="p-4 bg-green-500/10 rounded-lg">
                  <p className="text-sm font-medium text-green-500">Admin Resolution</p>
                  <p className="text-sm mt-1">{selectedDispute.adminNote}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedDispute(null)}>
              Close
            </Button>
            {selectedDispute?.status !== "resolved" && (
              <Button
                onClick={handleResolve}
                disabled={!resolution || !resolutionType || resolveMutation.isPending}
                data-testid="button-submit-resolution"
              >
                Submit Resolution
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
