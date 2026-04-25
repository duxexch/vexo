import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { WORLD_CURRENCIES } from "@/lib/currencies";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  Search,
  Ban,
  Clock,
  Gift,
  DollarSign,
  MoreVertical,
  User,
  Mail,
  Phone,
  Edit,
  ArrowLeftRight,
  Eye,
  Gamepad2,
  Trophy,
  Calendar,
  X,
  Check,
  Shield,
  Copy,
  Wallet,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useUnreadAlertEntities, useMarkAlertReadByEntity } from "@/hooks/use-admin-alert-counts";

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
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return res.json();
}

interface UserType {
  id: string;
  username: string;
  nickname?: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  role: string;
  status: string;
  balance: string;
  profilePicture?: string;
  vipLevel: number;
  gamesPlayed: number;
  gamesWon: number;
  totalDeposited: string;
  totalWithdrawn: string;
  totalWagered: string;
  totalWon: string;
  p2pBanned: boolean;
  p2pBanReason?: string;
  p2pBannedAt?: string;
  createdAt: string;
  lastLoginAt?: string;
}

interface FinancialTimelineEntry {
  id: string;
  source: "fiat" | "project";
  currencyCode: string;
  type: string;
  status: string;
  signedAmount: number;
  absoluteAmount: number;
  balanceBefore: number;
  balanceAfter: number;
  reference: string;
  description: string;
  link: string;
  createdAt: string;
}

interface FinancialNotificationEntry {
  id: string;
  title: string;
  titleAr?: string | null;
  message: string;
  messageAr?: string | null;
  link: string;
  isRead: boolean;
  priority: string;
  reference: string;
  createdAt: string;
}

interface UserFinancialOverviewResponse {
  user: UserType;
  projectWallet: {
    purchasedBalance: string;
    earnedBalance: string;
    totalBalance: string;
    totalConverted: string;
    totalSpent: string;
    totalEarned: string;
    lockedBalance: string;
  } | null;
  metrics: {
    fiatBalance: number;
    fiatCurrencyCode: string;
    projectBalance: number;
    fiatCredits: number;
    fiatDebits: number;
    projectCredits: number;
    projectDebits: number;
    fiatNet: number;
    projectNet: number;
  };
  profileIndex: Array<{
    key: string;
    label: string;
    value: string;
  }>;
  financialTimeline: FinancialTimelineEntry[];
  transactionNotifications: FinancialNotificationEntry[];
}

export default function AdminUsersPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [actionDialog, setActionDialog] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionAmount, setActionAmount] = useState("");
  const [adjustType, setAdjustType] = useState<"add" | "subtract">("add");
  const [adjustWallet, setAdjustWallet] = useState<"usd" | "vxc">("usd");
  const [adjustCurrency, setAdjustCurrency] = useState<string>("");
  const [multiCurrencyEnabled, setMultiCurrencyEnabled] = useState<boolean>(false);
  const [multiCurrencyAllowList, setMultiCurrencyAllowList] = useState<string[]>([]);
  const [multiCurrencySearch, setMultiCurrencySearch] = useState("");
  const [viewUserSheet, setViewUserSheet] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<UserType>>({});
  const [userDataSearch, setUserDataSearch] = useState("");

  // Alert-based highlighting: fetch entity IDs that have unread alerts for this section
  const { data: unreadData } = useUnreadAlertEntities("/admin/users");
  const unreadEntityIds = new Set(unreadData?.entityIds || []);
  const markAlertRead = useMarkAlertReadByEntity();

  const { data: users, isLoading } = useQuery({
    queryKey: ["/api/admin/users"],
    queryFn: () => adminFetch("/api/admin/users"),
  });

  const { data: selectedUserOverview, isLoading: selectedUserOverviewLoading } = useQuery<UserFinancialOverviewResponse>({
    queryKey: ["/api/admin/users", selectedUser?.id, "financial-overview", userDataSearch],
    queryFn: () => adminFetch(`/api/admin/users/${selectedUser!.id}/financial-overview?search=${encodeURIComponent(userDataSearch)}&limit=300`),
    enabled: viewUserSheet && !!selectedUser?.id,
  });

  const { data: currencyWalletsData, refetch: refetchCurrencyWallets } = useQuery<{
    userId: string;
    primaryCurrency: string;
    multiCurrencyEnabled: boolean;
    allowedCurrencies: string[];
    wallets: Array<{ currency: string; balance: string; role: "primary" | "sub"; isPrimary: boolean; isAllowed: boolean }>;
  }>({
    queryKey: ["/api/admin/users", selectedUser?.id, "currency-wallets"],
    queryFn: () => adminFetch(`/api/admin/users/${selectedUser!.id}/currency-wallets`),
    enabled: viewUserSheet && !!selectedUser?.id,
  });

  // Sync the multi-currency dialog state with the latest server snapshot
  // whenever the wallets payload arrives.
  React.useEffect(() => {
    if (currencyWalletsData) {
      setMultiCurrencyEnabled(currencyWalletsData.multiCurrencyEnabled);
      setMultiCurrencyAllowList(
        (currencyWalletsData.allowedCurrencies || []).filter((code) => code !== currencyWalletsData.primaryCurrency),
      );
    }
  }, [currencyWalletsData?.userId, currencyWalletsData?.multiCurrencyEnabled, currencyWalletsData?.allowedCurrencies?.join(",")]);

  const multiCurrencyMutation = useMutation({
    mutationFn: async ({ id, enabled, allowedCurrencies }: { id: string; enabled: boolean; allowedCurrencies: string[] }) => {
      return adminFetch(`/api/admin/users/${id}/multi-currency`, {
        method: "PATCH",
        body: JSON.stringify({ enabled, allowedCurrencies }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      refetchCurrencyWallets();
      toast({ title: "Multi-currency Updated", description: "User wallet settings have been updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update multi-currency settings", variant: "destructive" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<UserType> }) => {
      const filteredData: Record<string, string | undefined> = {};
      if (data.username) filteredData.username = data.username;
      if (data.nickname) filteredData.nickname = data.nickname;
      if (data.email) filteredData.email = data.email;
      if (data.phone) filteredData.phone = data.phone;
      if (data.firstName) filteredData.firstName = data.firstName;
      if (data.lastName) filteredData.lastName = data.lastName;
      if (data.role) filteredData.role = data.role;
      if (data.status) filteredData.status = data.status;

      return adminFetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(filteredData),
      });
    },
    onSuccess: (updatedUser) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      if (updatedUser && selectedUser) {
        setSelectedUser({ ...selectedUser, ...updatedUser });
        setEditFormData({
          username: updatedUser.username,
          nickname: updatedUser.nickname || "",
          email: updatedUser.email || "",
          phone: updatedUser.phone || "",
          firstName: updatedUser.firstName || "",
          lastName: updatedUser.lastName || "",
          role: updatedUser.role,
          status: updatedUser.status,
        });
      }
      toast({ title: "User Updated", description: "User profile has been updated successfully" });
      setEditMode(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update user", variant: "destructive" });
    },
  });

  const banMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return adminFetch(`/api/admin/users/${id}/ban`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User Banned", description: "User has been banned successfully" });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to ban user", variant: "destructive" });
    },
  });

  const unbanMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return adminFetch(`/api/admin/users/${id}/unban`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User Activated", description: "User has been unbanned and reactivated successfully" });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to unban user", variant: "destructive" });
    },
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return adminFetch(`/api/admin/users/${id}/suspend`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User Suspended", description: "User has been suspended" });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to suspend user", variant: "destructive" });
    },
  });

  const balanceAdjustMutation = useMutation({
    mutationFn: async ({ id, amount, type, reason, wallet, currencyCode }: { id: string; amount: string; type: string; reason: string; wallet: "usd" | "vxc"; currencyCode?: string }) => {
      const endpoint = wallet === "vxc" ? "vxc-adjust" : "balance-adjust";
      const body: Record<string, unknown> = { amount, type, reason };
      if (wallet !== "vxc" && currencyCode) {
        body.currencyCode = currencyCode;
      }
      return adminFetch(`/api/admin/users/${id}/${endpoint}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      refetchCurrencyWallets();
      toast({
        title: variables.wallet === "vxc" ? "VXC Balance Updated" : "Balance Updated",
        description: variables.wallet === "vxc" ? "User VXC wallet has been adjusted" : "User balance has been adjusted",
      });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to adjust balance", variant: "destructive" });
    },
  });

  const rewardMutation = useMutation({
    mutationFn: async ({ id, amount, reason }: { id: string; amount: string; reason: string }) => {
      return adminFetch(`/api/admin/users/${id}/reward`, {
        method: "POST",
        body: JSON.stringify({ amount, reason }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Reward Sent", description: "Reward has been sent to user" });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to send reward", variant: "destructive" });
    },
  });

  const p2pBanMutation = useMutation({
    mutationFn: async ({ id, reason, banned }: { id: string; reason: string; banned: boolean }) => {
      return adminFetch(`/api/admin/users/${id}/p2p-ban`, {
        method: "POST",
        body: JSON.stringify({ reason, banned }),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: variables.banned ? "P2P Banned" : "P2P Unbanned",
        description: variables.banned ? "User banned from P2P trading" : "User can now use P2P trading"
      });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update P2P access", variant: "destructive" });
    },
  });

  const closeDialog = () => {
    setActionDialog(null);
    setSelectedUser(null);
    setActionReason("");
    setActionAmount("");
    setAdjustWallet("usd");
    setAdjustType("add");
    setAdjustCurrency("");
  };

  const handleAction = () => {
    if (!selectedUser) return;

    switch (actionDialog) {
      case "ban":
        banMutation.mutate({ id: selectedUser.id, reason: actionReason });
        break;
      case "unban":
        unbanMutation.mutate({ id: selectedUser.id, reason: actionReason });
        break;
      case "suspend":
        suspendMutation.mutate({ id: selectedUser.id, reason: actionReason });
        break;
      case "balance":
        balanceAdjustMutation.mutate({
          id: selectedUser.id,
          amount: actionAmount,
          type: adjustType,
          reason: actionReason,
          wallet: adjustWallet,
          currencyCode: adjustWallet === "usd" ? (adjustCurrency || currencyWalletsData?.primaryCurrency) : undefined,
        });
        break;
      case "reward":
        rewardMutation.mutate({
          id: selectedUser.id,
          amount: actionAmount,
          reason: actionReason,
        });
        break;
      case "p2pBan":
        p2pBanMutation.mutate({
          id: selectedUser.id,
          reason: actionReason,
          banned: !selectedUser.p2pBanned,
        });
        break;
    }
  };

  const openUserView = (user: UserType) => {
    setSelectedUser(user);
    setEditFormData({
      username: user.username,
      nickname: user.nickname || "",
      email: user.email || "",
      phone: user.phone || "",
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      role: user.role,
      status: user.status,
    });
    setViewUserSheet(true);
    setEditMode(false);
    setUserDataSearch("");
  };

  // When clicking a user row, mark its alert as read (if any), then open user view
  const handleUserRowClick = (user: UserType) => {
    if (unreadEntityIds.has(String(user.id))) {
      markAlertRead.mutate({ entityType: "user", entityId: String(user.id) });
    }
    openUserView(user);
  };

  const handleSaveEdit = () => {
    if (!selectedUser) return;
    updateUserMutation.mutate({
      id: selectedUser.id,
      data: editFormData,
    });
  };

  const filteredUsers = users?.filter((user: UserType) =>
    user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.email && user.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (user.phone && user.phone.includes(searchQuery))
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "default";
      case "banned": return "destructive";
      case "suspended": return "secondary";
      default: return "outline";
    }
  };

  const formatDate = (date: string | undefined) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const safeNumber = (value: string | number | undefined | null): number => {
    if (value === undefined || value === null) return 0;
    const num = typeof value === "string" ? parseFloat(value) : value;
    return isNaN(num) ? 0 : num;
  };

  const formatCurrency = (value: string | number | undefined | null): string => {
    return `$${safeNumber(value).toFixed(2)}`;
  };

  const copyReference = async (reference: string) => {
    try {
      await navigator.clipboard.writeText(reference);
      toast({ title: "Reference copied", description: reference });
    } catch {
      toast({ title: "Copy failed", description: "Could not copy reference", variant: "destructive" });
    }
  };

  const openUserSection = (target: string) => {
    if (!target || !target.startsWith("/")) return;
    window.open(target, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="min-h-[100svh] space-y-4 sm:space-y-6 p-3 sm:p-4 md:p-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">Manage all platform users</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            className="min-h-[44px] ps-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-users"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="hidden overflow-x-auto sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[300px]">User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Games</TableHead>
                    <TableHead>VIP</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-end">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers?.map((user: UserType) => {
                    const hasUnreadAlert = unreadEntityIds.has(String(user.id));
                    return (
                      <TableRow key={user.id} className={`hover-elevate cursor-pointer ${hasUnreadAlert ? 'bg-primary/5 border-s-2 border-s-primary/40' : ''}`} onClick={() => handleUserRowClick(user)}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10 shrink-0">
                              <AvatarImage src={user.profilePicture} />
                              <AvatarFallback>
                                {user.username.substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="font-medium flex items-center gap-2">
                                <span className="truncate max-w-[180px] font-semibold" dir="auto" title={user.username}>
                                  {user.username}
                                </span>
                                {user.p2pBanned && (
                                  <Badge variant="secondary" className="text-xs bg-orange-500/10 text-orange-500 shrink-0">
                                    P2P
                                  </Badge>
                                )}
                              </div>
                              {user.nickname && user.nickname !== user.username && (
                                <div className="text-xs text-muted-foreground truncate" dir="auto">
                                  {user.nickname}
                                </div>
                              )}
                              <div className="text-xs text-muted-foreground truncate">
                                {user.email || user.phone || user.id.slice(0, 8)}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusColor(user.status)} className="capitalize">
                            {user.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(user.balance)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Gamepad2 className="h-3 w-3 text-muted-foreground" />
                            {user.gamesPlayed ?? 0}
                            <Trophy className="h-3 w-3 text-yellow-500 ms-2" />
                            {user.gamesWon ?? 0}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10">
                            VIP {user.vipLevel ?? 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(user.createdAt)}
                        </TableCell>
                        <TableCell className="text-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" data-testid={`button-user-actions-${user.id}`}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openUserView(user); }}>
                                <Eye className="h-4 w-4 me-2" />
                                View Profile
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedUser(user); setActionDialog("reward"); }}>
                                <Gift className="h-4 w-4 me-2" />
                                Send Reward
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedUser(user); setActionDialog("balance"); }}>
                                <DollarSign className="h-4 w-4 me-2" />
                                Adjust Balance
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {(user.status === "banned" || user.status === "suspended") ? (
                                <DropdownMenuItem
                                  onClick={(e) => { e.stopPropagation(); setSelectedUser(user); setActionDialog("unban"); }}
                                  className="text-green-500"
                                >
                                  <Shield className="h-4 w-4 me-2" />
                                  Activate User
                                </DropdownMenuItem>
                              ) : (
                                <>
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedUser(user); setActionDialog("suspend"); }}>
                                    <Clock className="h-4 w-4 me-2" />
                                    Suspend User
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => { e.stopPropagation(); setSelectedUser(user); setActionDialog("ban"); }}
                                    className="text-destructive"
                                  >
                                    <Ban className="h-4 w-4 me-2" />
                                    Ban User
                                  </DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedUser(user); setActionDialog("p2pBan"); }}>
                                <ArrowLeftRight className="h-4 w-4 me-2" />
                                {user.p2pBanned ? "Unban P2P" : "Ban from P2P"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="space-y-3 p-3 sm:hidden">
                {filteredUsers?.map((user: UserType) => {
                  const hasUnreadAlert = unreadEntityIds.has(String(user.id));
                  return (
                    <div key={`mobile-${user.id}`} className={`rounded-lg border p-3 ${hasUnreadAlert ? 'bg-primary/5 border-primary/40' : ''}`}>
                      <div className="flex items-center justify-between gap-3">
                        <button type="button" className="flex min-w-0 items-center gap-3 text-start" onClick={() => handleUserRowClick(user)}>
                          <Avatar className="h-10 w-10 shrink-0">
                            <AvatarImage src={user.profilePicture} />
                            <AvatarFallback>
                              {user.username.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate font-semibold" dir="auto">{user.username}</p>
                            <p className="truncate text-xs text-muted-foreground">{user.email || user.phone || user.id.slice(0, 8)}</p>
                          </div>
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="min-h-[40px] min-w-[40px]" data-testid={`button-user-actions-mobile-${user.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openUserView(user); }}>
                              <Eye className="h-4 w-4 me-2" />
                              View Profile
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedUser(user); setActionDialog("reward"); }}>
                              <Gift className="h-4 w-4 me-2" />
                              Send Reward
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedUser(user); setActionDialog("balance"); }}>
                              <DollarSign className="h-4 w-4 me-2" />
                              Adjust Balance
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="capitalize">{user.role}</Badge>
                        <Badge variant={getStatusColor(user.status)} className="capitalize">{user.status}</Badge>
                        <Badge variant="outline">{formatCurrency(user.balance)}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredUsers?.length === 0 && (
                <div className="p-6 text-center text-muted-foreground">
                  No users found
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={viewUserSheet} onOpenChange={setViewUserSheet}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader>
            <div className="flex items-center justify-between">
              <SheetTitle>User Profile</SheetTitle>
              {!editMode ? (
                <Button variant="outline" size="sm" onClick={() => setEditMode(true)} data-testid="button-edit-user">
                  <Edit className="h-4 w-4 me-2" />
                  Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>
                    <X className="h-4 w-4 me-2" />
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSaveEdit} disabled={updateUserMutation.isPending} data-testid="button-save-user">
                    <Check className="h-4 w-4 me-2" />
                    Save
                  </Button>
                </div>
              )}
            </div>
          </SheetHeader>

          {selectedUser && (
            <div className="mt-6 space-y-6">
              <div className="space-y-2">
                <Label>User-scoped Search</Label>
                <div className="relative">
                  <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="min-h-[44px] ps-10"
                    placeholder="Search profile fields, references, and financial activity for this user"
                    value={userDataSearch}
                    onChange={(event) => setUserDataSearch(event.target.value)}
                    data-testid="input-user-financial-search"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Indexed User Data
                </h4>
                {selectedUserOverviewLoading ? (
                  <div className="rounded-lg border p-4 text-sm text-muted-foreground">Loading indexed user data...</div>
                ) : !selectedUserOverview?.profileIndex?.length ? (
                  <div className="rounded-lg border p-4 text-sm text-muted-foreground">No indexed fields matched this user filter.</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedUserOverview.profileIndex.map((item) => (
                      <div key={item.key} className="rounded border p-2">
                        <p className="text-[11px] text-muted-foreground">{item.label}</p>
                        <p className="text-sm font-medium break-words" dir="auto">{item.value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Tabs defaultValue="profile" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="profile" data-testid="tab-profile">Profile</TabsTrigger>
                  <TabsTrigger value="balances" data-testid="tab-balances">Balances</TabsTrigger>
                  <TabsTrigger value="activity" data-testid="tab-activity">Activity</TabsTrigger>
                  <TabsTrigger value="account" data-testid="tab-account">Account</TabsTrigger>
                </TabsList>

                <TabsContent value="profile" className="mt-4 space-y-6">
              <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={selectedUser.profilePicture} />
                  <AvatarFallback className="text-xl">
                    {(selectedUser.nickname || selectedUser.username).substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold truncate" dir="auto">{selectedUser.nickname || selectedUser.username}</h3>
                  {selectedUser.nickname && selectedUser.nickname !== selectedUser.username && (
                    <p className="text-sm text-muted-foreground" dir="auto">@{selectedUser.username}</p>
                  )}
                  {!selectedUser.nickname && (selectedUser.firstName || selectedUser.lastName) && (
                    <p className="text-sm text-muted-foreground" dir="auto">{`${selectedUser.firstName || ''} ${selectedUser.lastName || ''}`.trim()}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={getStatusColor(selectedUser.status)}>
                      {selectedUser.status}
                    </Badge>
                    <Badge variant="outline">{selectedUser.role}</Badge>
                    <Badge variant="outline" className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10">
                      VIP {selectedUser.vipLevel ?? 0}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Profile Information
                </h4>

                <div className="grid gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Username</Label>
                      {editMode ? (
                        <Input
                          value={editFormData.username || ""}
                          onChange={(e) => setEditFormData({ ...editFormData, username: e.target.value })}
                          data-testid="input-edit-username"
                        />
                      ) : (
                        <div className="p-2 bg-muted rounded text-sm">{selectedUser.username}</div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Nickname</Label>
                      {editMode ? (
                        <Input
                          value={editFormData.nickname || ""}
                          onChange={(e) => setEditFormData({ ...editFormData, nickname: e.target.value })}
                          data-testid="input-edit-nickname"
                        />
                      ) : (
                        <div className="p-2 bg-muted rounded text-sm">{selectedUser.nickname || "-"}</div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>First Name</Label>
                      {editMode ? (
                        <Input
                          value={editFormData.firstName || ""}
                          onChange={(e) => setEditFormData({ ...editFormData, firstName: e.target.value })}
                          data-testid="input-edit-firstname"
                        />
                      ) : (
                        <div className="p-2 bg-muted rounded text-sm">{selectedUser.firstName || "-"}</div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Last Name</Label>
                      {editMode ? (
                        <Input
                          value={editFormData.lastName || ""}
                          onChange={(e) => setEditFormData({ ...editFormData, lastName: e.target.value })}
                          data-testid="input-edit-lastname"
                        />
                      ) : (
                        <div className="p-2 bg-muted rounded text-sm">{selectedUser.lastName || "-"}</div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        Email
                      </Label>
                      {editMode ? (
                        <Input
                          type="email"
                          value={editFormData.email || ""}
                          onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                          data-testid="input-edit-email"
                        />
                      ) : (
                        <div className="p-2 bg-muted rounded text-sm">{selectedUser.email || "-"}</div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        Phone
                      </Label>
                      {editMode ? (
                        <Input
                          value={editFormData.phone || ""}
                          onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                          data-testid="input-edit-phone"
                        />
                      ) : (
                        <div className="p-2 bg-muted rounded text-sm">{selectedUser.phone || "-"}</div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        <Shield className="h-3 w-3" />
                        Role
                      </Label>
                      {editMode ? (
                        <Select
                          value={editFormData.role}
                          onValueChange={(v) => setEditFormData({ ...editFormData, role: v })}
                        >
                          <SelectTrigger data-testid="select-edit-role">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="player">Player</SelectItem>
                            <SelectItem value="agent">Agent</SelectItem>
                            <SelectItem value="affiliate">Affiliate</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="p-2 bg-muted rounded text-sm capitalize">{selectedUser.role}</div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      {editMode ? (
                        <Select
                          value={editFormData.status}
                          onValueChange={(v) => setEditFormData({ ...editFormData, status: v })}
                        >
                          <SelectTrigger data-testid="select-edit-status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                            <SelectItem value="suspended">Suspended</SelectItem>
                            <SelectItem value="banned">Banned</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="p-2 bg-muted rounded text-sm capitalize">{selectedUser.status}</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
                </TabsContent>

                <TabsContent value="balances" className="mt-4 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground">Primary Balance (USD)</div>
                  <div className="text-2xl font-bold text-primary" data-testid="text-balance-usd">
                    {formatCurrency(selectedUserOverview?.metrics?.fiatBalance ?? selectedUser.balance)}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground">Project Currency (VXC)</div>
                  <div className="text-2xl font-bold text-primary" data-testid="text-balance-vxc">
                    {safeNumber(selectedUserOverview?.projectWallet?.totalBalance ?? 0).toFixed(2)}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground">Games W / P</div>
                  <div className="text-2xl font-bold text-yellow-500">
                    {selectedUser.gamesWon ?? 0} / {selectedUser.gamesPlayed ?? 0}
                  </div>
                </Card>
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Financial Summary
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-xs text-muted-foreground">Total Deposited</div>
                    <div className="font-semibold text-green-500">
                      {formatCurrency(selectedUser.totalDeposited)}
                    </div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-xs text-muted-foreground">Total Withdrawn</div>
                    <div className="font-semibold text-red-500">
                      {formatCurrency(selectedUser.totalWithdrawn)}
                    </div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-xs text-muted-foreground">Total Wagered</div>
                    <div className="font-semibold">
                      {formatCurrency(selectedUser.totalWagered)}
                    </div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-xs text-muted-foreground">Total Won</div>
                    <div className="font-semibold text-yellow-500">
                      {formatCurrency(selectedUser.totalWon)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-xs text-muted-foreground">Real Currency Net (credits - debits)</div>
                    <div className={`font-semibold ${safeNumber(selectedUserOverview?.metrics?.fiatNet) >= 0 ? "text-green-500" : "text-red-500"}`}>
                      {formatCurrency(selectedUserOverview?.metrics?.fiatNet || 0)}
                    </div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-xs text-muted-foreground">Project Currency Net (credits - debits)</div>
                    <div className={`font-semibold ${safeNumber(selectedUserOverview?.metrics?.projectNet) >= 0 ? "text-green-500" : "text-red-500"}`}>
                      {safeNumber(selectedUserOverview?.metrics?.projectNet).toFixed(2)} VEX
                    </div>
                  </div>
                </div>

                {selectedUserOverview?.projectWallet && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="text-xs text-muted-foreground">Project Wallet Total</div>
                      <div className="font-semibold text-primary">{safeNumber(selectedUserOverview.projectWallet.totalBalance).toFixed(2)} VEX</div>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="text-xs text-muted-foreground">Purchased Balance</div>
                      <div className="font-semibold">{safeNumber(selectedUserOverview.projectWallet.purchasedBalance).toFixed(2)} VEX</div>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="text-xs text-muted-foreground">Earned Balance</div>
                      <div className="font-semibold">{safeNumber(selectedUserOverview.projectWallet.earnedBalance).toFixed(2)} VEX</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Multi-currency wallet management */}
              <div className="space-y-4 border-t pt-6">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold flex items-center gap-2">
                    <ArrowLeftRight className="h-4 w-4" />
                    Multi-Currency Wallets
                  </h4>
                  <Badge variant={multiCurrencyEnabled ? "default" : "outline"}>
                    {multiCurrencyEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>

                <div className="rounded-lg border p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-sm">Allow this user to hold multiple currencies</div>
                      <div className="text-xs text-muted-foreground">
                        Primary currency: <span className="font-mono">{currencyWalletsData?.primaryCurrency || selectedUser.balanceCurrency || "USD"}</span>. Sub-wallets are credited only when admin-approved.
                      </div>
                    </div>
                    <Switch
                      data-testid="switch-multi-currency"
                      checked={multiCurrencyEnabled}
                      onCheckedChange={(value) => setMultiCurrencyEnabled(value)}
                    />
                  </div>

                  {multiCurrencyEnabled && (
                    <div className="space-y-2">
                      <Label className="text-xs">Allowed currencies (besides primary)</Label>
                      <Input
                        placeholder="Filter currencies (e.g. EGP, EUR)..."
                        value={multiCurrencySearch}
                        onChange={(e) => setMultiCurrencySearch(e.target.value)}
                        className="h-9"
                        data-testid="input-currency-filter"
                      />
                      <div className="max-h-40 overflow-y-auto rounded border bg-muted/40 p-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
                        {WORLD_CURRENCIES
                          .filter((c) => c.code !== (currencyWalletsData?.primaryCurrency || "USD"))
                          .filter((c) => {
                            const q = multiCurrencySearch.trim().toUpperCase();
                            if (!q) return true;
                            return c.code.includes(q) || c.name.toUpperCase().includes(q);
                          })
                          .map((c) => {
                            const checked = multiCurrencyAllowList.includes(c.code);
                            return (
                              <label
                                key={c.code}
                                className={`flex items-center gap-2 text-xs cursor-pointer p-1 rounded hover:bg-muted ${checked ? "bg-primary/10" : ""}`}
                              >
                                <input
                                  type="checkbox"
                                  data-testid={`checkbox-currency-${c.code}`}
                                  checked={checked}
                                  onChange={(e) => {
                                    setMultiCurrencyAllowList((prev) =>
                                      e.target.checked
                                        ? [...prev, c.code]
                                        : prev.filter((x) => x !== c.code),
                                    );
                                  }}
                                />
                                <span className="font-mono">{c.code}</span>
                                <span className="text-muted-foreground truncate">{c.name}</span>
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (currencyWalletsData) {
                          setMultiCurrencyEnabled(currencyWalletsData.multiCurrencyEnabled);
                          setMultiCurrencyAllowList(
                            (currencyWalletsData.allowedCurrencies || []).filter((c) => c !== currencyWalletsData.primaryCurrency),
                          );
                        }
                      }}
                      data-testid="button-reset-multi-currency"
                    >
                      Reset
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => multiCurrencyMutation.mutate({
                        id: selectedUser.id,
                        enabled: multiCurrencyEnabled,
                        allowedCurrencies: multiCurrencyAllowList,
                      })}
                      disabled={multiCurrencyMutation.isPending}
                      data-testid="button-save-multi-currency"
                    >
                      {multiCurrencyMutation.isPending ? "Saving..." : "Save Settings"}
                    </Button>
                  </div>
                </div>

                {currencyWalletsData?.wallets && currencyWalletsData.wallets.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Per-currency balances</div>
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-24">Currency</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead className="text-right">Balance</TableHead>
                            <TableHead className="text-right w-44">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {currencyWalletsData.wallets.map((w) => {
                            const meta = WORLD_CURRENCIES.find((c) => c.code === w.currency);
                            const symbol = meta?.symbol || w.currency;
                            return (
                              <TableRow key={w.currency} data-testid={`row-wallet-${w.currency}`}>
                                <TableCell className="font-mono">{w.currency}</TableCell>
                                <TableCell>
                                  <Badge variant={w.isPrimary ? "default" : "outline"}>
                                    {w.isPrimary ? "Primary" : (w.isAllowed ? "Allowed" : "Legacy")}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-semibold" data-testid={`text-balance-${w.currency}`}>
                                  {symbol} {Number.parseFloat(w.balance).toFixed(2)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setActionDialog("balance");
                                      setAdjustWallet("usd");
                                      setAdjustCurrency(w.currency);
                                    }}
                                    data-testid={`button-adjust-${w.currency}`}
                                  >
                                    Adjust
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>

                </TabsContent>

                <TabsContent value="activity" className="mt-4 space-y-6">
              <div className="space-y-4">
                <h4 className="font-semibold flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Financial Movement Log
                </h4>

                {selectedUserOverviewLoading ? (
                  <div className="rounded-lg border p-4 text-sm text-muted-foreground">Loading financial movement log...</div>
                ) : !selectedUserOverview?.financialTimeline?.length ? (
                  <div className="rounded-lg border p-4 text-sm text-muted-foreground">No financial movements found for this user/filter.</div>
                ) : (
                  <div className="space-y-2 max-h-[340px] overflow-y-auto">
                    {selectedUserOverview.financialTimeline.map((entry) => (
                      <div key={entry.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge variant={entry.signedAmount >= 0 ? "default" : "destructive"}>
                              {entry.signedAmount >= 0 ? "credit" : "debit"}
                            </Badge>
                            <Badge variant="outline">{entry.source === "project" ? "project currency" : "real currency"}</Badge>
                            <Badge variant="outline">{entry.type}</Badge>
                          </div>
                          <div className={`font-semibold ${entry.signedAmount >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {entry.signedAmount >= 0 ? "+" : "-"}
                            {entry.absoluteAmount.toFixed(2)} {entry.currencyCode}
                          </div>
                        </div>

                        <div className="mt-2 text-sm text-muted-foreground">
                          {entry.description || "No description"}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>Before: {entry.balanceBefore.toFixed(2)}</span>
                          <span>After: {entry.balanceAfter.toFixed(2)}</span>
                          <span>Status: {entry.status}</span>
                          <span>{new Date(entry.createdAt).toLocaleString()}</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => openUserSection(entry.link || "/transactions")}
                          >
                            Open Section
                          </Button>
                        </div>

                        <div className="mt-2 inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/5 px-2 py-1 text-xs">
                          <span className="font-medium text-primary">Ref:</span>
                          <span className="font-mono">{entry.reference}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() => copyReference(entry.reference)}
                            data-testid={`button-copy-financial-ref-${entry.id}`}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold flex items-center gap-2">
                  <Gift className="h-4 w-4" />
                  Financial Notifications
                </h4>

                {selectedUserOverviewLoading ? (
                  <div className="rounded-lg border p-4 text-sm text-muted-foreground">Loading transaction notifications...</div>
                ) : !selectedUserOverview?.transactionNotifications?.length ? (
                  <div className="rounded-lg border p-4 text-sm text-muted-foreground">No financial notifications found for this user/filter.</div>
                ) : (
                  <div className="space-y-2 max-h-[260px] overflow-y-auto">
                    {selectedUserOverview.transactionNotifications.map((item) => (
                      <div key={item.id} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">{item.title}</p>
                            <p className="text-xs text-muted-foreground">{item.message}</p>
                          </div>
                          <Badge variant={item.isRead ? "outline" : "default"}>{item.isRead ? "read" : "unread"}</Badge>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>Priority: {item.priority}</span>
                          <span>{new Date(item.createdAt).toLocaleString()}</span>
                          <span>Link: {item.link || "/transactions"}</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => openUserSection(item.link || "/transactions")}
                          >
                            Open Section
                          </Button>
                        </div>

                        <div className="mt-2 inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/5 px-2 py-1 text-xs">
                          <span className="font-medium text-primary">Ref:</span>
                          <span className="font-mono">{item.reference}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() => copyReference(item.reference)}
                            data-testid={`button-copy-notification-ref-${item.id}`}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

                </TabsContent>

                <TabsContent value="account" className="mt-4 space-y-6">
              <div className="space-y-4">
                <h4 className="font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Account Info
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-xs text-muted-foreground">Joined</div>
                    <div className="font-semibold">{formatDate(selectedUser.createdAt)}</div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-xs text-muted-foreground">Last Login</div>
                    <div className="font-semibold">{formatDate(selectedUser.lastLoginAt)}</div>
                  </div>
                </div>
              </div>

              {selectedUser.p2pBanned && (
                <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                  <div className="flex items-center gap-2 text-orange-500 font-semibold">
                    <ArrowLeftRight className="h-4 w-4" />
                    P2P Trading Banned
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedUser.p2pBanReason || "No reason specified"}
                  </p>
                  {selectedUser.p2pBannedAt && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Banned on {formatDate(selectedUser.p2pBannedAt)}
                    </p>
                  )}
                </div>
              )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={actionDialog !== null} onOpenChange={() => closeDialog()}>
        <DialogContent className="max-w-[calc(100vw-0.75rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {actionDialog === "ban" && "Ban User"}
              {actionDialog === "unban" && "Activate User"}
              {actionDialog === "suspend" && "Suspend User"}
              {actionDialog === "balance" && "Adjust Balance"}
              {actionDialog === "reward" && "Send Reward"}
              {actionDialog === "p2pBan" && (selectedUser?.p2pBanned ? "Unban P2P Access" : "Ban from P2P")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {selectedUser && (
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <Avatar>
                  <AvatarImage src={selectedUser.profilePicture} />
                  <AvatarFallback>{selectedUser.username.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{selectedUser.username}</p>
                  <p className="text-sm text-muted-foreground">
                    Current Balance: {formatCurrency(selectedUser.balance)}
                  </p>
                </div>
              </div>
            )}

            {actionDialog === "balance" && (
              <div className="space-y-2">
                <Label>Wallet</Label>
                <Select value={adjustWallet} onValueChange={(v: "usd" | "vxc") => setAdjustWallet(v)}>
                  <SelectTrigger data-testid="select-adjust-wallet">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usd">Real Currency Balance</SelectItem>
                    <SelectItem value="vxc">Project Currency (VXC)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {actionDialog === "balance" && adjustWallet === "usd" && currencyWalletsData && (
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={adjustCurrency || currencyWalletsData.primaryCurrency} onValueChange={(v: string) => setAdjustCurrency(v)}>
                  <SelectTrigger data-testid="select-adjust-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={currencyWalletsData.primaryCurrency}>
                      {currencyWalletsData.primaryCurrency} (Primary)
                    </SelectItem>
                    {currencyWalletsData.allowedCurrencies
                      .filter((c) => c !== currencyWalletsData.primaryCurrency)
                      .map((code) => (
                        <SelectItem key={code} value={code}>{code}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(actionDialog === "balance" || actionDialog === "reward") && (
              <div className="space-y-2">
                <Label>
                  Amount {actionDialog === "balance"
                    ? adjustWallet === "vxc"
                      ? "(VXC)"
                      : `(${adjustCurrency || currencyWalletsData?.primaryCurrency || "USD"})`
                    : "($)"}
                </Label>
                <Input
                  type="number"
                  placeholder="Enter amount"
                  value={actionAmount}
                  onChange={(e) => setActionAmount(e.target.value)}
                  data-testid="input-action-amount"
                />
              </div>
            )}

            {actionDialog === "balance" && (
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={adjustType} onValueChange={(v: "add" | "subtract") => setAdjustType(v)}>
                  <SelectTrigger data-testid="select-adjust-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add">Credit (Add)</SelectItem>
                    <SelectItem value="subtract">Debit (Subtract)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Reason / Notes</Label>
              <Textarea
                placeholder="Enter reason for this action..."
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                data-testid="input-action-reason"
              />
            </div>
          </div>

          <DialogFooter>
            <Button className="min-h-[44px]" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              className="min-h-[44px]"
              onClick={handleAction}
              variant={actionDialog === "ban" ? "destructive" : actionDialog === "unban" ? "default" : "default"}
              disabled={
                !actionReason ||
                ((actionDialog === "balance" || actionDialog === "reward") && !actionAmount)
              }
              data-testid="button-confirm-action"
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
