import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  Plus, Pencil, Trash2, Upload, ExternalLink, Code2, Globe, Server, 
  GitBranch, Smartphone, Gamepad2, Power, Eye, BarChart3, Search,
  Copy, Download, FileArchive, AlertTriangle, CheckCircle2, Puzzle
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ConfirmDialog";

// Integration type metadata
const INTEGRATION_TYPES = [
  { value: "zip_upload", label: "📦 ZIP Upload", icon: FileArchive, desc: "Upload ZIP file with game files" },
  { value: "external_url", label: "🌐 External URL", icon: ExternalLink, desc: "Game hosted on external server" },
  { value: "html_embed", label: "📝 HTML Embed", icon: Code2, desc: "Paste raw HTML/JS code" },
  { value: "cdn_assets", label: "☁️ CDN Assets", icon: Globe, desc: "Game files on CDN" },
  { value: "api_bridge", label: "🔌 API Bridge", icon: Server, desc: "Server-to-server API" },
  { value: "git_repo", label: "📂 Git Repository", icon: GitBranch, desc: "Pull from Git repo" },
  { value: "pwa_app", label: "📱 PWA App", icon: Smartphone, desc: "Progressive Web App" },
];

const CATEGORIES = [
  "arcade", "puzzle", "card", "board", "sports", "casino", "action", "strategy", "trivia", "educational", "simulation", "racing"
];

interface ExternalGame {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  descriptionEn?: string;
  descriptionAr?: string;
  category: string;
  integrationType: string;
  localPath?: string;
  externalUrl?: string;
  htmlContent?: string;
  gitRepoUrl?: string;
  gitBranch?: string;
  apiEndpoint?: string;
  apiSecret?: string;
  entryFile?: string;
  iconUrl?: string;
  thumbnailUrl?: string;
  accentColor?: string;
  orientation?: string;
  minPlayers: number;
  maxPlayers: number;
  minBet?: string;
  maxBet?: string;
  isFreeToPlay: boolean;
  hasInGameCurrency: boolean;
  sdkVersion?: string;
  sandboxPermissions?: string;
  enableOffline: boolean;
  cacheMaxAge?: number;
  totalSizeBytes?: number;
  playCount: number;
  uniquePlayers?: number;
  rating?: string;
  ratingCount?: number;
  status: string;
  isFeatured: boolean;
  sortOrder: number;
  developerName?: string;
  developerUrl?: string;
  version?: string;
  createdAt: string;
}

interface GameFormData {
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  category: string;
  integrationType: string;
  externalUrl: string;
  htmlContent: string;
  gitRepoUrl: string;
  gitBranch: string;
  apiEndpoint: string;
  apiSecret: string;
  entryFile: string;
  iconUrl: string;
  thumbnailUrl: string;
  accentColor: string;
  orientation: string;
  minPlayers: number;
  maxPlayers: number;
  minBet: string;
  maxBet: string;
  isFreeToPlay: boolean;
  hasInGameCurrency: boolean;
  enableOffline: boolean;
  sandboxPermissions: string;
  sortOrder: number;
  developerName: string;
  developerUrl: string;
  version: string;
}

const defaultForm: GameFormData = {
  nameEn: "",
  nameAr: "",
  descriptionEn: "",
  descriptionAr: "",
  category: "arcade",
  integrationType: "zip_upload",
  externalUrl: "",
  htmlContent: "",
  gitRepoUrl: "",
  gitBranch: "main",
  apiEndpoint: "",
  apiSecret: "",
  entryFile: "index.html",
  iconUrl: "",
  thumbnailUrl: "",
  accentColor: "#6366f1",
  orientation: "both",
  minPlayers: 1,
  maxPlayers: 1,
  minBet: "0.00",
  maxBet: "100.00",
  isFreeToPlay: true,
  hasInGameCurrency: false,
  enableOffline: false,
  sandboxPermissions: "allow-scripts allow-same-origin",
  sortOrder: 0,
  developerName: "",
  developerUrl: "",
  version: "1.0.0",
};

export default function AdminExternalGames() {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editingGame, setEditingGame] = useState<ExternalGame | null>(null);
  const [form, setForm] = useState<GameFormData>(defaultForm);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadGameId, setUploadGameId] = useState<string | null>(null);
  const [showStatsDialog, setShowStatsDialog] = useState(false);
  const [statsGameId, setStatsGameId] = useState<string | null>(null);
  const [showSdkDialog, setShowSdkDialog] = useState(false);
  const [deleteGameId, setDeleteGameId] = useState<string | null>(null);
  const [deleteGameName, setDeleteGameName] = useState("");

  const { data: games = [], isLoading } = useQuery<ExternalGame[]>({
    queryKey: ["/api/admin/external-games", searchQuery, filterCategory, filterType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      if (filterCategory !== "all") params.set("category", filterCategory);
      if (filterType !== "all") params.set("integration", filterType);
      const res = await apiRequest("GET", `/api/admin/external-games?${params}`);
      return res.json();
    },
  });

  const { data: gameStats } = useQuery({
    queryKey: ["/api/admin/external-games", statsGameId, "stats"],
    queryFn: async () => {
      if (!statsGameId) return null;
      const res = await apiRequest("GET", `/api/admin/external-games/${statsGameId}/stats`);
      return res.json();
    },
    enabled: !!statsGameId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: GameFormData) => {
      const res = await apiRequest("POST", "/api/admin/external-games", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Game created", description: `${data.nameEn} added successfully` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/external-games"] });
      setShowDialog(false);
      setForm(defaultForm);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<GameFormData> }) => {
      const res = await apiRequest("PATCH", `/api/admin/external-games/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Game updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/external-games"] });
      setShowDialog(false);
      setEditingGame(null);
      setForm(defaultForm);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/external-games/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Game deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/external-games"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/external-games/${id}/toggle-status`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/external-games"] });
    },
  });

  const uploadZipMutation = useMutation({
    mutationFn: async ({ id, zipData }: { id: string; zipData: string }) => {
      const res = await apiRequest("POST", `/api/admin/external-games/${id}/upload-zip`, { zipData });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "ZIP uploaded successfully",
        description: `${data.filesExtracted} files extracted (${(data.totalSize / 1024).toFixed(1)} KB)`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/external-games"] });
      setShowUploadDialog(false);
      setUploadGameId(null);
    },
    onError: (err: any) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  function openCreate() {
    setEditingGame(null);
    setForm(defaultForm);
    setShowDialog(true);
  }

  function openEdit(game: ExternalGame) {
    setEditingGame(game);
    setForm({
      nameEn: game.nameEn,
      nameAr: game.nameAr,
      descriptionEn: game.descriptionEn || "",
      descriptionAr: game.descriptionAr || "",
      category: game.category,
      integrationType: game.integrationType,
      externalUrl: game.externalUrl || "",
      htmlContent: game.htmlContent || "",
      gitRepoUrl: game.gitRepoUrl || "",
      gitBranch: game.gitBranch || "main",
      apiEndpoint: game.apiEndpoint || "",
      apiSecret: game.apiSecret || "",
      entryFile: game.entryFile || "index.html",
      iconUrl: game.iconUrl || "",
      thumbnailUrl: game.thumbnailUrl || "",
      accentColor: game.accentColor || "#6366f1",
      orientation: game.orientation || "both",
      minPlayers: game.minPlayers,
      maxPlayers: game.maxPlayers,
      minBet: game.minBet || "0.00",
      maxBet: game.maxBet || "100.00",
      isFreeToPlay: game.isFreeToPlay,
      hasInGameCurrency: game.hasInGameCurrency,
      enableOffline: game.enableOffline,
      sandboxPermissions: game.sandboxPermissions || "allow-scripts allow-same-origin",
      sortOrder: game.sortOrder,
      developerName: game.developerName || "",
      developerUrl: game.developerUrl || "",
      version: game.version || "1.0.0",
    });
    setShowDialog(true);
  }

  function handleSave() {
    if (editingGame) {
      updateMutation.mutate({ id: editingGame.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  function handleFileUpload(gameId: string) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 50 * 1024 * 1024) {
        toast({ title: "File too large", description: "Max 50MB", variant: "destructive" });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        uploadZipMutation.mutate({ id: gameId, zipData: base64 });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  const getIntegrationIcon = (type: string) => {
    const t = INTEGRATION_TYPES.find(i => i.value === type);
    return t ? t.icon : Puzzle;
  };

  const getIntegrationLabel = (type: string) => {
    const t = INTEGRATION_TYPES.find(i => i.value === type);
    return t ? t.label : type;
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gamepad2 className="h-6 w-6 text-primary" />
            External Games Manager
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Add and manage external games with 7 integration types
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSdkDialog(true)}>
            <Code2 className="h-4 w-4 mr-1" /> SDK Docs
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Add Game
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{games.length}</div>
            <div className="text-xs text-muted-foreground">Total Games</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-green-500">{games.filter(g => g.status === "active").length}</div>
            <div className="text-xs text-muted-foreground">Active</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-amber-500">{games.reduce((s, g) => s + g.playCount, 0)}</div>
            <div className="text-xs text-muted-foreground">Total Plays</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-blue-500">{new Set(games.map(g => g.integrationType)).size}</div>
            <div className="text-xs text-muted-foreground">Integration Types Used</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search games..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(c => (
              <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {INTEGRATION_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Games Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Game</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Plays</TableHead>
                <TableHead className="text-center">Size</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : games.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No external games yet. Click "Add Game" to get started.
                  </TableCell>
                </TableRow>
              ) : (
                games.map((game) => {
                  const IntIcon = getIntegrationIcon(game.integrationType);
                  return (
                    <TableRow key={game.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {game.iconUrl ? (
                            <img src={game.iconUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Gamepad2 className="h-5 w-5 text-primary" />
                            </div>
                          )}
                          <div>
                            <div className="font-medium">{game.nameEn}</div>
                            <div className="text-xs text-muted-foreground">{game.nameAr}</div>
                            <div className="text-xs text-muted-foreground font-mono">/{game.slug}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          <IntIcon className="h-3 w-3" />
                          {game.integrationType.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{game.category}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={game.status === "active" ? "default" : "secondary"}>
                          {game.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{game.playCount}</TableCell>
                      <TableCell className="text-center">{formatBytes(game.totalSizeBytes || 0)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {game.integrationType === "zip_upload" && (
                            <Button variant="ghost" size="icon" title="Upload ZIP" onClick={() => handleFileUpload(game.id)}>
                              <Upload className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" title="Stats" onClick={() => { setStatsGameId(game.id); setShowStatsDialog(true); }}>
                            <BarChart3 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Toggle Status" onClick={() => toggleMutation.mutate(game.id)}>
                            <Power className={`h-4 w-4 ${game.status === "active" ? "text-green-500" : "text-muted-foreground"}`} />
                          </Button>
                          <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(game)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Delete" onClick={() => {
                            setDeleteGameId(game.id);
                            setDeleteGameName(game.nameEn);
                          }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingGame ? `Edit: ${editingGame.nameEn}` : "Add New External Game"}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="integration">Integration</TabsTrigger>
              <TabsTrigger value="config">Config</TabsTrigger>
              <TabsTrigger value="display">Display</TabsTrigger>
            </TabsList>

            {/* Basic Info Tab */}
            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Name (English) *</Label>
                  <Input value={form.nameEn} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} placeholder="Candy Crush" />
                </div>
                <div>
                  <Label>Name (Arabic) *</Label>
                  <Input value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} placeholder="كاندي كراش" dir="rtl" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Description (English)</Label>
                  <Textarea value={form.descriptionEn} onChange={e => setForm(f => ({ ...f, descriptionEn: e.target.value }))} rows={3} />
                </div>
                <div>
                  <Label>Description (Arabic)</Label>
                  <Textarea value={form.descriptionAr} onChange={e => setForm(f => ({ ...f, descriptionAr: e.target.value }))} rows={3} dir="rtl" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Developer Name</Label>
                  <Input value={form.developerName} onChange={e => setForm(f => ({ ...f, developerName: e.target.value }))} />
                </div>
                <div>
                  <Label>Version</Label>
                  <Input value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} placeholder="1.0.0" />
                </div>
              </div>
            </TabsContent>

            {/* Integration Tab */}
            <TabsContent value="integration" className="space-y-4 mt-4">
              <div>
                <Label>Integration Type *</Label>
                <p className="text-xs text-muted-foreground mb-2">Choose how this game connects to VEX</p>
                <div className="grid grid-cols-1 gap-2">
                  {INTEGRATION_TYPES.map(t => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, integrationType: t.value }))}
                        className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                          form.integrationType === t.value
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <Icon className={`h-5 w-5 ${form.integrationType === t.value ? "text-primary" : "text-muted-foreground"}`} />
                        <div>
                          <div className="text-sm font-medium">{t.label}</div>
                          <div className="text-xs text-muted-foreground">{t.desc}</div>
                        </div>
                        {form.integrationType === t.value && (
                          <CheckCircle2 className="h-4 w-4 text-primary ml-auto" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Type-specific fields */}
              {(form.integrationType === "external_url" || form.integrationType === "cdn_assets" || form.integrationType === "pwa_app") && (
                <div>
                  <Label>Game URL *</Label>
                  <Input value={form.externalUrl} onChange={e => setForm(f => ({ ...f, externalUrl: e.target.value }))} placeholder="https://game-server.com/my-game/" />
                  <p className="text-xs text-muted-foreground mt-1">Full URL to the game entry point</p>
                </div>
              )}

              {form.integrationType === "zip_upload" && (
                <div className="p-4 rounded-lg border border-dashed border-primary/30 bg-primary/5">
                  <div className="flex items-center gap-2 text-sm">
                    <Upload className="h-4 w-4 text-primary" />
                    <span>After creating the game, use the <strong>Upload ZIP</strong> button in the table to upload game files.</span>
                  </div>
                  <div className="mt-2">
                    <Label>Entry File</Label>
                    <Input value={form.entryFile} onChange={e => setForm(f => ({ ...f, entryFile: e.target.value }))} placeholder="index.html" />
                  </div>
                </div>
              )}

              {form.integrationType === "html_embed" && (
                <div>
                  <Label>HTML Content *</Label>
                  <Textarea 
                    value={form.htmlContent} 
                    onChange={e => setForm(f => ({ ...f, htmlContent: e.target.value }))} 
                    rows={12} 
                    className="font-mono text-xs"
                    placeholder="<!DOCTYPE html>&#10;<html>&#10;<head>...</head>&#10;<body>...</body>&#10;</html>"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Paste complete HTML with embedded JS/CSS. Max 2MB.</p>
                </div>
              )}

              {form.integrationType === "git_repo" && (
                <div className="space-y-3">
                  <div>
                    <Label>Git Repository URL *</Label>
                    <Input value={form.gitRepoUrl} onChange={e => setForm(f => ({ ...f, gitRepoUrl: e.target.value }))} placeholder="https://github.com/dev/my-game.git" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Branch</Label>
                      <Input value={form.gitBranch} onChange={e => setForm(f => ({ ...f, gitBranch: e.target.value }))} placeholder="main" />
                    </div>
                    <div>
                      <Label>Entry File</Label>
                      <Input value={form.entryFile} onChange={e => setForm(f => ({ ...f, entryFile: e.target.value }))} placeholder="index.html" />
                    </div>
                  </div>
                </div>
              )}

              {form.integrationType === "api_bridge" && (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                    <div className="text-xs text-amber-500">API Bridge requires the game server to implement VEX API callbacks. See SDK docs for details.</div>
                  </div>
                  <div>
                    <Label>API Endpoint *</Label>
                    <Input value={form.apiEndpoint} onChange={e => setForm(f => ({ ...f, apiEndpoint: e.target.value }))} placeholder="https://game-api.example.com/vex/callback" />
                  </div>
                  <div>
                    <Label>API Secret Key *</Label>
                    <Input value={form.apiSecret} onChange={e => setForm(f => ({ ...f, apiSecret: e.target.value }))} placeholder="your-secret-key" type="password" />
                  </div>
                  <div>
                    <Label>Game Frontend URL</Label>
                    <Input value={form.externalUrl} onChange={e => setForm(f => ({ ...f, externalUrl: e.target.value }))} placeholder="https://game-server.com/play" />
                  </div>
                </div>
              )}

              <div>
                <Label>Sandbox Permissions</Label>
                <Input value={form.sandboxPermissions} onChange={e => setForm(f => ({ ...f, sandboxPermissions: e.target.value }))} />
                <p className="text-xs text-muted-foreground mt-1">iframe sandbox attributes. Default: allow-scripts allow-same-origin</p>
              </div>
            </TabsContent>

            {/* Config Tab */}
            <TabsContent value="config" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Min Players</Label>
                  <Input type="number" value={form.minPlayers} onChange={e => setForm(f => ({ ...f, minPlayers: parseInt(e.target.value) || 1 }))} min={1} />
                </div>
                <div>
                  <Label>Max Players</Label>
                  <Input type="number" value={form.maxPlayers} onChange={e => setForm(f => ({ ...f, maxPlayers: parseInt(e.target.value) || 1 }))} min={1} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Min Bet</Label>
                  <Input value={form.minBet} onChange={e => setForm(f => ({ ...f, minBet: e.target.value }))} placeholder="0.00" />
                </div>
                <div>
                  <Label>Max Bet</Label>
                  <Input value={form.maxBet} onChange={e => setForm(f => ({ ...f, maxBet: e.target.value }))} placeholder="100.00" />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <div className="text-sm font-medium">Free to Play</div>
                  <div className="text-xs text-muted-foreground">Allow playing without betting</div>
                </div>
                <Switch checked={form.isFreeToPlay} onCheckedChange={v => setForm(f => ({ ...f, isFreeToPlay: v }))} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <div className="text-sm font-medium">Has In-Game Currency</div>
                  <div className="text-xs text-muted-foreground">Game uses debit/credit during play</div>
                </div>
                <Switch checked={form.hasInGameCurrency} onCheckedChange={v => setForm(f => ({ ...f, hasInGameCurrency: v }))} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <div className="text-sm font-medium">Enable Offline Mode</div>
                  <div className="text-xs text-muted-foreground">Cache game files for offline play</div>
                </div>
                <Switch checked={form.enableOffline} onCheckedChange={v => setForm(f => ({ ...f, enableOffline: v }))} />
              </div>
              <div>
                <Label>Sort Order</Label>
                <Input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} />
              </div>
            </TabsContent>

            {/* Display Tab */}
            <TabsContent value="display" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Icon URL</Label>
                  <Input value={form.iconUrl} onChange={e => setForm(f => ({ ...f, iconUrl: e.target.value }))} placeholder="https://..." />
                </div>
                <div>
                  <Label>Thumbnail URL</Label>
                  <Input value={form.thumbnailUrl} onChange={e => setForm(f => ({ ...f, thumbnailUrl: e.target.value }))} placeholder="https://..." />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Accent Color</Label>
                  <div className="flex gap-2">
                    <Input type="color" value={form.accentColor} onChange={e => setForm(f => ({ ...f, accentColor: e.target.value }))} className="w-12 h-9 p-1" />
                    <Input value={form.accentColor} onChange={e => setForm(f => ({ ...f, accentColor: e.target.value }))} placeholder="#6366f1" />
                  </div>
                </div>
                <div>
                  <Label>Orientation</Label>
                  <Select value={form.orientation} onValueChange={v => setForm(f => ({ ...f, orientation: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="both">Both</SelectItem>
                      <SelectItem value="portrait">Portrait</SelectItem>
                      <SelectItem value="landscape">Landscape</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.iconUrl && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <img src={form.iconUrl} alt="Preview" className="w-16 h-16 rounded-lg object-cover" />
                  <span className="text-sm text-muted-foreground">Icon preview</span>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingGame ? "Update Game" : "Create Game"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stats Dialog */}
      <Dialog open={showStatsDialog} onOpenChange={setShowStatsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Game Statistics</DialogTitle>
          </DialogHeader>
          {gameStats ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-xl font-bold">{gameStats.stats?.totalSessions || 0}</div>
                <div className="text-xs text-muted-foreground">Total Sessions</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-xl font-bold text-green-500">{gameStats.stats?.completedSessions || 0}</div>
                <div className="text-xs text-muted-foreground">Completed</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-xl font-bold">{gameStats.stats?.uniquePlayers || 0}</div>
                <div className="text-xs text-muted-foreground">Unique Players</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-xl font-bold">{gameStats.stats?.avgScore || 0}</div>
                <div className="text-xs text-muted-foreground">Avg Score</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-xl font-bold">${Number(gameStats.stats?.totalBets || 0).toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">Total Bets</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-xl font-bold text-amber-500">${Number(gameStats.stats?.totalWins || 0).toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">Total Payouts</div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          )}
        </DialogContent>
      </Dialog>

      {/* SDK Documentation Dialog */}
      <Dialog open={showSdkDialog} onOpenChange={setShowSdkDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>VEX Game SDK Documentation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-medium mb-1">SDK URL</p>
              <code className="text-xs bg-background p-1 rounded block">
                {window.location.origin}/games/vex-sdk.js
              </code>
              <Button size="sm" variant="ghost" className="mt-1" onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/games/vex-sdk.js`);
                toast({ title: "Copied!" });
              }}>
                <Copy className="h-3 w-3 mr-1" /> Copy URL
              </Button>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Quick Start</h3>
              <pre className="p-3 rounded-lg bg-black text-green-400 text-xs overflow-x-auto whitespace-pre">{`<!DOCTYPE html>
<html>
<head>
  <script src="${window.location.origin}/games/vex-sdk.js"><\/script>
</head>
<body>
  <script>
    // Initialize SDK
    VEX.init({
      onReady: function(player) {
        console.log('Player:', player.username);
        console.log('Balance:', player.balance);
        startMyGame();
      }
    });

    // Debit (bet)
    VEX.debit(10, 'game_bet', function(res) {
      if (res.success) {
        console.log('New balance:', res.newBalance);
      }
    });

    // Credit (win)
    VEX.credit(25, 'game_win', function(res) {
      console.log('New balance:', res.newBalance);
    });

    // End session
    VEX.endSession({
      result: 'win',  // win, loss, draw, none
      score: 1500,
      winAmount: 25,
      metadata: { level: 5 }
    });

    // Close game
    VEX.close();
  <\/script>
</body>
</html>`}</pre>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Available Methods</h3>
              <div className="space-y-2">
                {[
                  ["VEX.init(config)", "Initialize SDK, config.onReady receives player data"],
                  ["VEX.getPlayer()", "Get current player { id, username, balance, language }"],
                  ["VEX.debit(amount, reason?, cb)", "Deduct from balance (bets)"],
                  ["VEX.credit(amount, reason?, cb)", "Add to balance (winnings)"],
                  ["VEX.reportScore(score, extra?, cb)", "Report score for leaderboard"],
                  ["VEX.endSession(result, cb)", "End game session with result"],
                  ["VEX.close()", "Close game, return to VEX"],
                  ["VEX.showToast(msg, type?)", "Show notification in VEX"],
                  ["VEX.on(event, handler)", "Listen: ready, pause, resume, close, balanceUpdate"],
                  ["VEX.setData(key, value, cb?)", "Save persistent data (per game+user)"],
                  ["VEX.getData(key, cb)", "Load persistent data"],
                ].map(([method, desc]) => (
                  <div key={method} className="flex gap-2 text-xs">
                    <code className="font-mono text-primary whitespace-nowrap">{method}</code>
                    <span className="text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Integration Types</h3>
              <div className="space-y-1 text-xs">
                {INTEGRATION_TYPES.map(t => (
                  <div key={t.value} className="flex gap-2">
                    <span className="font-medium">{t.label}:</span>
                    <span className="text-muted-foreground">{t.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteGameId}
        title={`Delete "${deleteGameName}"?`}
        description="This cannot be undone."
        variant="destructive"
        onConfirm={() => { if (deleteGameId) deleteMutation.mutate(deleteGameId); setDeleteGameId(null); }}
        onCancel={() => setDeleteGameId(null)}
      />
    </div>
  );
}
