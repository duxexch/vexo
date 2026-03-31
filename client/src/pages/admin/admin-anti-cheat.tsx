import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Shield,
  AlertTriangle,
  Eye,
  Ban,
  Clock,
  TrendingUp,
  Zap,
} from "lucide-react";

function getAdminToken() {
  return localStorage.getItem("adminToken");
}

async function adminFetch(url: string) {
  const token = getAdminToken();
  const res = await fetch(url, {
    headers: { "x-admin-token": token || "" },
  });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

export default function AdminAntiCheatPage() {
  const { data: analytics } = useQuery({
    queryKey: ["/api/admin/analytics"],
    queryFn: () => adminFetch("/api/admin/analytics"),
  });

  const suspiciousPatterns = [
    {
      type: "Rapid Playing",
      description: "Users playing faster than humanly possible",
      severity: "high",
      count: 3,
      icon: Zap,
    },
    {
      type: "Win Rate Anomaly",
      description: "Unusually high win rates above statistical norms",
      severity: "medium",
      count: 7,
      icon: TrendingUp,
    },
    {
      type: "Multiple Accounts",
      description: "Same IP/device with multiple accounts",
      severity: "high",
      count: 2,
      icon: Shield,
    },
    {
      type: "Deposit/Withdraw Pattern",
      description: "Suspicious transaction patterns detected",
      severity: "low",
      count: 12,
      icon: AlertTriangle,
    },
  ];

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high": return "destructive";
      case "medium": return "secondary";
      case "low": return "outline";
      default: return "default";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Anti-Cheat System</h1>
        <p className="text-muted-foreground">Monitor and prevent fraudulent activity</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Flagged Users</p>
                <p className="text-2xl font-bold">24</p>
              </div>
              <div className="p-3 rounded-full bg-red-500/10">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Under Review</p>
                <p className="text-2xl font-bold">8</p>
              </div>
              <div className="p-3 rounded-full bg-yellow-500/10">
                <Eye className="h-6 w-6 text-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Banned Today</p>
                <p className="text-2xl font-bold">3</p>
              </div>
              <div className="p-3 rounded-full bg-red-500/10">
                <Ban className="h-6 w-6 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Actions</p>
                <p className="text-2xl font-bold">12</p>
              </div>
              <div className="p-3 rounded-full bg-blue-500/10">
                <Clock className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detected Suspicious Patterns</CardTitle>
          <CardDescription>
            Automated detection of potential cheating behavior
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {suspiciousPatterns.map((pattern) => (
              <div
                key={pattern.type}
                className="flex items-center justify-between p-4 rounded-lg border"
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${
                    pattern.severity === 'high' ? 'bg-red-500/10' :
                    pattern.severity === 'medium' ? 'bg-yellow-500/10' :
                    'bg-blue-500/10'
                  }`}>
                    <pattern.icon className={`h-5 w-5 ${
                      pattern.severity === 'high' ? 'text-red-500' :
                      pattern.severity === 'medium' ? 'text-yellow-500' :
                      'text-blue-500'
                    }`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{pattern.type}</h4>
                      <Badge variant={getSeverityColor(pattern.severity)}>
                        {pattern.severity}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{pattern.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-lg font-bold">{pattern.count}</span>
                  <Button size="sm" variant="outline" data-testid={`button-review-${pattern.type.toLowerCase().replace(' ', '-')}`}>
                    Review
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Flagged Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { user: "player_x42", action: "Unusual win streak (15 wins)", time: "5 min ago", severity: "high" },
              { user: "betmaster99", action: "Rapid deposits from multiple cards", time: "12 min ago", severity: "medium" },
              { user: "lucky_777", action: "Same IP as banned user", time: "1 hour ago", severity: "high" },
              { user: "gamepro2024", action: "Bot-like playing patterns", time: "2 hours ago", severity: "medium" },
              { user: "winner_ace", action: "Collusion suspected with another user", time: "3 hours ago", severity: "high" },
            ].map((activity, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <Badge variant={getSeverityColor(activity.severity)}>
                    {activity.severity}
                  </Badge>
                  <div>
                    <span className="font-medium">{activity.user}</span>
                    <p className="text-sm text-muted-foreground">{activity.action}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">{activity.time}</span>
                  <Button size="sm" variant="ghost">
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
