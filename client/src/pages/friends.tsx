import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users,
  Globe,
  UserPlus,
  UserMinus,
  Search,
  MessageCircle,
  Swords,
  Ban,
  Loader2,
  X,
  UserCheck,
  ShieldOff,
  Eye,
  EyeOff,
  MoreHorizontal,
  Clock3,
  Flag,
  BellOff,
  User as UserIcon,
  Sparkles,
  Send,
  RefreshCw,
} from "lucide-react";
import type { User } from "@shared/schema";
import { cn } from "@/lib/utils";

type UserWithFollowStatus = Omit<User, "password"> & {
  isFollowing?: boolean;
  isFollower?: boolean;
  isFriend?: boolean;
  isBlocked?: boolean;
  hasPendingRequestSent?: boolean;
  hasPendingRequestReceived?: boolean;
  isOnline?: boolean;
  level?: number;
  avatarUrl?: string;
  mutualFriendCount?: number;
};

type ActionType =
  | "friend"
  | "following"
  | "follower"
  | "request"
  | "outgoing"
  | "blocked"
  | "search"
  | "suggestion";

type TabKey = "friends" | "following" | "followers" | "requests" | "outgoing" | "blocked";

/* ═══════════════ User Card (Stadium-styled) ═══════════════ */
function UserCard({
  user,
  actionType,
  onAction,
  isLoading,
  t,
}: {
  user: UserWithFollowStatus;
  actionType: ActionType;
  onAction: (userId: string, action: string) => void;
  isLoading: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const initials = (user.username || "U").slice(0, 2).toUpperCase();
  const level = user.level || 1;
  const isOnline = !!user.isOnline;
  const mutual = user.mutualFriendCount ?? 0;

  return (
    <div
      className="group relative flex flex-wrap items-start sm:items-center gap-3 p-3 rounded-2xl
                 bg-white/[0.04] dark:bg-white/[0.04] backdrop-blur-sm
                 border border-white/[0.06] dark:border-white/10
                 hover:border-[#1e88ff]/40
                 hover:bg-white/[0.06]
                 hover:shadow-[0_12px_30px_-12px_rgba(30,136,255,0.5)]
                 hover:-translate-y-[1px]
                 transition-all duration-200"
      data-testid={`card-user-${user.id}`}
    >
      {/* Online halo + avatar */}
      <div className="relative flex-shrink-0">
        {isOnline && (
          <span
            className="pointer-events-none absolute inset-0 rounded-full opacity-70"
            style={{
              boxShadow: "0 0 0 2px rgba(16,185,129,0.55), 0 0 18px rgba(16,185,129,0.55)",
            }}
            aria-hidden
          />
        )}
        <Avatar
          className={cn(
            "h-12 w-12 ring-2 transition-all",
            isOnline ? "ring-emerald-400/70" : "ring-white/10 group-hover:ring-[#1e88ff]/40"
          )}
          data-testid={`avatar-user-${user.id}`}
        >
          <AvatarImage src={user.avatarUrl || user.profilePicture || undefined} alt={user.username} />
          <AvatarFallback className="text-sm font-semibold bg-[#1e88ff]/15 text-[#1e88ff]">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "absolute -bottom-0.5 -end-0.5 h-3.5 w-3.5 rounded-full border-2 border-background",
            isOnline ? "bg-emerald-500" : "bg-zinc-500"
          )}
          title={isOnline ? t("friends.online") : t("friends.offline")}
        />
      </div>

      {/* User info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="line-clamp-2 text-sm font-semibold leading-tight break-words [overflow-wrap:anywhere]"
            data-testid={`text-username-${user.id}`}
          >
            {user.username}
          </span>
          <Badge
            variant="outline"
            className="text-[10px] h-5 px-1.5 font-mono border-[#ffb627]/30 text-[#ffb627]/90 bg-[#ffb627]/5"
            data-testid={`badge-level-${user.id}`}
          >
            Lv {level}
          </Badge>
          {actionType === "friend" && (
            <Badge
              className="text-[10px] h-5 px-1.5 bg-emerald-500/15 text-emerald-500 border-0"
              data-testid={`badge-mutual-${user.id}`}
            >
              <UserCheck className="w-3 h-3 me-0.5" />
              {t("friends.mutualFriend")}
            </Badge>
          )}
          {actionType === "suggestion" && mutual > 0 && (
            <Badge className="text-[10px] h-5 px-1.5 bg-[#1e88ff]/15 text-[#1e88ff] border-0">
              <Users className="w-3 h-3 me-0.5" />
              {t("friends.mutualWithCount", { count: mutual })}
            </Badge>
          )}
          {actionType === "outgoing" && (
            <Badge className="text-[10px] h-5 px-1.5 bg-amber-500/15 text-amber-500 border-0">
              <Clock3 className="w-3 h-3 me-0.5" />
              {t("friends.requestPending")}
            </Badge>
          )}
        </div>
        <p
          className="mt-0.5 line-clamp-2 text-xs text-muted-foreground/70 break-words [overflow-wrap:anywhere]"
          data-testid={`text-accountid-${user.id}`}
        >
          @{user.accountId}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex basis-full items-center gap-1.5 flex-wrap justify-start ps-[3.75rem] sm:basis-auto sm:justify-end sm:ps-0">
        {actionType === "friend" && (
          <>
            <Button
              size="sm"
              className="h-9 rounded-full px-3 text-xs bg-gradient-to-r from-[#1e88ff] to-[#0a4d9c] hover:opacity-95 text-white border-0 shadow-[0_4px_14px_-4px_rgba(30,136,255,0.7)]"
              onClick={() => onAction(user.id, "chat")}
              disabled={isLoading}
              data-testid={`button-chat-${user.id}`}
            >
              <MessageCircle className="w-3.5 h-3.5 me-1" />
              {t("friends.chat")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-full px-3 text-xs border-[#ffb627]/40 text-[#ffb627] hover:bg-[#ffb627]/10 hover:text-[#ffb627]"
              onClick={() => onAction(user.id, "challenge")}
              disabled={isLoading}
              data-testid={`button-challenge-${user.id}`}
            >
              <Swords className="w-3.5 h-3.5 me-1" />
              {t("friends.challenge")}
            </Button>
          </>
        )}

        {actionType === "following" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 rounded-full px-3 text-xs hover:bg-red-500/10 hover:text-red-500"
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
              className="h-9 rounded-full px-3 text-xs hover:bg-red-500/10 hover:text-red-500"
              onClick={() => onAction(user.id, "unfollow")}
              disabled={isLoading}
              data-testid={`button-follower-unfollow-${user.id}`}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <><UserMinus className="w-3.5 h-3.5 me-1" />{t("friends.unfollow")}</>
              )}
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-9 rounded-full px-3 text-xs bg-gradient-to-r from-[#1e88ff] to-[#0a4d9c] hover:opacity-95 text-white border-0 shadow-[0_4px_14px_-4px_rgba(30,136,255,0.7)]"
              onClick={() => onAction(user.id, "friend-request")}
              disabled={isLoading}
              data-testid={`button-followback-${user.id}`}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <><UserPlus className="w-3.5 h-3.5 me-1" />{t("friends.addFriend")}</>
              )}
            </Button>
          )
        )}

        {actionType === "request" && (
          <>
            <Button
              size="sm"
              className="h-9 rounded-full px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-[0_4px_14px_-4px_rgba(16,185,129,0.6)]"
              onClick={() => onAction(user.id, "accept-friend-request")}
              disabled={isLoading}
              data-testid={`button-accept-request-${user.id}`}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <><UserCheck className="w-3.5 h-3.5 me-1" />{t("common.accept")}</>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-full px-3 text-xs hover:bg-red-500/10 hover:text-red-500"
              onClick={() => onAction(user.id, "reject-friend-request")}
              disabled={isLoading}
              data-testid={`button-reject-request-${user.id}`}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <><X className="w-3.5 h-3.5 me-1" />{t("transactions.reject")}</>
              )}
            </Button>
          </>
        )}

        {actionType === "outgoing" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 rounded-full px-3 text-xs hover:bg-red-500/10 hover:text-red-500"
            onClick={() => onAction(user.id, "cancel-friend-request")}
            disabled={isLoading}
            data-testid={`button-cancel-outgoing-${user.id}`}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <><X className="w-3.5 h-3.5 me-1" />{t("common.cancel")}</>
            )}
          </Button>
        )}

        {actionType === "blocked" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 rounded-full px-3 text-xs hover:bg-emerald-500/10 hover:text-emerald-500"
            onClick={() => onAction(user.id, "unblock")}
            disabled={isLoading}
            data-testid={`button-unblock-${user.id}`}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <><ShieldOff className="w-3.5 h-3.5 me-1" />{t("friends.unblock")}</>
            )}
          </Button>
        )}

        {(actionType === "search" || actionType === "suggestion") && !user.isBlocked && (
          <>
            {user.isFriend ? (
              <Badge variant="outline" className="h-9 rounded-full px-3 text-xs text-emerald-500 border-emerald-500/40 gap-1">
                <UserCheck className="w-3.5 h-3.5" />
                {t("friends.mutualFriend")}
              </Badge>
            ) : user.hasPendingRequestSent ? (
              <div className="flex items-center gap-1">
                <Badge
                  variant="outline"
                  className="h-9 rounded-full px-3 text-xs text-amber-500 border-amber-500/40 gap-1"
                >
                  <Clock3 className="w-3.5 h-3.5" />
                  {t("friends.requestPending")}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 rounded-full px-2 text-xs text-muted-foreground hover:text-red-500"
                  onClick={() => onAction(user.id, "cancel-friend-request")}
                  disabled={isLoading}
                  aria-label={t("friends.cancelRequest")}
                  data-testid={`button-cancel-request-${user.id}`}
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                </Button>
              </div>
            ) : user.hasPendingRequestReceived ? (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  className="h-9 rounded-full px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => onAction(user.id, "accept-friend-request")}
                  disabled={isLoading}
                  data-testid={`button-accept-request-${user.id}`}
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <><UserCheck className="w-3.5 h-3.5 me-1" />{t("common.accept")}</>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 rounded-full px-2 text-xs text-muted-foreground hover:text-red-500"
                  onClick={() => onAction(user.id, "reject-friend-request")}
                  disabled={isLoading}
                  aria-label={t("common.reject")}
                  data-testid={`button-reject-request-${user.id}`}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                className="h-9 rounded-full px-3 text-xs bg-gradient-to-r from-[#1e88ff] to-[#0a4d9c] hover:opacity-95 text-white border-0 shadow-[0_4px_14px_-4px_rgba(30,136,255,0.7)]"
                onClick={() => onAction(user.id, "friend-request")}
                disabled={isLoading}
                data-testid={`button-add-friend-${user.id}`}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  <><UserPlus className="w-3.5 h-3.5 me-1" />{t("friends.addFriend")}</>
                )}
              </Button>
            )}
          </>
        )}

        {/* Quick actions menu (always visible except for blocked) */}
        {actionType !== "blocked" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full hover:bg-white/10"
                data-testid={`button-menu-${user.id}`}
                aria-label="more"
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => onAction(user.id, "view-profile")} className="gap-2" data-testid={`menu-view-profile-${user.id}`}>
                <UserIcon className="w-4 h-4" />
                {t("friends.viewProfile")}
              </DropdownMenuItem>
              {actionType !== "request" && actionType !== "outgoing" && (
                <DropdownMenuItem onClick={() => onAction(user.id, "chat")} className="gap-2">
                  <MessageCircle className="w-4 h-4" />
                  {t("friends.chat")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onAction(user.id, "challenge")} className="gap-2">
                <Swords className="w-4 h-4" />
                {t("friends.challenge")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAction(user.id, "mute")} className="gap-2">
                <BellOff className="w-4 h-4" />
                {t("friends.muteNotifications")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onAction(user.id, "report")} className="gap-2 text-amber-500 focus:text-amber-500">
                <Flag className="w-4 h-4" />
                {t("friends.report")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAction(user.id, "block")} className="gap-2 text-red-500 focus:text-red-500">
                <Ban className="w-4 h-4" />
                {t("chat.blockUser")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

/* ═══════════════ Loading Skeleton (Stadium) ═══════════════ */
function CardSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 rounded-2xl border border-white/[0.06] bg-white/[0.03]"
        >
          <Skeleton className="h-12 w-12 rounded-full bg-white/[0.06]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28 bg-white/[0.06]" />
            <Skeleton className="h-3 w-20 bg-white/[0.06]" />
          </div>
          <Skeleton className="h-9 w-24 rounded-full bg-white/[0.06]" />
        </div>
      ))}
    </div>
  );
}

/* ═══════════════ Empty Section (Stadium illustration) ═══════════════ */
function EmptySection({
  icon: Icon,
  title,
  desc,
  ctaLabel,
  onCta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-4 text-center rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent">
      <div className="relative mb-5">
        <div className="absolute inset-0 -z-10 rounded-3xl blur-2xl bg-[#1e88ff]/20" />
        <div className="rounded-2xl bg-gradient-to-br from-[#1e88ff]/20 to-[#0a4d9c]/20 border border-[#1e88ff]/30 p-5">
          <Icon className="h-9 w-9 text-[#1e88ff]" />
        </div>
      </div>
      <p className="font-['Bebas_Neue'] tracking-wider text-2xl text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground/80 mt-1.5 max-w-[280px] leading-relaxed">{desc}</p>
      {ctaLabel && onCta && (
        <Button
          size="sm"
          onClick={onCta}
          className="mt-5 h-9 rounded-full px-4 text-xs bg-gradient-to-r from-[#1e88ff] to-[#0a4d9c] hover:opacity-95 text-white border-0 shadow-[0_6px_20px_-6px_rgba(30,136,255,0.7)]"
        >
          <Sparkles className="w-3.5 h-3.5 me-1.5" />
          {ctaLabel}
        </Button>
      )}
    </div>
  );
}

/* ═══════════════ Tab Button (with sliding underline) ═══════════════ */
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
      className={cn(
        "relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium",
        "transition-all duration-200 whitespace-nowrap shrink-0",
        active
          ? "bg-gradient-to-r from-[#1e88ff] to-[#0a4d9c] text-white shadow-[0_6px_18px_-6px_rgba(30,136,255,0.7)]"
          : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
      {(count ?? 0) > 0 && (
        <span
          className={cn(
            "inline-flex items-center justify-center min-w-[20px] h-[20px] px-1 rounded-full text-[10px] font-bold tabular-nums",
            active ? "bg-white/25 text-white" : "bg-[#ffb627]/15 text-[#ffb627]"
          )}
        >
          {count! > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

/* ═══════════════ Stat Tile ═══════════════ */
function StatTile({
  label,
  value,
  icon: Icon,
  accent,
  highlight,
  testId,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: "blue" | "gold" | "emerald" | "violet";
  highlight?: boolean;
  testId?: string;
}) {
  const accentMap = {
    blue: "from-[#1e88ff]/30 to-[#0a4d9c]/20 text-[#1e88ff] border-[#1e88ff]/30",
    gold: "from-[#ffb627]/30 to-[#ff8a00]/20 text-[#ffb627] border-[#ffb627]/30",
    emerald: "from-emerald-500/30 to-emerald-700/20 text-emerald-400 border-emerald-500/30",
    violet: "from-violet-500/30 to-purple-700/20 text-violet-400 border-violet-500/30",
  } as const;

  return (
    <div
      data-testid={testId}
      className={cn(
        "relative flex flex-col items-center justify-center p-3 rounded-2xl border bg-white/[0.03]",
        highlight ? `bg-gradient-to-br ${accentMap[accent]} border-current` : "border-white/[0.06]"
      )}
    >
      <div className={cn("flex items-center gap-1.5 mb-1", highlight ? "" : accentMap[accent].split(" ").find(c => c.startsWith("text-")))}>
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] uppercase tracking-wider opacity-80">{label}</span>
      </div>
      <span className="font-['Bebas_Neue'] tracking-wider text-3xl leading-none tabular-nums">
        {value}
      </span>
    </div>
  );
}

/* ═══════════════ Main Page ═══════════════ */
export default function FriendsPage() {
  const { user, updateUser } = useAuth();
  const { t, dir } = useI18n();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("friends");
  const [searchFilter, setSearchFilter] = useState<"all" | "friends" | "following" | "followers" | "blocked">("all");
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
  const { data: incomingRequests = [], isLoading: incomingRequestsLoading } = useQuery<UserWithFollowStatus[]>({
    queryKey: ["/api/users/friend-requests/incoming"],
  });
  const { data: outgoingRequests = [], isLoading: outgoingRequestsLoading } = useQuery<UserWithFollowStatus[]>({
    queryKey: ["/api/users/friend-requests/outgoing"],
  });
  const { data: suggestions = [], isLoading: suggestionsLoading, refetch: refetchSuggestions } = useQuery<UserWithFollowStatus[]>({
    queryKey: ["/api/users/suggestions"],
  });

  const searchUrl = debouncedSearchQuery.length >= 2
    ? `/api/users/search?q=${encodeURIComponent(debouncedSearchQuery)}&filter=${encodeURIComponent(searchFilter)}`
    : "";

  const { data: searchResults = [], isLoading: searchLoading } = useQuery<UserWithFollowStatus[]>({
    queryKey: [searchUrl],
    enabled: isSearchActive && debouncedSearchQuery.length >= 2,
  });

  const onlineCount = useMemo(
    () => friends.filter(u => u.isOnline).length,
    [friends]
  );

  const invalidateSocialQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/users/friends"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/following"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/followers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/blocked"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/friend-requests/incoming"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/friend-requests/outgoing"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/suggestions"] });
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey?.[0];
        return typeof key === "string" && key.startsWith("/api/users/search");
      },
    });
  };

  const followMutation = useMutation({
    mutationFn: async (userId: string) => apiRequest("POST", `/api/users/follow/${userId}`),
    onSuccess: () => { toast({ title: t("friends.followSuccess") }); invalidateSocialQueries(); },
    onError: () => toast({ title: t("common.error"), variant: "destructive" }),
    onSettled: () => setActionLoadingId(null),
  });

  const unfollowMutation = useMutation({
    mutationFn: async (userId: string) => apiRequest("DELETE", `/api/users/unfollow/${userId}`),
    onSuccess: () => { toast({ title: t("friends.unfollowSuccess") }); invalidateSocialQueries(); },
    onError: () => toast({ title: t("common.error"), variant: "destructive" }),
    onSettled: () => setActionLoadingId(null),
  });

  const sendFriendRequestMutation = useMutation({
    mutationFn: async (userId: string) => apiRequest("POST", `/api/users/friend-request/${userId}`),
    onSuccess: () => { toast({ title: t("friends.requestSentSuccess") }); invalidateSocialQueries(); },
    onError: () => toast({ title: t("common.error"), variant: "destructive" }),
    onSettled: () => setActionLoadingId(null),
  });

  const acceptFriendRequestMutation = useMutation({
    mutationFn: async (userId: string) => apiRequest("POST", `/api/users/friend-request/${userId}/accept`),
    onSuccess: () => { toast({ title: t("friends.requestAcceptedSuccess") }); invalidateSocialQueries(); },
    onError: () => toast({ title: t("common.error"), variant: "destructive" }),
    onSettled: () => setActionLoadingId(null),
  });

  const rejectFriendRequestMutation = useMutation({
    mutationFn: async (userId: string) => apiRequest("POST", `/api/users/friend-request/${userId}/reject`),
    onSuccess: () => { toast({ title: t("friends.requestRejectedSuccess") }); invalidateSocialQueries(); },
    onError: () => toast({ title: t("common.error"), variant: "destructive" }),
    onSettled: () => setActionLoadingId(null),
  });

  const cancelFriendRequestMutation = useMutation({
    mutationFn: async (userId: string) => apiRequest("DELETE", `/api/users/friend-request/${userId}`),
    onSuccess: () => { toast({ title: t("friends.requestCancelledSuccess") }); invalidateSocialQueries(); },
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

  const muteMutation = useMutation({
    mutationFn: async (userId: string) =>
      apiRequest("POST", `/api/users/${userId}/notification-mute`),
    onSuccess: () => toast({ title: t("chat.muteNotificationsSuccess") }),
    onError: () => toast({ title: t("common.error"), variant: "destructive" }),
    onSettled: () => setActionLoadingId(null),
  });

  const reportMutation = useMutation({
    mutationFn: async (userId: string) =>
      apiRequest("POST", `/api/users/${userId}/report`, { context: "profile" }),
    onSuccess: () => toast({ title: t("friends.report") + " ✓" }),
    onError: () => toast({ title: t("common.error"), variant: "destructive" }),
    onSettled: () => setActionLoadingId(null),
  });

  const toggleSearchVisibilityMutation = useMutation({
    mutationFn: async () => {
      const nextStealthMode = !(user?.stealthMode ?? false);
      const response = await apiRequest("PATCH", "/api/user/status", { stealthMode: nextStealthMode });
      return response.json() as Promise<User>;
    },
    onSuccess: (updatedUser) => {
      updateUser(updatedUser);
      toast({ title: t("settings.visibilityUpdated") });
      invalidateSocialQueries();
    },
    onError: () => toast({ title: t("settings.updateFailed"), variant: "destructive" }),
  });

  const handleAction = (userId: string, action: string) => {
    setActionLoadingId(userId);
    switch (action) {
      case "follow": followMutation.mutate(userId); break;
      case "unfollow": unfollowMutation.mutate(userId); break;
      case "friend-request": sendFriendRequestMutation.mutate(userId); break;
      case "accept-friend-request": acceptFriendRequestMutation.mutate(userId); break;
      case "reject-friend-request": rejectFriendRequestMutation.mutate(userId); break;
      case "cancel-friend-request": cancelFriendRequestMutation.mutate(userId); break;
      case "block": blockMutation.mutate({ userId, action: "block" }); break;
      case "unblock": blockMutation.mutate({ userId, action: "unblock" }); break;
      case "mute": muteMutation.mutate(userId); break;
      case "report": reportMutation.mutate(userId); break;
      case "view-profile":
        navigate(`/player/${userId}`);
        setActionLoadingId(null);
        break;
      case "chat":
        navigate(`/chat?user=${userId}`);
        setActionLoadingId(null);
        break;
      case "challenge":
        navigate(`/challenges?opponent=${userId}`);
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

  // Render content for the active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case "friends":
        if (friendsLoading) return <CardSkeleton />;
        if (friends.length === 0) {
          return (
            <EmptySection
              icon={Users}
              title={t("friends.noFriends")}
              desc={t("friends.noFriendsDesc")}
              ctaLabel={t("friends.findPlayers")}
              onCta={() => { setIsSearchActive(true); searchInputRef.current?.focus(); }}
            />
          );
        }
        return (
          <div className="space-y-2">
            {friends.map((u) => (
              <UserCard key={u.id} user={u} actionType="friend" onAction={handleAction} isLoading={actionLoadingId === u.id} t={t} />
            ))}
          </div>
        );
      case "following":
        if (followingLoading) return <CardSkeleton />;
        if (following.length === 0) {
          return <EmptySection icon={UserPlus} title={t("friends.noFollowing")} desc={t("friends.noFollowingDesc")} />;
        }
        return (
          <div className="space-y-2">
            {following.map((u) => (
              <UserCard key={u.id} user={u} actionType="following" onAction={handleAction} isLoading={actionLoadingId === u.id} t={t} />
            ))}
          </div>
        );
      case "followers":
        if (followersLoading) return <CardSkeleton />;
        if (followerUsers.length === 0) {
          return <EmptySection icon={Users} title={t("friends.noFollowers")} desc={t("friends.noFollowersDesc")} />;
        }
        return (
          <div className="space-y-2">
            {followerUsers.map((u) => (
              <UserCard key={u.id} user={u} actionType="follower" onAction={handleAction} isLoading={actionLoadingId === u.id} t={t} />
            ))}
          </div>
        );
      case "requests":
        if (incomingRequestsLoading) return <CardSkeleton />;
        if (incomingRequests.length === 0) {
          return <EmptySection icon={UserCheck} title={t("friends.noPendingRequests")} desc={t("friends.noPendingRequestsDesc")} />;
        }
        return (
          <div className="space-y-2">
            {incomingRequests.map((u) => (
              <UserCard key={u.id} user={u} actionType="request" onAction={handleAction} isLoading={actionLoadingId === u.id} t={t} />
            ))}
          </div>
        );
      case "outgoing":
        if (outgoingRequestsLoading) return <CardSkeleton />;
        if (outgoingRequests.length === 0) {
          return <EmptySection icon={Send} title={t("friends.noOutgoing")} desc={t("friends.noOutgoingDesc")} />;
        }
        return (
          <div className="space-y-2">
            {outgoingRequests.map((u) => (
              <UserCard key={u.id} user={u} actionType="outgoing" onAction={handleAction} isLoading={actionLoadingId === u.id} t={t} />
            ))}
          </div>
        );
      case "blocked":
        if (blockedLoading) return <CardSkeleton />;
        if (blocked.length === 0) {
          return <EmptySection icon={Ban} title={t("friends.noBlocked")} desc={t("friends.noBlockedDesc")} />;
        }
        return (
          <div className="space-y-2">
            {blocked.map((u) => (
              <UserCard key={u.id} user={u} actionType="blocked" onAction={handleAction} isLoading={actionLoadingId === u.id} t={t} />
            ))}
          </div>
        );
    }
  };

  // Suggestions strip — shown only on Friends tab when not searching
  const showSuggestions = activeTab === "friends" && !isSearchActive && (suggestionsLoading || suggestions.length > 0);

  // Search content
  const renderSearchContent = () => {
    if (debouncedSearchQuery.length < 2) {
      if (trimmedSearchQuery.length === 0) {
        return <EmptySection icon={Search} title={t("friends.findPlayers")} desc={t("friends.searchHint")} />;
      }
      return <EmptySection icon={Search} title={t("friends.typeToSearch")} desc="" />;
    }
    if (searchLoading) return <CardSkeleton />;
    if (searchResults.length === 0) {
      return <EmptySection icon={Search} title={t("friends.noResults")} desc={t("friends.noResultsDesc")} />;
    }
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground/80 px-1 font-medium">
          {t("friends.searchResults")} <span className="text-[#1e88ff] tabular-nums">({searchResults.length})</span>
        </p>
        {searchResults.map((u) => (
          <UserCard key={u.id} user={u} actionType="search" onAction={handleAction} isLoading={actionLoadingId === u.id} t={t} />
        ))}
      </div>
    );
  };

  return (
    <div
      className="min-h-[100svh] bg-[radial-gradient(ellipse_at_top,rgba(30,136,255,0.18),transparent_55%)]"
      dir={dir}
    >
      <div className="max-w-2xl mx-auto px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4">
        {/* ═══════ Stadium Hero Header ═══════ */}
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0f1730] via-[#0a0e1a] to-[#0f1730] p-5 shadow-[0_20px_50px_-20px_rgba(30,136,255,0.4)]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(30,136,255,0.25),transparent_55%)] pointer-events-none" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(255,182,39,0.1),transparent_55%)] pointer-events-none" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1
                className="font-['Bebas_Neue'] tracking-wider text-4xl sm:text-5xl text-white leading-none drop-shadow-[0_2px_10px_rgba(30,136,255,0.5)]"
                data-testid="text-friends-title"
              >
                {t("friends.title")}
              </h1>
              <p
                className="text-xs sm:text-sm text-white/60 mt-1.5"
                data-testid="text-friends-subtitle"
              >
                {t("friends.heroSubtitle")}
              </p>
              {/* Online-now pill */}
              {friends.length > 0 && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  <span className="text-[11px] font-medium text-emerald-300 tabular-nums">
                    {t("friends.totalSubtitle", { online: onlineCount, total: friends.length })}
                  </span>
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-xl border-white/20 bg-white/5 hover:bg-white/10 backdrop-blur-sm shrink-0"
              onClick={() => toggleSearchVisibilityMutation.mutate()}
              disabled={toggleSearchVisibilityMutation.isPending}
              title={t("settings.stealthModeDescription")}
              aria-label={t("settings.stealthModeDescription")}
              data-testid="button-toggle-search-visibility"
            >
              {toggleSearchVisibilityMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : user?.stealthMode ? (
                <EyeOff className="w-4 h-4 text-white" />
              ) : (
                <Eye className="w-4 h-4 text-white" />
              )}
            </Button>
          </div>
        </div>

        {/* ═══════ Stat Tiles ═══════ */}
        <div className="grid grid-cols-4 gap-2">
          <StatTile
            label={t("friends.totalFriends")}
            value={friends.length}
            icon={Users}
            accent="blue"
            highlight
            testId="stat-friends"
          />
          <StatTile label={t("friends.totalFollowing")} value={following.length} icon={UserPlus} accent="violet" testId="stat-following" />
          <StatTile label={t("friends.totalFollowers")} value={followers.length} icon={UserCheck} accent="emerald" testId="stat-followers" />
          <StatTile label={t("friends.requests")} value={incomingRequests.length} icon={Sparkles} accent="gold" testId="stat-requests" />
        </div>

        {/* ═══════ Search Bar ═══════ */}
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <Input
            ref={searchInputRef}
            placeholder={t("friends.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value.length > 0) setIsSearchActive(true);
            }}
            onFocus={() => setIsSearchActive(true)}
            className="ps-10 pe-9 h-11 rounded-xl bg-white/[0.04] border-white/10
                       focus:bg-white/[0.07] focus:border-[#1e88ff]/40 transition-all"
            data-testid="input-search-users"
          />
          {isSearchActive && (
            <button
              className="absolute end-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-white/10 text-muted-foreground/60 hover:text-foreground transition-colors"
              onClick={() => {
                setSearchQuery("");
                setIsSearchActive(false);
                setSearchFilter("all");
                searchInputRef.current?.blur();
              }}
              aria-label={t("common.clear")}
              data-testid="button-clear-search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ═══════ Sticky Tab Bar ═══════ */}
        <div className="sticky top-0 z-20 -mx-3 px-3 py-2 backdrop-blur-md bg-background/70 border-b border-white/[0.05]">
          {!isSearchActive ? (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none" data-testid="tabs-friends">
              <TabButton active={activeTab === "friends"} onClick={() => setActiveTab("friends")} icon={Users} label={t("friends.friends")} count={friends.length} testId="tab-friends" />
              <TabButton active={activeTab === "requests"} onClick={() => setActiveTab("requests")} icon={UserCheck} label={t("friends.requests")} count={incomingRequests.length} testId="tab-requests" />
              <TabButton active={activeTab === "outgoing"} onClick={() => setActiveTab("outgoing")} icon={Send} label={t("friends.outgoing")} count={outgoingRequests.length} testId="tab-outgoing" />
              <TabButton active={activeTab === "following"} onClick={() => setActiveTab("following")} icon={UserPlus} label={t("friends.following")} count={following.length} testId="tab-following" />
              <TabButton active={activeTab === "followers"} onClick={() => setActiveTab("followers")} icon={Users} label={t("friends.followers")} count={followers.length} testId="tab-followers" />
              <TabButton active={activeTab === "blocked"} onClick={() => setActiveTab("blocked")} icon={Ban} label={t("friends.blocked")} count={blocked.length} testId="tab-blocked" />
            </div>
          ) : (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none" data-testid="tabs-search-scope">
              <TabButton active={searchFilter === "all"} onClick={() => setSearchFilter("all")} icon={Globe} label={t("common.all")} testId="tab-search-all" />
              <TabButton active={searchFilter === "friends"} onClick={() => setSearchFilter("friends")} icon={Users} label={t("friends.friends")} count={friends.length} testId="tab-search-friends" />
              <TabButton active={searchFilter === "following"} onClick={() => setSearchFilter("following")} icon={UserPlus} label={t("friends.following")} count={following.length} testId="tab-search-following" />
              <TabButton active={searchFilter === "followers"} onClick={() => setSearchFilter("followers")} icon={Users} label={t("friends.followers")} count={followers.length} testId="tab-search-followers" />
              <TabButton active={searchFilter === "blocked"} onClick={() => setSearchFilter("blocked")} icon={Ban} label={t("friends.blocked")} count={blocked.length} testId="tab-search-blocked" />
            </div>
          )}
        </div>

        {/* ═══════ Suggestions strip (Friends tab only) ═══════ */}
        {showSuggestions && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="grid place-items-center w-7 h-7 rounded-lg bg-gradient-to-br from-[#ffb627] to-[#ff8a00] text-black">
                  <Sparkles className="w-3.5 h-3.5" />
                </span>
                <div>
                  <h3 className="font-['Bebas_Neue'] tracking-wider text-base leading-none text-foreground" data-testid="text-suggestions-title">
                    {t("friends.suggestions")}
                  </h3>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">{t("friends.suggestionsDesc")}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-white/10"
                onClick={() => refetchSuggestions()}
                disabled={suggestionsLoading}
                title={t("friends.refresh")}
                aria-label={t("friends.refresh")}
                data-testid="button-refresh-suggestions"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", suggestionsLoading && "animate-spin")} />
              </Button>
            </div>
            {suggestionsLoading ? (
              <CardSkeleton />
            ) : (
              <div className="space-y-2">
                {suggestions.slice(0, 5).map((u) => (
                  <UserCard
                    key={u.id}
                    user={u}
                    actionType="suggestion"
                    onAction={handleAction}
                    isLoading={actionLoadingId === u.id}
                    t={t}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════ Content ═══════ */}
        <div className="min-h-[300px]" data-testid={isSearchActive ? "content-search" : `content-${activeTab}`}>
          {isSearchActive ? renderSearchContent() : renderTabContent()}
        </div>
      </div>
    </div>
  );
}
