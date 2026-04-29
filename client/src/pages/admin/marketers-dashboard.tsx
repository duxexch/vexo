import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { adminFetch } from "@/lib/admin-api";
import {
  Users,
  DollarSign,
  Target,
  TrendingUp,
  Search,
  Copy,
  UserPlus,
  Edit,
  Trash2,
  Download,
  Upload,
  Filter,
  Bell,
  CheckCircle,
  XCircle,
  Eye,
  BarChart3,
  PieChart,
  Activity,
  Zap,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Award,
  Star,
  MoreVertical,
  Plus,
} from "lucide-react";

interface Marketer {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: 'active' | 'inactive' | 'suspended';
  totalRevenue: number;
  commissionEarned: number;
  totalUsers: number;
  activeUsers: number;
  conversionRate: number;
  joinDate: string;
  lastActivity: string;
  performance: {
    score: number;
    rank: number;
    trend: 'up' | 'down' | 'stable';
  };
  campaigns: {
    active: number;
    completed: number;
    total: number;
  };
  permissions: {
    canCreateCampaigns: boolean;
    canViewAnalytics: boolean;
    canManageUsers: boolean;
    canProcessPayments: boolean;
  };
}

interface MarketingCampaign {
  id: string;
  name: string;
  marketerId: string;
  marketerName: string;
  status: 'active' | 'paused' | 'completed';
  budget: number;
  spent: number;
  revenue: number;
  roi: number;
  startDate: string;
  endDate: string;
  targetAudience: string;
  conversionRate: number;
  impressions: number;
  clicks: number;
}

export default function MarketersDashboard() {
  const { language, dir } = useI18n();
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMarketer, setSelectedMarketer] = useState(null);
  const [showMarketerModal, setShowMarketerModal] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/admin/marketers/stats"],
    queryFn: () => adminFetch("/api/admin/marketers/stats"),
    refetchInterval: 30000,
  });

  const { data: marketers, isLoading: marketersLoading } = useQuery({
    queryKey: ["/api/admin/marketers", searchQuery],
    queryFn: () => adminFetch(`/api/admin/marketers${searchQuery ? `?search=${searchQuery}` : ""}`),
  });

  const { data: campaigns, isLoading: campaignsLoading } = useQuery({
    queryKey: ["/api/admin/campaigns"],
    queryFn: () => adminFetch("/api/admin/campaigns"),
  });

  const isAr = language === "ar";

  const handleMarketerAction = async (marketerId, action) => {
    try {
      await adminFetch(`/api/admin/marketers/${marketerId}/${action}`, { method: "POST" });
      toast({
        title: isAr ? "تمت العملية" : "Action completed",
        description: isAr ? `تم ${action} المسوق` : `Marketer ${action} completed`,
      });
      window.location.reload();
    } catch (error) {
      toast({
        title: isAr ? "فشلت العملية" : "Action failed",
        description: isAr ? "حدث خطأ أثناء تنفيذ العملية" : "Error occurred while performing action",
        variant: "destructive",
      });
    }
  };

  const handleCreateMarketer = async (marketerData) => {
    try {
      await adminFetch("/api/admin/marketers", {
        method: "POST",
        body: JSON.stringify(marketerData),
      });
      toast({
        title: isAr ? "تم إنشاء المسوق" : "Marketer created successfully",
        description: isAr ? "تم إضافة المسوق بنجاح" : "Marketer added successfully",
      });
      setShowMarketerModal(false);
      window.location.reload();
    } catch (error) {
      toast({
        title: isAr ? "فشل الإنشاء" : "Creation failed",
        description: isAr ? "حدث خطأ أثناء إنشاء المسوق" : "Error occurred while creating marketer",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "active": return "text-green-600 bg-green-50 border-green-200";
      case "inactive": return "text-gray-600 bg-gray-50 border-gray-200";
      case "suspended": return "text-red-600 bg-red-50 border-red-200";
      default: return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  const getPerformanceTrend = (trend) => {
    switch (trend) {
      case "up": return "text-green-500";
      case "down": return "text-red-500";
      case "stable": return "text-gray-500";
      default: return "text-gray-500";
    }
  };

  return (
    <div className="min-h-screen bg-background" dir={dir}>
      {/* Header */}
      <header className="border-b bg-card/90 backdrop-blur px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 space-x-reverse">
            <h1 className="text-2xl font-bold text-foreground">
              {isAr ? "لوحة المسوقين" : "Marketers Dashboard"}
            </h1>
            <Badge variant="secondary" className="text-xs">
              {isAr ? "إدارة المسوقين" : "Marketer Management"}
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
            
            <Button
              size="sm"
              onClick={() => setShowMarketerModal(true)}
            >
              <UserPlus className="h-4 w-4" />
              {isAr ? "إضافة مسوق" : "Add Marketer"}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Statistics Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Marketers */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4" />
                {isAr ? "إجمالي المسوقين" : "Total Marketers"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalMarketers?.toLocaleString() || 0}</div>
              <div className="text-xs text-muted-foreground">
                {isAr ? "نشطون: " : "Active: "}{stats?.activeMarketers?.toLocaleString() || 0}
              </div>
            </CardContent>
          </Card>

          {/* Total Revenue */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <DollarSign className="h-4 w-4" />
                {isAr ? "إجمالي الإيرادات" : "Total Revenue"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats?.totalRevenue?.toLocaleString() || 0}</div>
              <div className="text-xs text-muted-foreground">
                {isAr ? "هذا الشهر: " : "This month: "}${stats?.monthlyRevenue?.toLocaleString() || 0}
              </div>
            </CardContent>
          </Card>

          {/* Total Campaigns */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Target className="h-4 w-4" />
                {isAr ? "إجمالي الحملات" : "Total Campaigns"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalCampaigns?.toLocaleString() || 0}</div>
              <div className="text-xs text-muted-foreground">
                {isAr ? "نشطة: " : "Active: "}{stats?.activeCampaigns?.toLocaleString() || 0}
              </div>
            </CardContent>
          </Card>

          {/* Conversion Rate */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4" />
                {isAr ? "معدل التحويل" : "Conversion Rate"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.avgConversionRate?.toFixed(1) || 0}%</div>
              <div className="text-xs text-muted-foreground">
                {isAr ? "معدل النجاح" : "Success rate"}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              {isAr ? "نظرة عامة" : "Overview"}
            </TabsTrigger>
            <TabsTrigger value="marketers" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              {isAr ? "المسوقون" : "Marketers"}
              {marketers?.filter(m => m.status === 'suspended').length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {marketers.filter(m => m.status === 'suspended').length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              {isAr ? "الحملات" : "Campaigns"}
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <PieChart className="h-4 w-4" />
              {isAr ? "التحليلات" : "Analytics"}
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Performance Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    {isAr ? "أداء المسوقين" : "Marketer Performance"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">{isAr ? "أفضل مسوق" : "Top Marketer"}</span>
                      <span className="text-lg font-bold">{stats?.topMarketer?.name || "N/A"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">{isAr ? "أعلى إيرادات" : "Highest Revenue"}</span>
                      <span className="text-lg font-bold text-green-600">${stats?.highestRevenue?.toLocaleString() || 0}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">{isAr ? "معدل التحويل" : "Avg Conversion"}</span>
                      <span className="text-lg font-bold">{stats?.avgConversionRate?.toFixed(1) || 0}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Campaign Performance */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    {isAr ? "أداء الحملات" : "Campaign Performance"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">{isAr ? "الحملات النشطة" : "Active Campaigns"}</span>
                      <span className="text-lg font-bold">{stats?.activeCampaigns || 0}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">{isAr ? "معدل العائد" : "Average ROI"}</span>
                      <span className="text-lg font-bold text-green-600">{stats?.avgROI?.toFixed(1) || 0}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">{isAr ? "إجمالي النقرات" : "Total Clicks"}</span>
                      <span className="text-lg font-bold">{stats?.totalClicks?.toLocaleString() || 0}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Marketers Tab */}
          <TabsContent value="marketers" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    {isAr ? "إدارة المسوقين" : "Marketer Management"}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder={isAr ? "بحث عن مسوق..." : "Search marketers..."}
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
                      <TableHead className="text-right">{isAr ? "المسوق" : "Marketer"}</TableHead>
                      <TableHead className="text-right">{isAr ? "البريد" : "Email"}</TableHead>
                      <TableHead className="text-right">{isAr ? "الهاتف" : "Phone"}</TableHead>
                      <TableHead className="text-right">{isAr ? "الحالة" : "Status"}</TableHead>
                      <TableHead className="text-right">{isAr ? "الإيرادات" : "Revenue"}</TableHead>
                      <TableHead className="text-right">{isAr ? "المستخدمون" : "Users"}</TableHead>
                      <TableHead className="text-right">{isAr ? "التحويل" : "Conversion"}</TableHead>
                      <TableHead className="text-right">{isAr ? "الأداء" : "Performance"}</TableHead>
                      <TableHead className="text-right">{isAr ? "الإجراءات" : "Actions"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {marketersLoading ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8">
                          {isAr ? "جاري التحميل..." : "Loading..."}
                        </TableCell>
                      </TableRow>
                    ) : marketers?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8">
                          {isAr ? "لا يوجد مسوقون" : "No marketers found"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      marketers.map((marketer) => (
                        <TableRow key={marketer.id}>
                          <TableCell className="font-medium">{marketer.name}</TableCell>
                          <TableCell>{marketer.email}</TableCell>
                          <TableCell>{marketer.phone}</TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(marketer.status)}>
                              {marketer.status === 'active' && (isAr ? 'نشط' : 'Active')}
                              {marketer.status === 'inactive' && (isAr ? 'غير نشط' : 'Inactive')}
                              {marketer.status === 'suspended' && (isAr ? 'معلق' : 'Suspended')}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono">${marketer.totalRevenue.toLocaleString()}</TableCell>
                          <TableCell>{marketer.totalUsers.toLocaleString()}</TableCell>
                          <TableCell>{marketer.conversionRate.toFixed(1)}%</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <span className="font-bold">{marketer.performance.score}</span>
                              <TrendingUp className={`h-3 w-3 ${getPerformanceTrend(marketer.performance.trend)}`} />
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedMarketer(marketer.id)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleMarketerAction(marketer.id, 'edit')}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant={marketer.status === 'active' ? 'destructive' : 'default'}
                                onClick={() => handleMarketerAction(marketer.id, marketer.status === 'active' ? 'suspend' : 'activate')}
                              >
                                {marketer.status === 'active' ? <XCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
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

          {/* Campaigns Tab */}
          <TabsContent value="campaigns" className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">{isAr ? "إدارة الحملات" : "Campaign Management"}</h3>
              <Button onClick={() => setShowCampaignModal(true)}>
                <Plus className="h-4 w-4" />
                {isAr ? "إنشاء حملة" : "Create Campaign"}
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {campaignsLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <div className="animate-pulse">
                        <div className="h-4 w-4 bg-muted rounded mb-4"></div>
                        <div className="h-4 w-32 bg-muted rounded"></div>
                        <div className="h-4 w-24 bg-muted rounded"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                campaigns?.map((campaign) => (
                  <Card key={campaign.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>{campaign.name}</span>
                        <Badge className={getStatusColor(campaign.status)}>
                          {campaign.status === 'active' && (isAr ? 'نشطة' : 'Active')}
                          {campaign.status === 'paused' && (isAr ? 'متوقفة' : 'Paused')}
                          {campaign.status === 'completed' && (isAr ? 'مكتملة' : 'Completed')}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">{isAr ? "المسوق" : "Marketer"}</span>
                          <span className="font-bold">{campaign.marketerName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">{isAr ? "الميزانية" : "Budget"}</span>
                          <span className="font-bold">${campaign.budget.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">{isAr ? "المنصرف" : "Spent"}</span>
                          <span className="font-bold">${campaign.spent.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">{isAr ? "العائد" : "ROI"}</span>
                          <span className={`font-bold ${campaign.roi > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {campaign.roi.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">{isAr ? "التحويل" : "Conversion"}</span>
                          <span className="font-bold">{campaign.conversionRate.toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between mt-4">
                          <Button size="sm" variant="outline">
                            <BarChart3 className="h-4 w-4" />
                            {isAr ? "التحليل" : "Analytics"}
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

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Revenue Analytics */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    {isAr ? "تحليل الإيرادات" : "Revenue Analytics"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">{isAr ? "إيرادات اليوم" : "Today's Revenue"}</span>
                      <span className="text-xl font-bold text-green-600">${stats?.todayRevenue?.toLocaleString() || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">{isAr ? "إيرادات الأسبوع" : "Week's Revenue"}</span>
                      <span className="text-xl font-bold">${stats?.weekRevenue?.toLocaleString() || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">{isAr ? "إيرادات الشهر" : "Month's Revenue"}</span>
                      <span className="text-xl font-bold">${stats?.monthRevenue?.toLocaleString() || 0}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      {isAr ? "نمو الإيرادات: " : "Revenue growth: "}
                      <TrendingUp className="inline h-3 w-3 text-green-500" />
                      +15.2% {isAr ? "هذا الشهر" : "this month"}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Performance Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    {isAr ? "مقاييس الأداء" : "Performance Metrics"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">{isAr ? "معدل التحويل الكلي" : "Overall Conversion"}</span>
                      <span className="text-xl font-bold">{stats?.overallConversionRate?.toFixed(1) || 0}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">{isAr ? "تكلفة الإكتساب" : "Customer Acquisition Cost"}</span>
                      <span className="text-xl font-bold">${stats?.cac?.toFixed(2) || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">{isAr ? "قيمة العميل" : "Customer Lifetime Value"}</span>
                      <span className="text-xl font-bold">${stats?.ltv?.toFixed(2) || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">{isAr ? "معدل العائد" : "Average ROI"}</span>
                      <span className="text-xl font-bold text-green-600">{stats?.avgROI?.toFixed(1) || 0}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Marketer Detail Modal */}
      {showMarketerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 max-w-2xl w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">{isAr ? "إضافة مسوق جديد" : "Add New Marketer"}</h3>
              <Button variant="ghost" onClick={() => setShowMarketerModal(false)}>
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
            {/* Marketer creation form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{isAr ? "الاسم" : "Name"}</label>
                <Input placeholder={isAr ? "اسم المسوق" : "Marketer name"} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{isAr ? "البريد الإلكتروني" : "Email"}</label>
                <Input type="email" placeholder={isAr ? "البريد الإلكتروني" : "Email address"} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{isAr ? "الهاتف" : "Phone"}</label>
                <Input placeholder={isAr ? "رقم الهاتف" : "Phone number"} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{isAr ? "الولاية" : "State/Region"}</label>
                <Input placeholder={isAr ? "الولاية أو المنطقة" : "State or region"} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{isAr ? "العمولة" : "Commission Rate"}</label>
                <Input type="number" placeholder="5.0" step="0.1" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{isAr ? "الحد الأدنى" : "Minimum Threshold"}</label>
                <Input type="number" placeholder="100" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowMarketerModal(false)}>
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button onClick={() => handleCreateMarketer({})}>
                {isAr ? "إنشاء" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Campaign Modal */}
      {showCampaignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">{isAr ? "إنشاء حملة جديدة" : "Create New Campaign"}</h3>
              <Button variant="ghost" onClick={() => setShowCampaignModal(false)}>
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
            {/* Campaign creation form */}
            <div className="text-center text-muted-foreground">
              {isAr ? "نموذج إنشاء الحملات هنا" : "Campaign creation form would appear here"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
