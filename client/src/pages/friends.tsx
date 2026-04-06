import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  UserPlus,
  UserMinus,
  Search,
  MessageCircle,
  Swords,
  Ban,
  Loader2,
  X,
  UserCheck,
  Globe,
  ShieldOff,
} from "lucide-react";
import type { User } from "@shared/schema";

type UserWithFollowStatus = Omit<User, "password"> & {
  isFollowing?: boolean;
  isBlocked?: boolean;
  isOnline?: boolean;
  level?: number;
  avatarUrl?: string;
};

/* ═══════════════ User Card ═══════════════ */
function UserCard({
  user,
  actionType,
  onAction,
  isLoading,
  t,
}: {
  user: UserWithFollowStatus;
  actionType: "friend" | "following" | "follower" | "blocked" | "search";
  onAction: (userId: string, action: string) => void;
  isLoading: boolean;
  t: (key: string) => string;
}) {
  const initials = (user.username || "U").slice(0, 2).toUpperCase();
  const level = user.level || 1;
  const isOnline = user.isOnline;

  return (
    <div
      className="group relative flex items-center gap-3 p-3 rounded-xl 
                 bg-card/50 border border-border/40 hover:border-primary/30
                 hover:bg-card/80 transition-all duration-200"
      data-testid={`card-user-${user.id}`}
    >
      {/* Avatar with online indicator */}
      <div className="relative flex-shrink-0">
        <Avatar className="h-12 w-12 ring-2 ring-border/30 group-hover:ring-primary/20 transition-all" data-testid={`avatar-user-${user.id}`}>
          <AvatarImage src={user.avatarUrl || user.profilePicture || undefined} alt={user.username} />
          <AvatarFallback className="text-sm font-semibold bg-primary/10 text-primary">{initials}</AvatarFallback>
        </Avatar>
        <span className={`absolute -bottom-0.5 -end-0.5 h-3.5 w-3.5 rounded-full border-2 border-card
          ${isOnline ? "bg-emerald-500" : "bg-gray-400"}`}
          title={isOnline ? t("friends.online") : t("friends.offline")}
        />
      </div>

      {/* User info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-sm truncate" data-testid={`text-username-${user.id}`}>
            {user.username}
          </span>
          <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-mono border-primary/20 text-primary/70" data-testid={`badge-level-${user.id}`}>
            Lv.{level}
          </Badge>
          {actionType === "friend" && (
            <Badge className="text-[10px] h-5 px-1.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0" data-testid={`badge-mutual-${user.id}`}>
              <UserCheck className="w-3 h-3 me-0.5" />
              {t("friends.mutualFriend")}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground/70 truncate mt-0.5" data-testid={`text-accountid-${user.id}`}>
          @{user.accountId}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {actionType === "friend" && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full hover:bg-primary/10 hover:text-primary"
              onClick={() => onAction(user.id, "chat")}
              disabled={isLoading}
              data-testid={`button-chat-${user.id}`}
              title={t("friends.chat")}
            >
              <MessageCircle className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full hover:bg-orange-500/10 hover:text-orange-500"
              onClick={() => onAction(user.id, "challenge")}
              disabled={isLoading}
              data-testid={`button-challenge-${user.id}`}
              title={t("friends.challenge")}
            >
              <Swords className="w-4 h-4" />
            </Button>
          </>
        )}

        {actionType === "following" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-full text-xs hover:bg-red-500/10 hover:text-red-500"
            onClick={() => onAction(user.id, "unfollow")}
            disabled={isLoading}
            data-testid={`button-unfollow-${user.id}`}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <UserMinus className="w-3.5 h-3.5 me-1" />
                {t("friends.unfollow")}
              </>
            )}
          </Button>
        )}

        {actionType === "follower" && (
          user.isFollowing ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-full text-xs hover:bg-red-500/10 hover:text-red-500"
              onClick={() => onAction(user.id, "unfollow")}
              disabled={isLoading}
              data-testid={`button-follower-unfollow-${user.id}`}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <UserMinus className="w-3.5 h-3.5 me-1" />
                  {t("friends.unfollow")}
                </>
              )}
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-8 rounded-full text-xs bg-primary hover:bg-primary/90"
              onClick={() => onAction(user.id, "follow")}
              disabled={isLoading}
              data-testid={`button-followback-${user.id}`}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5 me-1" />
                  {t("friends.followBack")}
                </>
              )}
            </Button>
          )
        )}

        {actionType === "blocked" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-full text-xs hover:bg-emerald-500/10 hover:text-emerald-500"
            onClick={() => onAction(user.id, "unblock")}
            disabled={isLoading}
            data-testid={`button-unblock-${user.id}`}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <ShieldOff className="w-3.5 h-3.5 me-1" />
                {t("friends.unblock")}
              </>
            )}
          </Button>
        )}

        {actionType === "search" && !user.isBlocked && (
          <Button
            variant={user.isFollowing ? "ghost" : "default"}
            size="sm"
            className={`h-8 rounded-full text-xs ${user.isFollowing
              ? "hover:bg-red-500/10 hover:text-red-500"
              : "bg-primary hover:bg-primary/90"
              }`}
            onClick={() => onAction(user.id, user.isFollowing ? "unfollow" : "follow")}
            disabled={isLoading}
            data-testid={`button-follow-${user.id}`}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : user.isFollowing ? (
              <>
                <UserMinus className="w-3.5 h-3.5 me-1" />
                {t("friends.unfollow")}
              </>
            ) : (
              <>
                <UserPlus className="w-3.5 h-3.5 me-1" />
                {t("friends.follow")}
              </>
            )}
          </Button>
        )}

        {actionType !== "blocked" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full hover:bg-red-500/10 hover:text-red-500"
            onClick={() => onAction(user.id, user.isBlocked ? "unblock" : "block")}
            disabled={isLoading}
            data-testid={`button-block-toggle-${user.id}`}
            title={user.isBlocked ? t("chat.unblockUser") : t("chat.blockUser")}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : user.isBlocked ? <ShieldOff className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════ Loading Skeleton ═══════════════ */
function CardSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border/30">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/* ═══════════════ Empty State ═══════════════ */
function EmptySection({ icon: Icon, message, sub }: { icon: React.ComponentType<{ className?: string }>; message: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-2xl bg-muted/40 p-5 mb-4">
        <Icon className="h-10 w-10 text-muted-foreground/50" />
      </div>
      <p className="font-semibold text-muted-foreground">{message}</p>
      <p className="text-xs text-muted-foreground/60 mt-1 max-w-[260px]">{sub}</p>
    </div>
  );
}

/* ═══════════════ Tab Button ═══════════════ */
function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  testId: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`
        relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium
        transition-all duration-200 whitespace-nowrap
        ${active
          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
          : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
        }
      `}
    >
      <Icon className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">{label}</span>
      {(count ?? 0) > 0 && (
        <span className={`
          inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold
          ${active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/15 text-primary"}
        `}>
          {count}
        </span>
      )}
    </button>
  );
}

/* ═══════════════ Stats Card ═══════════════ */
function StatsBar({
  friends,
  following,
  followers,
  t,
}: {
  friends: number;
  following: number;
  followers: number;
  t: (key: string) => string;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        { label: t("friends.totalFriends"), value: friends, color: "text-primary" },
        { label: t("friends.totalFollowing"), value: following, color: "text-blue-500" },
        { label: t("friends.totalFollowers"), value: followers, color: "text-emerald-500" },
      ].map((stat) => (
        <div
          key={stat.label}
          className="flex flex-col items-center py-3 rounded-xl bg-card/60 border border-border/30"
        >
          <span className={`text-xl font-bold tabular-nums ${stat.color}`}>{stat.value}</span>
          <span className="text-[10px] text-muted-foreground/70 mt-0.5">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════ Main Page ═══════════════ */
export default function FriendsPage() {
  const { t, dir } = useI18n();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"friends" | "following" | "followers" | "blocked">("friends");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const trimmedSearchQuery = searchQuery.trim();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(trimmedSearchQuery);
    }, 250);

    return () => clearTimeout(timer);
  }, [trimmedSearchQuery]);

  const { data: friends = [], isLoading: friendsLoading } = useQuery<UserWithFollowStatus[]>({
    queryKey: ["/api/users/friends"],
  });

  const { data: following = [], isLoading: followingLoading } = useQuery<UserWithFollowStatus[]>({
    queryKey: ["/api/users/following"],
  });

  const { data: followers = [], isLoading: followersLoading } = useQuery<UserWithFollowStatus[]>({
    queryKey: ["/api/users/followers"],
  });

  const { data: blocked = [], isLoading: blockedLoading } = useQuery<UserWithFollowStatus[]>({
    queryKey: ["/api/users/blocked"],
  });

  // Global search — searches ALL users, not just friends
  const { data: searchResults = [], isLoading: searchLoading } = useQuery<UserWithFollowStatus[]>({
    queryKey: ["/api/users/search", debouncedSearchQuery],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/users/search?q=${encodeURIComponent(debouncedSearchQuery)}`);
      return res.json();
    },
    enabled: debouncedSearchQuery.length >= 2,
  });

  const invalidateSocialQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/users/friends"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/following"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/followers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/blocked"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/search"] });
  };

  const followMutation = useMutation({
    mutationFn: async (userId: string) => apiRequest("POST", `/api/users/follow/${userId}`),
    onSuccess: () => {
      toast({ title: t("friends.followSuccess") });
      invalidateSocialQueries();
    },
    onError: () => toast({ title: t("common.error"), variant: "destructive" }),
    onSettled: () => setActionLoadingId(null),
  });

  const unfollowMutation = useMutation({
    mutationFn: async (userId: string) => apiRequest("DELETE", `/api/users/unfollow/${userId}`),
    onSuccess: () => {
      toast({ title: t("friends.unfollowSuccess") });
      invalidateSocialQueries();
    },
    onError: () => toast({ title: t("common.error"), variant: "destructive" }),
    onSettled: () => setActionLoadingId(null),
  });

  const blockMutation = useMutation({
    mutationFn: async ({ userId, action }: { userId: string; action: "block" | "unblock" }) =>
      apiRequest(action === "block" ? "POST" : "DELETE", `/api/users/${userId}/block`),
    onSuccess: (_data, variables) => {
      toast({ title: t(variables.action === "block" ? "chat.blockSuccess" : "friends.unblockSuccess") });
      invalidateSocialQueries();
    },
    onError: () => toast({ title: t("common.error"), variant: "destructive" }),
    onSettled: () => setActionLoadingId(null),
  });

  const handleAction = (userId: string, action: string) => {
    setActionLoadingId(userId);
    switch (action) {
      case "follow": followMutation.mutate(userId); break;
      case "unfollow": unfollowMutation.mutate(userId); break;
      case "block": blockMutation.mutate({ userId, action: "block" }); break;
      case "unblock": blockMutation.mutate({ userId, action: "unblock" }); break;
      case "chat":
        window.location.href = `/chat?user=${userId}`;
        setActionLoadingId(null);
        break;
      case "challenge":
        window.location.href = `/challenges?opponent=${userId}`;
        setActionLoadingId(null);
        break;
      default: setActionLoadingId(null);
    }
  };

  const followingIds = new Set(following.map((u) => u.id));
  const followerUsers = followers.map((user) => ({
    ...user,
    isFollowing: followingIds.has(user.id),
  }));

  // Determine active content
  const renderContent = () => {
    if (isSearchActive && debouncedSearchQuery.length >= 2) {
      // Show search results
      if (searchLoading) return <CardSkeleton />;
      if (searchResults.length === 0) {
        return <EmptySection icon={Search} message={t("friends.noResults")} sub={t("friends.noResultsDesc")} />;
      }
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground px-1">{t("friends.searchResults")} ({searchResults.length})</p>
          {searchResults.map((user) => (
            <UserCard key={user.id} user={user} actionType="search" onAction={handleAction} isLoading={actionLoadingId === user.id} t={t} />
          ))}
        </div>
      );
    }

    if (isSearchActive && trimmedSearchQuery.length > 0 && trimmedSearchQuery.length < 2) {
      return <EmptySection icon={Search} message={t("friends.typeToSearch")} sub="" />;
    }

    if (isSearchActive && trimmedSearchQuery.length === 0) {
      return <EmptySection icon={Globe} message={t("friends.searchAllUsers")} sub={t("friends.searchPlaceholder")} />;
    }

    switch (activeTab) {
      case "friends":
        if (friendsLoading) return <CardSkeleton />;
        if (friends.length === 0) return <EmptySection icon={Users} message={t("friends.noFriends")} sub={t("friends.noFriendsDesc")} />;
        return (
          <div className="space-y-2">
            {friends.map((user) => (
              <UserCard key={user.id} user={user} actionType="friend" onAction={handleAction} isLoading={actionLoadingId === user.id} t={t} />
            ))}
          </div>
        );

      case "following":
        if (followingLoading) return <CardSkeleton />;
        if (following.length === 0) return <EmptySection icon={UserPlus} message={t("friends.noFollowing")} sub={t("friends.noFollowingDesc")} />;
        return (
          <div className="space-y-2">
            {following.map((user) => (
              <UserCard key={user.id} user={user} actionType="following" onAction={handleAction} isLoading={actionLoadingId === user.id} t={t} />
            ))}
          </div>
        );

      case "followers":
        if (followersLoading) return <CardSkeleton />;
        if (followerUsers.length === 0) return <EmptySection icon={Users} message={t("friends.noFollowers")} sub={t("friends.noFollowersDesc")} />;
        return (
          <div className="space-y-2">
            {followerUsers.map((user) => (
              <UserCard key={user.id} user={user} actionType="follower" onAction={handleAction} isLoading={actionLoadingId === user.id} t={t} />
            ))}
          </div>
        );

      case "blocked":
        if (blockedLoading) return <CardSkeleton />;
        if (blocked.length === 0) return <EmptySection icon={Ban} message={t("friends.noBlocked")} sub={t("friends.noBlockedDesc")} />;
        return (
          <div className="space-y-2">
            {blocked.map((user) => (
              <UserCard key={user.id} user={user} actionType="blocked" onAction={handleAction} isLoading={actionLoadingId === user.id} t={t} />
            ))}
          </div>
        );
    }
  };

  return (
    <div className="min-h-full" dir={dir}>
      <div className="max-w-lg mx-auto px-3 py-4 space-y-4">

        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight" data-testid="text-friends-title">
            {t("friends.title")}
          </h1>
          <p className="text-xs text-muted-foreground/70" data-testid="text-friends-subtitle">
            {t("friends.subtitle")}
          </p>
        </div>

        {/* Stats */}
        <StatsBar
          friends={friends.length}
          following={following.length}
          followers={followers.length}
          t={t}
        />

        {/* Global Search Bar */}
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <Input
            ref={searchInputRef}
            placeholder={t("friends.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value.length > 0) setIsSearchActive(true);
            }}
            onFocus={() => setIsSearchActive(true)}
            className="ps-10 pe-9 h-11 rounded-xl bg-muted/40 border-border/30 
                       focus:bg-card focus:border-primary/30 transition-all"
            data-testid="input-search-users"
          />
          {isSearchActive && (
            <button
              className="absolute end-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/60 text-muted-foreground/60 hover:text-foreground transition-colors"
              onClick={() => {
                setSearchQuery("");
                setIsSearchActive(false);
                searchInputRef.current?.blur();
              }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Tab Navigation — hidden when search is active */}
        {!isSearchActive && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none" data-testid="tabs-friends">
            <TabButton
              active={activeTab === "friends"}
              onClick={() => setActiveTab("friends")}
              icon={Users}
              label={t("friends.friends")}
              count={friends.length}
              testId="tab-friends"
            />
            <TabButton
              active={activeTab === "following"}
              onClick={() => setActiveTab("following")}
              icon={UserPlus}
              label={t("friends.following")}
              count={following.length}
              testId="tab-following"
            />
            <TabButton
              active={activeTab === "followers"}
              onClick={() => setActiveTab("followers")}
              icon={Users}
              label={t("friends.followers")}
              count={followers.length}
              testId="tab-followers"
            />
            <TabButton
              active={activeTab === "blocked"}
              onClick={() => setActiveTab("blocked")}
              icon={Ban}
              label={t("friends.blocked")}
              count={blocked.length}
              testId="tab-blocked"
            />
          </div>
        )}

        {/* Content */}
        <div className="min-h-[300px]" data-testid={isSearchActive ? "content-search" : `content-${activeTab}`}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
