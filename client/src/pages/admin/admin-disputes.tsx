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
  ExternalLink,
  FileText,
  XCircle,
  MessageSquare,
  ShieldCheck,
  ShieldX,
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

interface AdminDisputeEvidence {
  id: string;
  fileName: string;
  fileUrl: string;
  evidenceType: string;
  description?: string | null;
  isVerified: boolean;
  verifiedBy?: string | null;
  verifiedByName?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
}

interface AdminDisputeDetails {
  dispute: Record<string, unknown> & {
    id: string;
    status: string;
    reason?: string;
    description?: string;
    initiatorId?: string;
    initiatorName?: string;
    respondentId?: string;
    respondentName?: string;
    createdAt: string;
    resolution?: string;
  };
  messages: Array<Record<string, unknown>>;
  evidence: AdminDisputeEvidence[];
  logs: Array<Record<string, unknown>>;
}

export default function AdminDisputesPage() {
  const { toast } = useToast();
  const [selectedDispute, setSelectedDispute] = useState<any>(null);
  const [resolution, setResolution] = useState("");
  const [resolutionType, setResolutionType] = useState<string>("");
  const [winnerId, setWinnerId] = useState<string>("");
  const selectedDisputeId = selectedDispute?.id as string | undefined;

  // Alert-based highlighting: track which disputes have unread alerts
  const { data: unreadData } = useUnreadAlertEntities("/admin/disputes");
  const unreadEntityIds = new Set(unreadData?.entityIds || []);
  const markAlertRead = useMarkAlertReadByEntity();

  const { data: disputes, isLoading } = useQuery({
    queryKey: ["/api/admin/p2p/disputes"],
    queryFn: () => adminFetch("/api/admin/p2p/disputes"),
  });

  const { data: disputeDetails, isLoading: disputeDetailsLoading } = useQuery<AdminDisputeDetails>({
    queryKey: ["/api/admin/p2p/disputes", selectedDisputeId, "details"],
    queryFn: () => adminFetch(`/api/admin/p2p/disputes/${selectedDisputeId}/details`),
    enabled: Boolean(selectedDisputeId),
  });

  const verifyEvidenceMutation = useMutation({
    mutationFn: async ({ disputeId, evidenceId, isVerified }: { disputeId: string; evidenceId: string; isVerified: boolean }) => {
      return adminFetch(`/api/admin/p2p/disputes/${disputeId}/evidence/${evidenceId}/verify`, {
        method: "POST",
        body: JSON.stringify({ isVerified }),
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/p2p/disputes", variables.disputeId, "details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/p2p/disputes"] });
      toast({
        title: variables.isVerified ? "Evidence Verified" : "Evidence Marked Unverified",
        description: variables.isVerified
          ? "The selected evidence is now verified."
          : "The selected evidence is now marked as unverified.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update evidence verification", variant: "destructive" });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, status, resolution, winnerId }: { id: string; status: string; resolution: string; winnerId?: string }) => {
      if (status === "resolved") {
        if (!winnerId) {
          throw new Error("Winner is required for dispute resolution");
        }
        return adminFetch(`/api/admin/p2p/disputes/${id}/resolve`, {
          method: "POST",
          body: JSON.stringify({ resolution, winnerId }),
        });
      }

      if (status === "investigating") {
        return adminFetch(`/api/admin/p2p/disputes/${id}/escalate`, {
          method: "POST",
          body: JSON.stringify({ reason: resolution }),
        });
      }

      if (status === "closed") {
        return adminFetch(`/api/admin/p2p/disputes/${id}/close`, {
          method: "POST",
          body: JSON.stringify({ reason: resolution }),
        });
      }

      throw new Error("Unsupported resolution action");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/p2p/disputes"] });
      toast({ title: "Dispute Resolved", description: "The dispute has been resolved" });
      setSelectedDispute(null);
      setResolution("");
      setResolutionType("");
      setWinnerId("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to resolve dispute", variant: "destructive" });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "resolved": return "default";
      case "pending": return "secondary";
      case "open": return "destructive";
      case "investigating": return "outline";
      case "closed": return "secondary";
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
    const activeDispute = disputeDetails?.dispute ?? selectedDispute;
    if (!activeDispute || !resolution || !resolutionType) return;
    if (resolutionType === "resolved" && !winnerId) return;

    resolveMutation.mutate({
      id: activeDispute.id,
      status: resolutionType,
      resolution,
      winnerId: resolutionType === "resolved" ? winnerId : undefined,
    });
  };

  const stats = {
    total: disputes?.length || 0,
    pending: disputes?.filter((c: { status: string }) => c.status === "pending" || c.status === "open").length || 0,
    inReview: disputes?.filter((c: { status: string }) => c.status === "investigating").length || 0,
    resolved: disputes?.filter((c: { status: string }) => c.status === "resolved" || c.status === "closed").length || 0,
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
        <h1 className="text-3xl font-bold">P2P Disputes</h1>
        <p className="text-muted-foreground">Manage and resolve P2P trading disputes</p>
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
        {disputes?.map((dispute: {
          id: string;
          status: string;
          reason?: string;
          description?: string;
          initiatorId?: string;
          initiatorName?: string;
          respondentId?: string;
          respondentName?: string;
          tradeAmount?: string;
          createdAt: string;
        }) => {
          const hasUnreadAlert = unreadEntityIds.has(String(dispute.id));
          return (
            <Card key={dispute.id} className={`transition-colors ${hasUnreadAlert ? 'border-s-2 border-s-primary/40 bg-primary/5' : (dispute.status === 'pending' || dispute.status === 'open' ? 'border-s-2 border-s-yellow-500/50 bg-yellow-500/5' : '')}`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{dispute.reason || "P2P Dispute"}</h3>
                      <Badge variant={getStatusColor(dispute.status)}>{dispute.status}</Badge>
                      <Badge variant={getPriorityColor(dispute.status === "open" ? "high" : dispute.status === "investigating" ? "medium" : "low")}>{dispute.status === "open" ? "high" : dispute.status === "investigating" ? "medium" : "low"}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {dispute.description}
                    </p>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {dispute.initiatorName || dispute.initiatorId} vs {dispute.respondentName || dispute.respondentId}
                      </span>
                      {dispute.tradeAmount && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          ${dispute.tradeAmount}
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
                          markAlertRead.mutate({ entityType: "p2p_dispute", entityId: String(dispute.id) });
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

        {(!disputes || disputes.length === 0) && (
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

          {(disputeDetails?.dispute || selectedDispute) && (
            <div className="space-y-4">
              {(() => {
                const activeDispute = disputeDetails?.dispute ?? selectedDispute;
                if (!activeDispute) return null;
                return (
                  <>
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={getStatusColor(activeDispute.status)}>
                    {activeDispute.status}
                  </Badge>
                  <Badge variant={getPriorityColor(activeDispute.status === "open" ? "high" : activeDispute.status === "investigating" ? "medium" : "low")}>
                    {activeDispute.status === "open" ? "high" : activeDispute.status === "investigating" ? "medium" : "low"}
                  </Badge>
                </div>
                <h3 className="font-semibold">{activeDispute.reason || "P2P Dispute"}</h3>
                <p className="text-sm">{activeDispute.description}</p>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>Initiator: {activeDispute.initiatorName || activeDispute.initiatorId}</span>
                  <span>Respondent: {activeDispute.respondentName || activeDispute.respondentId}</span>
                  <span>Created: {new Date(activeDispute.createdAt).toLocaleString()}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Evidence ({disputeDetails?.evidence?.length || 0})
                </Label>

                {disputeDetailsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading evidence...</p>
                ) : !disputeDetails?.evidence || disputeDetails.evidence.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No evidence uploaded for this dispute.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {disputeDetails.evidence.map((ev) => (
                      <div key={ev.id} className="rounded-md border p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{ev.fileName}</p>
                            <p className="text-xs text-muted-foreground">
                              {ev.evidenceType} • {new Date(ev.createdAt).toLocaleString()}
                            </p>
                            {ev.verifiedAt && (
                              <p className="text-xs text-muted-foreground">
                                Verified by {ev.verifiedByName || ev.verifiedBy || "admin"} at {new Date(ev.verifiedAt).toLocaleString()}
                              </p>
                            )}
                          </div>
                          <Badge variant={ev.isVerified ? "default" : "outline"}>
                            {ev.isVerified ? "verified" : "unverified"}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button asChild variant="outline" size="sm">
                            <a href={ev.fileUrl} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-4 w-4 me-1" />
                              Open
                            </a>
                          </Button>

                          {activeDispute.status !== "resolved" && activeDispute.status !== "closed" && (
                            <Button
                              size="sm"
                              variant={ev.isVerified ? "outline" : "default"}
                              disabled={verifyEvidenceMutation.isPending}
                              onClick={() => verifyEvidenceMutation.mutate({
                                disputeId: activeDispute.id,
                                evidenceId: ev.id,
                                isVerified: !ev.isVerified,
                              })}
                            >
                              {ev.isVerified ? (
                                <>
                                  <ShieldX className="h-4 w-4 me-1" />
                                  Mark Unverified
                                </>
                              ) : (
                                <>
                                  <ShieldCheck className="h-4 w-4 me-1" />
                                  Verify Evidence
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {activeDispute.status !== "resolved" && activeDispute.status !== "closed" && (
                <>
                  <div className="space-y-2">
                    <Label>Resolution Type</Label>
                    <Select value={resolutionType} onValueChange={setResolutionType}>
                      <SelectTrigger data-testid="select-resolution-type">
                        <SelectValue placeholder="Select resolution" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="resolved">Resolve dispute and settle trade</SelectItem>
                        <SelectItem value="investigating">Escalate to investigation</SelectItem>
                        <SelectItem value="closed">Close dispute (post-settlement only)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {resolutionType === "resolved" && (
                    <div className="space-y-2">
                      <Label>Winner</Label>
                      <Select value={winnerId} onValueChange={setWinnerId}>
                        <SelectTrigger data-testid="select-dispute-winner">
                          <SelectValue placeholder="Select winner" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={activeDispute.initiatorId}>
                            {activeDispute.initiatorName || activeDispute.initiatorId} (initiator)
                          </SelectItem>
                          <SelectItem value={activeDispute.respondentId}>
                            {activeDispute.respondentName || activeDispute.respondentId} (respondent)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

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

              {activeDispute.resolution && (
                <div className="p-4 bg-green-500/10 rounded-lg">
                  <p className="text-sm font-medium text-green-500">Resolution</p>
                  <p className="text-sm mt-1">{activeDispute.resolution}</p>
                </div>
              )}
                  </>
                );
              })()}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedDispute(null)}>
              Close
            </Button>
            {selectedDispute?.status !== "resolved" && selectedDispute?.status !== "closed" && (
              <Button
                onClick={handleResolve}
                disabled={!resolution || !resolutionType || (resolutionType === "resolved" && !winnerId) || resolveMutation.isPending}
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
