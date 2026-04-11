import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Shuffle, UserPlus, X, Loader2, Clock, Gamepad2, Check, XCircle, Users, UserCheck, Wifi } from "lucide-react";

interface GameItem {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface FriendItem {
  id: string;
  accountId?: string;
  friend?: { id?: string; username?: string; accountId?: string; avatarUrl?: string };
  [key: string]: unknown;
}

interface MatchmakingStatusData {
  inQueue?: { createdAt: string };
  queueCount?: number;
  pendingInvites?: Array<{ id: string; createdAt: string;[key: string]: unknown }>;
  activeMatches?: Array<{ id: string; startedAt: string;[key: string]: unknown }>;
  [key: string]: unknown;
}

interface MatchInfo {
  id: string;
  player1?: { username?: string; avatarUrl?: string; vipLevel?: number };
  player2?: { username?: string; avatarUrl?: string; vipLevel?: number };
  game?: { name: string };
  [key: string]: unknown;
}

export default function MultiplayerPage() {
  const { t } = useI18n();
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [selectedGameId, setSelectedGameId] = useState<string>("");
  const [friendAccountId, setFriendAccountId] = useState("");
  const [selectedFriend, setSelectedFriend] = useState<FriendItem | null>(null);
  const [friendSelectionMode, setFriendSelectionMode] = useState<'list' | 'manual'>('list');
  const [isSearching, setIsSearching] = useState(false);
  const [searchStartTime, setSearchStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [matchFoundDialog, setMatchFoundDialog] = useState(false);
  const [foundMatch, setFoundMatch] = useState<MatchInfo | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);

  const { data: games = [] } = useQuery<GameItem[]>({
    queryKey: ["/api/games/available"],
  });

  // Fetch user's friends list
  const { data: friends = [] } = useQuery<FriendItem[]>({
    queryKey: ["/api/friends"],
  });

  const { data: matchmakingStatus, refetch: refetchStatus } = useQuery<MatchmakingStatusData>({
    queryKey: ["/api/games/matchmaking/status"],
    refetchInterval: isSearching ? 3000 : false,
  });

  useEffect(() => {
    if (!token) return;

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "auth", token }));
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "match_found") {
        setIsSearching(false);
        setSearchStartTime(null);
        setFoundMatch(data.data);
        setMatchFoundDialog(true);
        queryClient.invalidateQueries({ queryKey: ["/api/games/matchmaking/status"] });
      }

      if (data.type === "game_invite") {
        queryClient.invalidateQueries({ queryKey: ["/api/games/matchmaking/status"] });
        toast({
          title: t("multiplayer.inviteReceived"),
          description: `${data.data.sender.username} ${t("multiplayer.invitedYou")}`,
        });
      }

      if (data.type === "invite_response") {
        if (data.data.accepted) {
          setFoundMatch(data.data.match);
          setMatchFoundDialog(true);
        } else {
          toast({
            title: t("multiplayer.inviteDeclined"),
            description: t("multiplayer.friendDeclinedInvite"),
            variant: "destructive",
          });
        }
        queryClient.invalidateQueries({ queryKey: ["/api/games/matchmaking/status"] });
      }

      if (data.type === "matchmaking_queued") {
        setIsSearching(true);
        setSearchStartTime(new Date());
      }

      if (data.type === "matchmaking_cancelled") {
        setIsSearching(false);
        setSearchStartTime(null);
      }

      if (data.type === "matchmaking_error") {
        toast({
          title: t("common.error"),
          description: data.error,
          variant: "destructive",
        });
      }
    };

    setWs(socket);

    return () => {
      socket.close();
    };
  }, [token]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSearching && searchStartTime) {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - searchStartTime.getTime()) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isSearching, searchStartTime]);

  useEffect(() => {
    if (matchmakingStatus?.inQueue) {
      setIsSearching(true);
      if (!searchStartTime) {
        setSearchStartTime(new Date(matchmakingStatus.inQueue.createdAt));
      }
    }
  }, [matchmakingStatus]);

  const joinRandomMutation = useMutation({
    mutationFn: async (gameId: string) => {
      return apiRequest("POST", `/api/games/${gameId}/matchmaking/random`);
    },
    onSuccess: async (res: Response) => {
      const data = typeof res?.json === 'function' ? await res.json() : res;
      if (data.matched) {
        setFoundMatch(data.match);
        setMatchFoundDialog(true);
      } else {
        setIsSearching(true);
        setSearchStartTime(new Date());
      }
      queryClient.invalidateQueries({ queryKey: ["/api/games/matchmaking/status"] });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const inviteFriendMutation = useMutation({
    mutationFn: async ({ gameId, friendAccountId }: { gameId: string; friendAccountId: string }) => {
      return apiRequest("POST", `/api/games/${gameId}/matchmaking/friend`, { friendAccountId });
    },
    onSuccess: () => {
      toast({
        title: t("multiplayer.inviteSent"),
        description: t("multiplayer.waitingForResponse"),
      });
      setFriendAccountId("");
      queryClient.invalidateQueries({ queryKey: ["/api/games/matchmaking/status"] });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const cancelMatchmakingMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/games/matchmaking/cancel");
    },
    onSuccess: () => {
      setIsSearching(false);
      setSearchStartTime(null);
      queryClient.invalidateQueries({ queryKey: ["/api/games/matchmaking/status"] });
    },
  });

  const acceptMatchMutation = useMutation({
    mutationFn: async (matchId: string) => {
      return apiRequest("POST", `/api/games/matches/${matchId}/accept`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games/matchmaking/status"] });
      toast({
        title: t("multiplayer.matchAccepted"),
        description: t("multiplayer.gameStarting"),
      });
    },
  });

  const declineMatchMutation = useMutation({
    mutationFn: async (matchId: string) => {
      return apiRequest("POST", `/api/games/matches/${matchId}/decline`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games/matchmaking/status"] });
    },
  });

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleJoinRandom = () => {
    if (!selectedGameId) {
      toast({
        title: t("multiplayer.selectGame"),
        description: t("multiplayer.selectGameDesc"),
        variant: "destructive",
      });
      return;
    }
    joinRandomMutation.mutate(selectedGameId);
  };

  const handleInviteFriend = () => {
    if (!selectedGameId) {
      toast({
        title: t("multiplayer.selectGame"),
        description: t("multiplayer.selectGameDesc"),
        variant: "destructive",
      });
      return;
    }

    const targetAccountId = friendSelectionMode === 'list'
      ? selectedFriend?.accountId
      : friendAccountId;

    if (!targetAccountId) {
      toast({
        title: friendSelectionMode === 'list'
          ? t("multiplayer.selectFriend")
          : t("multiplayer.enterAccountId"),
        description: friendSelectionMode === 'list'
          ? t("multiplayer.selectFriendDesc")
          : t("multiplayer.enterAccountIdDesc"),
        variant: "destructive",
      });
      return;
    }
    inviteFriendMutation.mutate({ gameId: selectedGameId, friendAccountId: targetAccountId });
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
            <Gamepad2 className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-multiplayer-title">{t("multiplayer.title")}</h1>
            <p className="text-muted-foreground">{t("multiplayer.subtitle")}</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600">
            <Wifi className="h-3 w-3" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-medium">
              {matchmakingStatus?.queueCount || 0} {t("multiplayer.inQueue")}
            </span>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("multiplayer.selectGame")}</CardTitle>
          <CardDescription>{t("multiplayer.selectGameDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedGameId} onValueChange={setSelectedGameId}>
            <SelectTrigger data-testid="select-game">
              <SelectValue placeholder={t("multiplayer.chooseGame")} />
            </SelectTrigger>
            <SelectContent>
              {games.map((game: GameItem) => (
                <SelectItem key={game.id} value={game.id}>
                  {game.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isSearching ? (
        <Card className="border-primary">
          <CardContent className="p-6">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold">{t("multiplayer.searching")}</h3>
                <p className="text-muted-foreground">{t("multiplayer.searchingDesc")}</p>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="font-mono text-lg" data-testid="text-elapsed-time">{formatTime(elapsedTime)}</span>
              </div>
              <Button
                variant="outline"
                onClick={() => cancelMatchmakingMutation.mutate()}
                data-testid="button-cancel-search"
              >
                <X className="w-4 h-4 me-2" />
                {t("multiplayer.cancelSearch")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="hover-elevate">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shuffle className="w-5 h-5" />
                {t("multiplayer.randomMatch")}
              </CardTitle>
              <CardDescription>{t("multiplayer.randomMatchDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="w-4 h-4" />
                <span>{t("multiplayer.playersOnline")}</span>
              </div>
              <Button
                className="w-full"
                onClick={handleJoinRandom}
                disabled={joinRandomMutation.isPending || !selectedGameId}
                data-testid="button-join-random"
              >
                {joinRandomMutation.isPending ? (
                  <Loader2 className="w-4 h-4 me-2 animate-spin" />
                ) : (
                  <Shuffle className="w-4 h-4 me-2" />
                )}
                {t("multiplayer.findMatch")}
              </Button>
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                {t("multiplayer.friendMatch")}
              </CardTitle>
              <CardDescription>{t("multiplayer.friendMatchDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={friendSelectionMode} onValueChange={(v) => setFriendSelectionMode(v as 'list' | 'manual')}>
                <TabsList className="w-full">
                  <TabsTrigger value="list" className="flex-1" data-testid="tab-friend-list">
                    <UserCheck className="w-4 h-4 me-1" />
                    {t("multiplayer.friendsList")}
                  </TabsTrigger>
                  <TabsTrigger value="manual" className="flex-1" data-testid="tab-manual-entry">
                    <UserPlus className="w-4 h-4 me-1" />
                    {t("multiplayer.manualEntry")}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="list" className="mt-4">
                  {friends.length > 0 ? (
                    <ScrollArea className="h-48 border rounded-lg">
                      <div className="p-2 space-y-1">
                        {friends.map((friend: FriendItem) => (
                          <div
                            key={friend.id}
                            className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${selectedFriend?.id === friend.id
                                ? 'bg-primary/20 border border-primary'
                                : 'hover-elevate'
                              }`}
                            onClick={() => setSelectedFriend(friend)}
                            data-testid={`friend-item-${friend.id}`}
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={friend.friend?.avatarUrl} />
                              <AvatarFallback>
                                {(friend.friend?.username || 'U').charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <p className="text-sm font-medium">{friend.friend?.username}</p>
                              <p className="text-xs text-muted-foreground">@{friend.friend?.accountId}</p>
                            </div>
                            {selectedFriend?.id === friend.id && (
                              <Check className="w-4 h-4 text-primary" />
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">
                        {t("multiplayer.noFriendsYet")}
                      </p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="manual" className="mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="friendAccountId">{t("multiplayer.friendAccountId")}</Label>
                    <Input
                      id="friendAccountId"
                      placeholder={t("multiplayer.enterFriendAccountId")}
                      value={friendAccountId}
                      onChange={(e) => setFriendAccountId(e.target.value)}
                      data-testid="input-friend-account-id"
                    />
                  </div>
                </TabsContent>
              </Tabs>

              <Button
                className="w-full"
                onClick={handleInviteFriend}
                disabled={inviteFriendMutation.isPending || !selectedGameId ||
                  (friendSelectionMode === 'list' ? !selectedFriend : !friendAccountId)}
                data-testid="button-invite-friend"
              >
                {inviteFriendMutation.isPending ? (
                  <Loader2 className="w-4 h-4 me-2 animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4 me-2" />
                )}
                {t("multiplayer.inviteFriend")}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {matchmakingStatus?.pendingInvites && matchmakingStatus.pendingInvites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("multiplayer.pendingInvites")}</CardTitle>
            <CardDescription>{t("multiplayer.pendingInvitesDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {matchmakingStatus.pendingInvites.map((invite: { id: string; createdAt: string;[key: string]: unknown }) => (
              <div
                key={invite.id}
                className="flex items-center justify-between p-3 bg-muted rounded-md"
                data-testid={`invite-${invite.id}`}
              >
                <div className="flex items-center gap-3">
                  <Gamepad2 className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium">{t("multiplayer.gameInvite")}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(invite.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => acceptMatchMutation.mutate(invite.id)}
                    disabled={acceptMatchMutation.isPending}
                    data-testid={`button-accept-${invite.id}`}
                  >
                    <Check className="w-4 h-4 me-1" />
                    {t("common.accept")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => declineMatchMutation.mutate(invite.id)}
                    disabled={declineMatchMutation.isPending}
                    data-testid={`button-decline-${invite.id}`}
                  >
                    <XCircle className="w-4 h-4 me-1" />
                    {t("common.decline")}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {matchmakingStatus?.activeMatches && matchmakingStatus.activeMatches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("multiplayer.activeMatches")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {matchmakingStatus.activeMatches.map((match: { id: string; startedAt: string;[key: string]: unknown }) => (
              <div
                key={match.id}
                className="flex items-center justify-between p-3 bg-muted rounded-md"
                data-testid={`match-${match.id}`}
              >
                <div className="flex items-center gap-3">
                  <Badge>{t("multiplayer.inProgress")}</Badge>
                  <span className="text-sm">{new Date(match.startedAt).toLocaleString()}</span>
                </div>
                <Button size="sm" data-testid={`button-play-${match.id}`}>
                  {t("multiplayer.play")}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={matchFoundDialog} onOpenChange={setMatchFoundDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gamepad2 className="w-5 h-5 text-primary" />
              {t("multiplayer.matchFound")}
            </DialogTitle>
            <DialogDescription>{t("multiplayer.matchFoundDesc")}</DialogDescription>
          </DialogHeader>
          {foundMatch && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={foundMatch.player1?.avatarUrl} />
                    <AvatarFallback>{foundMatch.player1?.username?.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{foundMatch.player1?.username}</p>
                    <p className="text-sm text-muted-foreground">{t("multiplayer.level")} {foundMatch.player1?.vipLevel || 1}</p>
                  </div>
                </div>
                <span className="text-xl font-bold text-muted-foreground">{t("lobby.versus")}</span>
                <div className="flex items-center gap-3">
                  <div className="text-end">
                    <p className="font-medium">{foundMatch.player2?.username}</p>
                    <p className="text-sm text-muted-foreground">{t("multiplayer.level")} {foundMatch.player2?.vipLevel || 1}</p>
                  </div>
                  <Avatar>
                    <AvatarImage src={foundMatch.player2?.avatarUrl} />
                    <AvatarFallback>{foundMatch.player2?.username?.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                </div>
              </div>
              {foundMatch.game && (
                <div className="text-center">
                  <Badge variant="outline" className="text-lg px-4 py-1">
                    {foundMatch.game.name}
                  </Badge>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setMatchFoundDialog(false)} data-testid="button-start-game">
              {t("multiplayer.startGame")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
