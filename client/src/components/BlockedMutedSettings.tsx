import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Ban, Volume2, UserCheck, VolumeX, Users, Bell, BellOff } from "lucide-react";
import { useLocation } from "wouter";

interface UserInfo {
  id: string;
  username: string;
  nickname?: string;
  profilePicture?: string;
}

export function BlockedMutedSettings() {
  const { t, language, dir } = useI18n();
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const blockedUserIds = user?.blockedUsers || [];
  const mutedUserIds = user?.mutedUsers || [];
  const notificationMutedUserIds = user?.notificationMutedUsers || [];

  const { data: blockedUsersInfo, isLoading: loadingBlocked } = useQuery<UserInfo[]>({
    queryKey: ['/api/users/batch', blockedUserIds],
    queryFn: async () => {
      if (blockedUserIds.length === 0) return [];
      const res = await apiRequest('POST', '/api/users/batch', { userIds: blockedUserIds });
      return res.json();
    },
    enabled: blockedUserIds.length > 0,
  });

  const { data: mutedUsersInfo, isLoading: loadingMuted } = useQuery<UserInfo[]>({
    queryKey: ['/api/users/batch', mutedUserIds],
    queryFn: async () => {
      if (mutedUserIds.length === 0) return [];
      const res = await apiRequest('POST', '/api/users/batch', { userIds: mutedUserIds });
      return res.json();
    },
    enabled: mutedUserIds.length > 0,
  });

  const { data: notificationMutedUsersInfo, isLoading: loadingNotificationMuted } = useQuery<UserInfo[]>({
    queryKey: ['/api/users/batch', notificationMutedUserIds],
    queryFn: async () => {
      if (notificationMutedUserIds.length === 0) return [];
      const res = await apiRequest('POST', '/api/users/batch', { userIds: notificationMutedUserIds });
      return res.json();
    },
    enabled: notificationMutedUserIds.length > 0,
  });

  const unblockMutation = useMutation({
    mutationFn: (userId: string) => apiRequest('DELETE', `/api/users/${userId}/block`),
    onSuccess: () => {
      toast({ title: t('chat.unblockSuccess') });
      refreshUser();
    },
    onError: (err: Error) => {
      toast({ title: t('common.error'), description: err.message, variant: 'destructive' });
    }
  });

  const unmuteMutation = useMutation({
    mutationFn: (userId: string) => apiRequest('DELETE', `/api/users/${userId}/mute`),
    onSuccess: () => {
      toast({ title: t('chat.unmuteSuccess') });
      refreshUser();
    },
    onError: (err: Error) => {
      toast({ title: t('common.error'), description: err.message, variant: 'destructive' });
    }
  });

  const unmuteNotificationsMutation = useMutation({
    mutationFn: (userId: string) => apiRequest('DELETE', `/api/users/${userId}/notification-mute`),
    onSuccess: () => {
      toast({ title: t('chat.unmuteNotificationsSuccess') });
      refreshUser();
    },
    onError: (err: Error) => {
      toast({ title: t('common.error'), description: err.message, variant: 'destructive' });
    }
  });

  const openConversation = (userId: string) => {
    navigate(`/chat?user=${userId}`);
  };

  const renderUserCard = (userInfo: UserInfo, onAction: () => void, actionLabel: string, isPending: boolean, Icon: typeof UserCheck) => {
    const displayName = userInfo.nickname || userInfo.username;
    const openLabel = `${t('settings.openConversation')} - @${userInfo.username}`;
    return (
      <div
        key={userInfo.id}
        role="button"
        tabIndex={0}
        aria-label={openLabel}
        title={t('settings.openConversation')}
        onClick={() => openConversation(userInfo.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openConversation(userInfo.id);
          }
        }}
        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid={`user-card-${userInfo.id}`}
      >
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={userInfo.profilePicture} />
            <AvatarFallback>
              {displayName?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{displayName}</p>
            <p className="text-sm text-muted-foreground">@{userInfo.username}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onAction();
          }}
          disabled={isPending}
          data-testid={`button-action-${userInfo.id}`}
        >
          <Icon className="w-4 h-4 me-2" />
          {actionLabel}
        </Button>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          {t('settings.blockedMuted')}
        </CardTitle>
        <CardDescription>{t('settings.blockedMutedDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="blocked" className="w-full">
          <TabsList className="grid w-full grid-cols-3 gap-1">
            <TabsTrigger value="blocked" data-testid="tab-blocked-users">
              <Ban className="w-4 h-4 me-2" />
              {t('settings.blockedUsers')}
              {blockedUserIds.length > 0 && (
                <Badge variant="secondary" className="ms-2">{blockedUserIds.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="muted" data-testid="tab-muted-users">
              <VolumeX className="w-4 h-4 me-2" />
              {t('settings.mutedUsers')}
              {mutedUserIds.length > 0 && (
                <Badge variant="secondary" className="ms-2">{mutedUserIds.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="notification-muted" data-testid="tab-notification-muted-users">
              <BellOff className="w-4 h-4 me-2" />
              {t('settings.notificationMutedUsers')}
              {notificationMutedUserIds.length > 0 && (
                <Badge variant="secondary" className="ms-2">{notificationMutedUserIds.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="blocked" className="mt-4">
            <p className="text-sm text-muted-foreground mb-4">
              {t('settings.blockedUsersDesc')}
            </p>
            {loadingBlocked ? (
              <div className="space-y-3">
                {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : blockedUserIds.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Ban className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>{t('settings.noBlockedUsers')}</p>
              </div>
            ) : (
              <ScrollArea className="h-[300px]">
                <div className="space-y-3">
                  {(blockedUsersInfo || []).map(userInfo =>
                    renderUserCard(
                      userInfo,
                      () => unblockMutation.mutate(userInfo.id),
                      t('chat.unblockUser'),
                      unblockMutation.isPending,
                      UserCheck
                    )
                  )}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="muted" className="mt-4">
            <p className="text-sm text-muted-foreground mb-4">
              {t('settings.mutedUsersDesc')}
            </p>
            {loadingMuted ? (
              <div className="space-y-3">
                {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : mutedUserIds.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <VolumeX className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>{t('settings.noMutedUsers')}</p>
              </div>
            ) : (
              <ScrollArea className="h-[300px]">
                <div className="space-y-3">
                  {(mutedUsersInfo || []).map(userInfo =>
                    renderUserCard(
                      userInfo,
                      () => unmuteMutation.mutate(userInfo.id),
                      t('chat.unmuteUser'),
                      unmuteMutation.isPending,
                      Volume2
                    )
                  )}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="notification-muted" className="mt-4">
            <p className="text-sm text-muted-foreground mb-4">
              {t('settings.notificationMutedUsersDesc')}
            </p>
            {loadingNotificationMuted ? (
              <div className="space-y-3">
                {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : notificationMutedUserIds.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="empty-notification-muted">
                <BellOff className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>{t('settings.noNotificationMutedUsers')}</p>
              </div>
            ) : (
              <ScrollArea className="h-[300px]">
                <div className="space-y-3">
                  {(notificationMutedUsersInfo || []).map(userInfo =>
                    renderUserCard(
                      userInfo,
                      () => unmuteNotificationsMutation.mutate(userInfo.id),
                      t('chat.unmuteNotifications'),
                      unmuteNotificationsMutation.isPending,
                      Bell
                    )
                  )}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
