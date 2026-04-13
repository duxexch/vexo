import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  LayoutDashboard,
  Wallet,
  Swords,
  Play,
  ArrowLeftRight,
  Gift,
  DollarSign,
  AlertTriangle,
  Settings,
  Headset,
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

const sectionIcons: Record<string, any> = {
  dashboard: LayoutDashboard,
  wallet: Wallet,
  challenges: Swords,
  play: Play,
  p2p: ArrowLeftRight,
  free: Gift,
  transactions: DollarSign,
  complaints: AlertTriangle,
  support: Headset,
  settings: Settings,
};

const sectionDescriptions: Record<string, string> = {
  dashboard: "Main dashboard showing user stats and recent activity",
  wallet: "Deposit and withdrawal functionality",
  challenges: "Create and join multiplayer challenges",
  play: "Access to all available games",
  p2p: "Peer-to-peer trading marketplace",
  free: "Free rewards and bonuses section",
  transactions: "Transaction history and records",
  complaints: "User complaint and support system",
  support: "Customer support contact methods",
  settings: "User account settings",
};

export default function AdminSectionsPage() {
  const { toast } = useToast();

  const { data: sections, isLoading } = useQuery({
    queryKey: ["/api/admin/feature-flags"],
    queryFn: () => adminFetch("/api/admin/feature-flags"),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      return adminFetch(`/api/admin/feature-flags/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isEnabled }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feature-flags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/public"] });
      toast({
        title: "Section Updated",
        description: "Section visibility has been updated",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update section",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-[100svh] p-3 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100svh] p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Section Controls</h1>
        <p className="text-muted-foreground">Enable or disable sections of the application</p>
      </div>

      <div className="grid gap-4">
        {sections?.map((section: { id: string; key?: string; sectionKey?: string; name?: string; isEnabled?: boolean; description?: string }) => {
          const sectionKey = section.key || section.sectionKey || '';
          const Icon = sectionIcons[sectionKey] || Settings;
          return (
            <Card key={section.id}>
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                    <div className="p-3 rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold capitalize">{section.name || sectionKey.replace('-', ' ')}</h3>
                        <Badge variant={section.isEnabled ? "default" : "secondary"}>
                          {section.isEnabled ? "Active" : "Disabled"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {sectionDescriptions[sectionKey || ''] || section.description}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={section.isEnabled}
                    onCheckedChange={(checked) =>
                      toggleMutation.mutate({ id: section.id, isEnabled: checked })
                    }
                    disabled={toggleMutation.isPending}
                    className="data-[state=checked]:bg-primary"
                    data-testid={`switch-section-${sectionKey}`}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}

        {(!sections || sections.length === 0) && (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">No sections configured. Seed the database first.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
