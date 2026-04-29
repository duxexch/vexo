import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { adminFetch } from "@/lib/admin-api";
import {
  Users,
  DollarSign,
  Gamepad2,
  AlertTriangle,
  TrendingUp,
  Search,
  Copy,
  Settings,
  Palette,
  Shield,
  BarChart3,
  Activity,
  Wifi,
  Trophy,
  ArrowUpRight,
  ArrowDownRight,
  UserCheck,
  UserX,
  Clock,
  Zap,
  Target,
  Eye,
  Edit,
  Trash2,
  Download,
  Upload,
  Filter,
  Bell,
  Lock,
  Unlock,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  MoreVertical,
} from "lucide-react";

interface SuperAdminStats {
  totalUsers: number;
  activeUsers: number;
  newUsersToday: number;
  totalRevenue: number;
  revenueToday: number;
  activeGames: number;
  totalGames: number;
  totalTournaments: number;
  activeTournaments: number;
  totalAgents: number;
  activeAgents: number;
  totalTransactions: number;
  transactionsToday: number;
  systemHealth: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    uptime: number;
    errorRate: number;
  };
}

interface UserSegment {
  id: string;
  name: string;
  count: number;
  revenue: number;
  growth: number;
  description: string;
}

interface SystemAlert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

interface UserRole {
  id: string;
  name: string;
  permissions: string[];
  userCount: number;
  canManageUsers: boolean;
  canManageGames: boolean;
  canManageTournaments: boolean;
  canViewAnalytics: boolean;
  canManageSystem: boolean;
}

export default function SuperAdminDashboard() {
  const { language, dir } = useI18n();
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<SuperAdminStats>({
    queryKey: ["/api/admin/super-stats"],
    queryFn: () => adminFetch("/api/admin/super-stats"),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["/api/admin/users", searchQuery],
    queryFn: () => adminFetch(`/api/admin/users${searchQuery ? `?search=${searchQuery}` : ""}`),
  });

  const { data: segments, isLoading: segmentsLoading } = useQuery({
    queryKey: ["/api/admin/user-segments"],
    queryFn: () => adminFetch("/api/admin/user-segments"),
  });

  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ["/api/admin/roles"],
    queryFn: () => adminFetch("/api/admin/roles"),
  });

  const { data: alerts, isLoading: alertsLoading } = useQuery<SystemAlert[]>({
    queryKey: ["/api/admin/alerts"],
    queryFn: () => adminFetch("/api/admin/alerts"),
  });

  const isAr = language === "ar";

  const handleUserAction = async (userId: string, action: string) => {
    try {
      await adminFetch(`/api/admin/users/${userId}/${action}`, { method: "POST" });
      toast({
        title: isAr ? "تمت العملية" : "Action completed",
        description: isAr ? `تم ${action} المستخدم` : `User ${action} completed`,
      });
      // Refresh users list
      window.location.reload();
    } catch (error) {
      toast({
        title: isAr ? "فشلت العملية" : "Action failed",
        description: isAr ? "حدث خطأ أثناء تنفيذ العملية" : "Error occurred while performing action",
        variant: "destructive",
      });
    }
  };

  const handleAlertAction = async (alertId: string, action: string) => {
    try {
      await adminFetch(`/api/admin/alerts/${alertId}/${action}`, { method: "POST" });
      toast({
        title: isAr ? "تمت العملية" : "Action completed",
        description: isAr ? `تم ${action} التنبيه` : `Alert ${action} completed`,
      });
    } catch (error) {
      toast({
        title: isAr ? "فشلت العملية" : "Action failed",
        description: isAr ? "حدث خطأ أثناء تنفيذ العملية" : "Error occurred while performing action",
        variant: "destructive",
      });
    }
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case "critical": return "text-red-600 bg-red-50 border-red-200";
      case "warning": return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "info": return "text-blue-600 bg-blue-50 border-blue-200";
      default: return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  const getSystemHealthStatus = () => {
    if (!stats?.systemHealth) return { status: "unknown", color: "text-gray-500" };
    
    const { cpuUsage, memoryUsage, diskUsage, errorRate } = stats.systemHealth;
    
    if (errorRate > 5 || cpuUsage > 90 || memoryUsage > 90 || diskUsage > 90) {
      return { status: "critical", color: "text-red-500" };
    } else if (errorRate > 2 || cpuUsage > 70 || memoryUsage > 70 || diskUsage > 70) {
      return { status: "warning", color: "text-yellow-500" };
    } else {
      return { status: "healthy", color: "text-green-500" };
    }
  };

  const systemHealth = getSystemHealthStatus();

  return (
    <div className="min-h-screen bg-background" dir={dir}>
      {/* Header */}
      <header className="border-b bg-card/90 backdrop-blur px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 space-x-reverse">
            <h1 className="text-2xl font-bold text-foreground">
              {isAr ? "لوحة الإدارة الفائقة" : "Super Admin Dashboard"}
            </h1>
            <Badge variant="secondary" className="text-xs">
              {isAr ? "مشرف عام" : "Super Admin"}
            </Badge>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.href = '/admin'}
            >
              <Settings className="h-4 w-4" />
              {isAr ? "الإعدادات" : "Settings"}
            </Button>
            
            <div className="relative">
              <Bell className="h-4 w-4 text-muted-foreground" />
              {alerts?.filter(a => !a.acknowledged).length > 0 && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* System Health Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              {isAr ? "نظرة عامة على النظام" : "System Overview"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* System Health */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{isAr ? "صحة النظام" : "System Health"}</span>
                  <Badge className={systemHealth.color}>
                    {systemHealth.status === "critical" && (isAr ? "حرج" : "Critical")}
                    {systemHealth.status === "warning" && (isAr ? "تحذير" : "Warning")}
                    {systemHealth.status === "healthy" && (isAr ? "سليم" : "Healthy")}
                    {systemHealth.status === "unknown" && (isAr ? "غير معروف" : "Unknown")}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {isAr ? "استخدام المعالج: " : "CPU: "}{Math.round(stats?.systemHealth?.cpuUsage || 0)}%
                </div>
                <div className="text-xs text-muted-foreground">
                  {isAr ? "استخدام الذاكرة: " : "Memory: "}{Math.round(stats?.systemHealth?.memoryUsage || 0)}%
                </div>
                <div className="text-xs text-muted-foreground">
                  {isAr ? "معدل الخطأ: " : "Error Rate: "}{stats?.systemHealth?.errorRate || 0}/h
                </div>
              </div>

              {/* Quick Stats */}
              <div className="space-y-2">
                <div className="text-sm font-medium">{isAr ? "إحصائيات سريعة" : "Quick Stats"}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">{isAr ? "المستخدمون:" : "Users:"}</span>
                    <span className="font-bold">{stats?.totalUsers?.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{isAr ? "نشطون:" : "Active:"}</span>
                    <span className="font-bold text-green-600">{stats?.activeUsers?.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{isAr ? "إيرادات اليوم:" : "Today's Revenue:"}</span>
                    <span className="font-bold text-green-600">${stats?.revenueToday?.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{isAr ? "المعاملات:" : "Transactions:"}</span>
                    <span className="font-bold">{stats?.transactionsToday?.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Games & Tournaments */}
              <div className="space-y-2">
                <div className="text-sm font-medium">{isAr ? "الألعاب والبطولات" : "Games & Tournaments"}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">{isAr ? "الألعاب:" : "Games:"}</span>
                    <span className="font-bold">{stats?.totalGames}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{isAr ? "نشطة:" : "Active:"}</span>
                    <span className="font-bold text-green-600">{stats?.activeGames}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{isAr ? "البطولات:" : "Tournaments:"}</span>
                    <span className="font-bold">{stats?.totalTournaments}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{isAr ? "نشطة:" : "Active:"}</span>
                    <span className="font-bold text-green-600">{stats?.activeTournaments}</span>
                  </div>
                </div>
              </div>

              {/* Agents */}
              <div className="space-y-2">
                <div className="text-sm font-medium">{isAr ? "الوكلاء" : "Agents"}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">{isAr ? "الإجمالي:" : "Total:"}</span>
                    <span className="font-bold">{stats?.totalAgents}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{isAr ? "نشطون:" : "Active:"}</span>
                    <span className="font-bold text-green-600">{stats?.activeAgents}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Detailed Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              {isAr ? "نظرة عامة" : "Overview"}
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              {isAr ? "المستخدمون" : "Users"}
              {users?.filter(u => u.status === 'suspended').length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {users.filter(u => u.status === 'suspended').length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="segments" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              {isAr ? "الشرائح" : "Segments"}
            </TabsTrigger>
            <TabsTrigger value="roles" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              {isAr ? "الصلاحيات" : "Roles"}
            </TabsTrigger>
            <TabsTrigger value="alerts" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              {isAr ? "التنبيهات" : "Alerts"}
              {alerts?.filter(a => !a.acknowledged).length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {alerts.filter(a => !a.acknowledged).length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Revenue Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    {isAr ? "تحليل الإيرادات" : "Revenue Analytics"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">{isAr ? "إجمالي الإيرادات" : "Total Revenue"}</span>
                      <span className="text-2xl font-bold">{stats?.totalRevenue?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">{isAr ? "إيرادات اليوم" : "Today's Revenue"}</span>
                      <span className="text-xl font-bold text-green-600">{stats?.revenueToday?.toLocaleString()}</span>
                    </div>
                    <Progress value={stats?.revenueToday / (stats?.totalRevenue || 1) * 100} className="h-2" />
                    <div className="text-xs text-muted-foreground mt-2">
                      {isAr ? "نمو الإيرادات: " : "Growth: "}
                      <TrendingUp className="inline h-3 w-3 text-green-500" />
                      +12.5% {isAr ? "هذا الشهر" : "this month"}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* User Activity */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    {isAr ? "نشاط المستخدمين" : "User Activity"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">{isAr ? "مستخدمون جدد" : "New Users Today"}</span>
                      <span className="text-2xl font-bold text-blue-600">{stats?.newUsersToday?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">{isAr ? "معدل التفعيل" : "Activation Rate"}</span>
                      <span className="text-lg font-bold">87.3%</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      {isAr ? "أعلى من المتوسط" : "Above industry average"}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    {isAr ? "إدارة المستخدمين" : "User Management"}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder={isAr ? "بحث عن مستخدم..." : "Search users..."}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-64"
                    />
                    <Button variant="outline" size="sm">
                      <Filter className="h-4 w-4" />
                      {isAr ? "فلترة" : "Filter"}
                    </Button>
                    <Button size="sm">
                      <Download className="h-4 w-4" />
                      {isAr ? "تصدير" : "Export"}
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">{isAr ? "المستخدم" : "User"}</TableHead>
                      <TableHead className="text-right">{isAr ? "البريد" : "Email"}</TableHead>
                      <TableHead className="text-right">{isAr ? "الحالة" : "Status"}</TableHead>
                      <TableHead className="text-right">{isAr ? "الرصيد" : "Balance"}</TableHead>
                      <TableHead className="text-right">{isAr ? "آخر نشاط" : "Last Active"}</TableHead>
                      <TableHead className="text-right">{isAr ? "مسجل" : "Registered"}</TableHead>
                      <TableHead className="text-right">{isAr ? "الإجراءات" : "Actions"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersLoading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8">
                          {isAr ? "جاري التحميل..." : "Loading..."}
                        </TableCell>
                      </TableRow>
                    ) : users?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8">
                          {isAr ? "لا يوجد مستخدمون" : "No users found"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">{user.username}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>
                            <Badge variant={user.status === 'active' ? 'default' : user.status === 'suspended' ? 'destructive' : 'secondary'}>
                              {user.status === 'active' && (isAr ? 'نشط' : 'Active')}
                              {user.status === 'suspended' && (isAr ? 'معلق' : 'Suspended')}
                              {user.status === 'banned' && (isAr ? 'محظور' : 'Banned')}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono">${user.balance}</TableCell>
                          <TableCell>{user.lastActive}</TableCell>
                          <TableCell>{user.registeredAt}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedUser(user.id)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleUserAction(user.id, 'edit')}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant={user.status === 'active' ? 'destructive' : 'default'}
                                onClick={() => handleUserAction(user.id, user.status === 'active' ? 'suspend' : 'activate')}
                              >
                                {user.status === 'active' ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleUserAction(user.id, 'delete')}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Segments Tab */}
          <TabsContent value="segments" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {segmentsLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <div className="animate-pulse">
                        <div className="h-4 w-4 bg-muted rounded mb-4"></div>
                        <div className="h-4 w-64 bg-muted rounded"></div>
                        <div className="h-4 w-48 bg-muted rounded"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                segments?.map((segment) => (
                  <Card key={segment.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>{segment.name}</span>
                        <Badge variant="secondary">{segment.count.toLocaleString()}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">{isAr ? "الإيرادات" : "Revenue"}</span>
                          <span className="font-bold">${segment.revenue.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">{isAr ? "النمو" : "Growth"}</span>
                          <span className={`font-bold ${segment.growth > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {segment.growth > 0 ? '+' : ''}{segment.growth.toFixed(1)}%
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {segment.description}
                        </div>
                        <div className="flex justify-between mt-4">
                          <Button size="sm" variant="outline">
                            <Target className="h-4 w-4" />
                            {isAr ? "استهداف" : "Target"}
                          </Button>
                          <Button size="sm">
                            <MoreVertical className="h-4 w-4" />
                            {isAr ? "خيارات" : "Options"}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Roles Tab */}
          <TabsContent value="roles" className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">{isAr ? "إدارة الصلاحيات" : "Role Management"}</h3>
              <Button onClick={() => setShowRoleModal(true)}>
                <Plus className="h-4 w-4" />
                {isAr ? "إضافة دور" : "Add Role"}
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rolesLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <div className="animate-pulse">
                        <div className="h-4 w-4 bg-muted rounded mb-2"></div>
                        <div className="h-4 w-32 bg-muted rounded"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                roles?.map((role) => (
                  <Card key={role.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          <span>{role.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{role.userCount.toLocaleString()}</Badge>
                          <Button size="sm" variant="outline">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">{isAr ? "إدارة المستخدمين:" : "Manage Users"}</span>
                            <div className="flex items-center gap-1">
                              {role.canManageUsers ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{isAr ? "إدارة الألعاب:" : "Manage Games"}</span>
                            <div className="flex items-center gap-1">
                              {role.canManageGames ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">{isAr ? "إدارة البطولات:" : "Manage Tournaments"}</span>
                            <div className="flex items-center gap-1">
                              {role.canManageTournaments ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{isAr ? "عرض التحليلات:" : "View Analytics"}</span>
                            <div className="flex items-center gap-1">
                              {role.canViewAnalytics ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{isAr ? "إدارة النظام:" : "System Admin"}</span>
                            <div className="flex items-center gap-1">
                              {role.canManageSystem ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground mt-4">
                          <span className="font-medium">{isAr ? "الصلاحيات:" : "Permissions:"}</span>
                          <div className="flex flex-wrap gap-1">
                            {role.permissions.map((permission) => (
                              <Badge key={permission} variant="outline" className="text-xs">
                                {permission}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="flex justify-between mt-4">
                          <Button size="sm" variant="outline">
                            <Users className="h-4 w-4" />
                            {isAr ? "المستخدمون" : "Users"}
                          </Button>
                          <Button size="sm">
                            <Edit className="h-4 w-4" />
                            {isAr ? "تعديل" : "Edit"}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Alerts Tab */}
          <TabsContent value="alerts" className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">{isAr ? "التنبيهات النظام" : "System Alerts"}</h3>
              <div className="flex items-center gap-2">
                <Badge variant={alerts?.filter(a => !a.acknowledged).length > 0 ? "destructive" : "secondary"}>
                  {alerts?.filter(a => !a.acknowledged).length} {isAr ? "غير معالج" : "Unacknowledged"}
                </Badge>
                <Button onClick={() => setShowAlertModal(true)}>
                  <Plus className="h-4 w-4" />
                  {isAr ? "إنشاء تنبيه" : "Create Alert"}
                </Button>
              </div>
            </div>
            
            <div className="space-y-4">
              {alertsLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <div className="animate-pulse">
                        <div className="h-4 w-4 bg-muted rounded mb-2"></div>
                        <div className="h-4 w-48 bg-muted rounded"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : alerts?.length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      {isAr ? "لا توجد تنبيهات حالياً" : "No alerts at this time"}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                alerts.map((alert) => (
                  <Card key={alert.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${getAlertColor(alert.type).split(' ')[0]}`} />
                          <div>
                            <div className="font-medium">{alert.title}</div>
                            <div className="text-sm text-muted-foreground">{alert.timestamp}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getAlertColor(alert.type)}>
                            {alert.type}
                          </Badge>
                          {!alert.acknowledged && (
                            <Button size="sm" variant="outline">
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        {alert.message}
                      </div>
                      {!alert.acknowledged && (
                        <div className="flex justify-end mt-4">
                          <Button size="sm" onClick={() => handleAlertAction(alert.id, 'acknowledge')}>
                            {isAr ? "تأكيد" : "Acknowledge"}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* User Detail Modal */}
      {showUserModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 max-w-2xl w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">{isAr ? "تفاصيل المستخدم" : "User Details"}</h3>
              <Button variant="ghost" onClick={() => setShowUserModal(false)}>
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
            {/* User details content */}
            <div className="text-center text-muted-foreground">
              {isAr ? "تفاصيل المستخدم هنا" : "User details would appear here"}
            </div>
          </div>
        </div>
      )}

      {/* Role Modal */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">{isAr ? "إنشاء دور جديد" : "Create New Role"}</h3>
              <Button variant="ghost" onClick={() => setShowRoleModal(false)}>
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
            {/* Role creation form */}
            <div className="text-center text-muted-foreground">
              {isAr ? "نموذج إنشاء الدور هنا" : "Role creation form would appear here"}
            </div>
          </div>
        </div>
      )}

      {/* Alert Modal */}
      {showAlertModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">{isAr ? "إنشاء تنبيه جديد" : "Create New Alert"}</h3>
              <Button variant="ghost" onClick={() => setShowAlertModal(false)}>
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
            {/* Alert creation form */}
            <div className="text-center text-muted-foreground">
              {isAr ? "نموذج إنشاء التنبيهات هنا" : "Alert creation form would appear here"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
