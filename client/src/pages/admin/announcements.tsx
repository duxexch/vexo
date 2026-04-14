import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { Announcement } from '@shared/schema';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  Edit,
  Send,
  Archive,
  Eye,
  Megaphone,
  Pin
} from 'lucide-react';
import { format } from 'date-fns';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';

type AnnouncementFormData = {
  title: string;
  titleAr: string;
  content: string;
  contentAr: string;
  target: string;
  priority: string;
  isPinned: boolean;
  expiresAt: string;
};

const defaultFormData: AnnouncementFormData = {
  title: '',
  titleAr: '',
  content: '',
  contentAr: '',
  target: 'all',
  priority: 'normal',
  isPinned: false,
  expiresAt: '',
};

const SURFACE_CARD_CLASS = 'overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.35)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/75';
const STAT_CARD_CLASS = 'rounded-[24px] border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-slate-100/80 p-4 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950/80';
const DATA_CARD_CLASS = `${SURFACE_CARD_CLASS} shadow-[0_18px_45px_-28px_rgba(15,23,42,0.28)]`;
const BUTTON_3D_CLASS = 'inline-flex items-center justify-center rounded-2xl border border-slate-200/80 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-[0_10px_24px_-16px_rgba(15,23,42,0.6)] transition-all hover:-translate-y-0.5 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800';
const BUTTON_3D_PRIMARY_CLASS = 'inline-flex items-center justify-center rounded-2xl border border-primary/20 bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-[0_14px_30px_-18px_rgba(14,116,144,0.65)] transition-all hover:-translate-y-0.5 hover:brightness-105';
const INPUT_SURFACE_CLASS = 'rounded-2xl border-slate-200/80 bg-white/90 shadow-inner shadow-slate-200/40 dark:border-slate-700 dark:bg-slate-950/70 dark:shadow-black/20';
const TEXTAREA_SURFACE_CLASS = `${INPUT_SURFACE_CLASS} min-h-[140px]`;
const DIALOG_SURFACE_CLASS = 'rounded-[30px] border border-slate-200/80 bg-white/95 shadow-[0_30px_90px_-45px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/95';

export default function AdminAnnouncementsPage() {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<AnnouncementFormData>(defaultFormData);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  if (user?.role !== 'admin') {
    setLocation('/');
    return null;
  }

  const { data: announcements, isLoading } = useQuery<Announcement[]>({
    queryKey: ['/api/admin/announcements', statusFilter !== 'all' ? `?status=${statusFilter}` : ''],
  });

  const createMutation = useMutation({
    mutationFn: async (data: AnnouncementFormData & { status?: string }) => {
      const res = await apiRequest('POST', '/api/admin/announcements', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/announcements'] });
      setIsCreateDialogOpen(false);
      setFormData(defaultFormData);
      toast({
        title: t('common.success'),
        description: t('admin.announcements.created'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AnnouncementFormData> & { status?: string } }) => {
      const res = await apiRequest('PATCH', `/api/admin/announcements/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/announcements'] });
      setEditingAnnouncement(null);
      setFormData(defaultFormData);
      toast({
        title: t('common.success'),
        description: t('admin.announcements.updated'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('POST', `/api/admin/announcements/${id}/publish`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/announcements'] });
      setIsPublishDialogOpen(false);
      setPublishingId(null);
      toast({
        title: t('common.success'),
        description: t('admin.announcements.published'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('PATCH', `/api/admin/announcements/${id}`, { status: 'archived' });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/announcements'] });
      toast({
        title: t('common.success'),
        description: t('admin.announcements.archived'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleOpenCreate = () => {
    setFormData(defaultFormData);
    setEditingAnnouncement(null);
    setIsCreateDialogOpen(true);
  };

  const handleOpenEdit = (announcement: Announcement) => {
    setFormData({
      title: announcement.title,
      titleAr: announcement.titleAr || '',
      content: announcement.content,
      contentAr: announcement.contentAr || '',
      target: announcement.target,
      priority: announcement.priority,
      isPinned: announcement.isPinned,
      expiresAt: announcement.expiresAt ? format(new Date(announcement.expiresAt), "yyyy-MM-dd'T'HH:mm") : '',
    });
    setEditingAnnouncement(announcement);
    setIsCreateDialogOpen(true);
  };

  const handleOpenPublish = (id: string) => {
    setPublishingId(id);
    setIsPublishDialogOpen(true);
  };

  const handleSaveAsDraft = () => {
    if (editingAnnouncement) {
      updateMutation.mutate({ id: editingAnnouncement.id, data: { ...formData, status: 'draft' } });
    } else {
      createMutation.mutate({ ...formData, status: 'draft' });
    }
  };

  const handleSaveAndPublish = () => {
    if (editingAnnouncement) {
      updateMutation.mutate({ id: editingAnnouncement.id, data: formData });
      setTimeout(() => publishMutation.mutate(editingAnnouncement.id), 500);
    } else {
      createMutation.mutate({ ...formData, status: 'draft' });
    }
    setIsCreateDialogOpen(false);
  };

  const handleConfirmPublish = () => {
    if (publishingId) {
      publishMutation.mutate(publishingId);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'published':
        return 'default';
      case 'draft':
        return 'secondary';
      case 'archived':
        return 'outline';
      case 'scheduled':
        return 'secondary';
      default:
        return 'secondary';
    }
  };

  const getPriorityBadgeVariant = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'destructive';
      case 'high':
        return 'destructive';
      case 'normal':
        return 'default';
      case 'low':
        return 'secondary';
      default:
        return 'secondary';
    }
  };

  const getTargetLabel = (target: string) => {
    switch (target) {
      case 'all':
        return t('admin.announcements.targetAll');
      case 'players':
        return t('admin.announcements.targetPlayers');
      case 'agents':
        return t('admin.announcements.targetAgents');
      case 'affiliates':
        return t('admin.announcements.targetAffiliates');
      case 'vip':
        return t('admin.announcements.targetVip');
      default:
        return target;
    }
  };

  const announcementList = announcements || [];
  const publishedCount = announcementList.filter((item) => item.status === 'published').length;
  const draftCount = announcementList.filter((item) => item.status === 'draft').length;
  const pinnedCount = announcementList.filter((item) => item.isPinned).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 pb-8 sm:p-6">
      <section className="relative overflow-hidden rounded-[32px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.18),_transparent_34%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(241,245,249,0.94))] p-5 shadow-[0_28px_80px_-40px_rgba(15,23,42,0.5)] dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_right,_rgba(34,197,94,0.12),_transparent_30%),linear-gradient(135deg,_rgba(2,6,23,0.98),_rgba(15,23,42,0.92))]">
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-4">
            <Badge variant="outline" className="w-fit rounded-full border-sky-200 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200">
              {t('admin.announcements.title')}
            </Badge>
            <div className="space-y-2">
              <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                <Megaphone className="h-7 w-7 text-primary" />
                {t('admin.announcements.title')}
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">{t('admin.announcements.description')}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Card className={STAT_CARD_CLASS}>
                <CardContent className="p-0">
                  <p className="text-xs text-muted-foreground">{t('admin.announcements.statusPublished')}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-50">{publishedCount}</p>
                </CardContent>
              </Card>
              <Card className={STAT_CARD_CLASS}>
                <CardContent className="p-0">
                  <p className="text-xs text-muted-foreground">{t('admin.announcements.statusDraft')}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-50">{draftCount}</p>
                </CardContent>
              </Card>
              <Card className={STAT_CARD_CLASS}>
                <CardContent className="p-0">
                  <p className="text-xs text-muted-foreground">{t('admin.announcements.fieldIsPinned')}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-50">{pinnedCount}</p>
                </CardContent>
              </Card>
              <Card className={STAT_CARD_CLASS}>
                <CardContent className="p-0">
                  <p className="text-xs text-muted-foreground">{t('nav.announcements')}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-50">{announcementList.length}</p>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="grid w-full gap-3 sm:grid-cols-[160px_minmax(0,1fr)] xl:w-[420px]">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className={INPUT_SURFACE_CLASS} data-testid="select-status-filter">
                <SelectValue placeholder={t('common.status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('p2p.all')}</SelectItem>
                <SelectItem value="draft">{t('admin.announcements.statusDraft')}</SelectItem>
                <SelectItem value="published">{t('admin.announcements.statusPublished')}</SelectItem>
                <SelectItem value="archived">{t('admin.announcements.statusArchived')}</SelectItem>
              </SelectContent>
            </Select>
            <Button className={cn(BUTTON_3D_PRIMARY_CLASS, 'gap-2')} onClick={handleOpenCreate} data-testid="button-create-announcement">
              <Plus className="h-4 w-4" />
              {t('admin.announcements.create')}
            </Button>
          </div>
        </div>
      </section>

      <Card className={DATA_CARD_CLASS}>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-[24px]" />
              ))}
            </div>
          ) : !announcementList.length ? (
            <div className="rounded-[24px] border border-dashed border-slate-300/90 bg-slate-50/70 py-12 text-center text-muted-foreground dark:border-slate-700 dark:bg-slate-900/50">
              <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('admin.announcements.noAnnouncements')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-3 md:hidden">
                {announcementList.map((announcement) => (
                  <div key={announcement.id} className={STAT_CARD_CLASS} data-testid={`row-announcement-${announcement.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {announcement.isPinned && <Pin className="h-4 w-4 text-primary" />}
                          <span className="truncate font-medium text-slate-900 dark:text-slate-50" data-testid={`text-title-${announcement.id}`}>
                            {language === 'ar' && announcement.titleAr ? announcement.titleAr : announcement.title}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                          {language === 'ar' && announcement.contentAr ? announcement.contentAr : announcement.content}
                        </p>
                      </div>
                      <Badge variant={getStatusBadgeVariant(announcement.status)} data-testid={`badge-status-${announcement.id}`}>
                        {t(`admin.announcements.status${announcement.status.charAt(0).toUpperCase() + announcement.status.slice(1)}`)}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="outline" className="text-xs">{getTargetLabel(announcement.target)}</Badge>
                      <Badge variant={getPriorityBadgeVariant(announcement.priority)} className="text-xs">{announcement.priority}</Badge>
                      <Badge variant="outline" className="text-xs flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" />
                        <span data-testid={`text-views-${announcement.id}`}>{announcement.viewCount}</span>
                      </Badge>
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">{format(new Date(announcement.createdAt), 'MMM dd, yyyy')}</div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        className={cn(BUTTON_3D_CLASS, 'h-9 gap-2 text-xs')}
                        onClick={() => handleOpenEdit(announcement)}
                        data-testid={`button-edit-${announcement.id}`}
                      >
                        <Edit className="h-4 w-4" />
                        {t('common.edit')}
                      </Button>
                      {announcement.status === 'draft' && (
                        <Button
                          className={cn(BUTTON_3D_PRIMARY_CLASS, 'h-9 gap-2 text-xs')}
                          onClick={() => handleOpenPublish(announcement.id)}
                          data-testid={`button-publish-${announcement.id}`}
                        >
                          <Send className="h-4 w-4" />
                          {t('admin.announcements.publishNow')}
                        </Button>
                      )}
                      {announcement.status === 'published' && (
                        <Button
                          className={cn(BUTTON_3D_CLASS, 'h-9 gap-2 text-xs')}
                          onClick={() => archiveMutation.mutate(announcement.id)}
                          data-testid={`button-archive-${announcement.id}`}
                        >
                          <Archive className="h-4 w-4" />
                          {t('admin.announcements.statusArchived')}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto rounded-[24px] border border-slate-200/80 bg-white/80 dark:border-slate-800 dark:bg-slate-950/60 md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('admin.announcements.columnTitle')}</TableHead>
                      <TableHead>{t('admin.announcements.columnTarget')}</TableHead>
                      <TableHead>{t('admin.announcements.columnPriority')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                      <TableHead>{t('admin.announcements.columnViews')}</TableHead>
                      <TableHead>{t('common.date')}</TableHead>
                      <TableHead>{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {announcementList.map((announcement) => (
                      <TableRow key={announcement.id} data-testid={`row-announcement-${announcement.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {announcement.isPinned && (
                              <Pin className="h-4 w-4 text-primary" />
                            )}
                            <span className="font-medium" data-testid={`text-title-${announcement.id}`}>
                              {language === 'ar' && announcement.titleAr ? announcement.titleAr : announcement.title}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {getTargetLabel(announcement.target)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getPriorityBadgeVariant(announcement.priority)} className="text-xs">
                            {announcement.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(announcement.status)} data-testid={`badge-status-${announcement.id}`}>
                            {t(`admin.announcements.status${announcement.status.charAt(0).toUpperCase() + announcement.status.slice(1)}`)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Eye className="h-4 w-4" />
                            <span data-testid={`text-views-${announcement.id}`}>{announcement.viewCount}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(announcement.createdAt), 'MMM dd, yyyy')}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              className={`${BUTTON_3D_CLASS} h-9 w-9 p-0`}
                              onClick={() => handleOpenEdit(announcement)}
                              data-testid={`button-edit-${announcement.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {announcement.status === 'draft' && (
                              <Button
                                className={`${BUTTON_3D_PRIMARY_CLASS} h-9 w-9 p-0`}
                                onClick={() => handleOpenPublish(announcement.id)}
                                data-testid={`button-publish-${announcement.id}`}
                              >
                                <Send className="h-4 w-4" />
                              </Button>
                            )}
                            {announcement.status === 'published' && (
                              <Button
                                className={`${BUTTON_3D_CLASS} h-9 w-9 p-0`}
                                onClick={() => archiveMutation.mutate(announcement.id)}
                                data-testid={`button-archive-${announcement.id}`}
                              >
                                <Archive className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className={`${DIALOG_SURFACE_CLASS} max-w-2xl max-h-[90vh] overflow-y-auto`}>
          <DialogHeader>
            <DialogTitle>
              {editingAnnouncement
                ? t('admin.announcements.editTitle')
                : t('admin.announcements.createTitle')}
            </DialogTitle>
            <DialogDescription>
              {editingAnnouncement
                ? t('admin.announcements.editDescription')
                : t('admin.announcements.createDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">{t('admin.announcements.fieldTitle')} (EN)</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={t('admin.announcements.fieldTitlePlaceholder')}
                  className={INPUT_SURFACE_CLASS}
                  data-testid="input-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="titleAr">{t('admin.announcements.fieldTitle')} (AR)</Label>
                <Input
                  id="titleAr"
                  value={formData.titleAr}
                  onChange={(e) => setFormData({ ...formData, titleAr: e.target.value })}
                  placeholder={t('admin.announcements.fieldTitleArPlaceholder')}
                  dir="rtl"
                  className={INPUT_SURFACE_CLASS}
                  data-testid="input-title-ar"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">{t('admin.announcements.fieldContent')} (EN)</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder={t('admin.announcements.fieldContentPlaceholder')}
                rows={4}
                className={TEXTAREA_SURFACE_CLASS}
                data-testid="textarea-content"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contentAr">{t('admin.announcements.fieldContent')} (AR)</Label>
              <Textarea
                id="contentAr"
                value={formData.contentAr}
                onChange={(e) => setFormData({ ...formData, contentAr: e.target.value })}
                placeholder={t('admin.announcements.fieldContentArPlaceholder')}
                rows={4}
                dir="rtl"
                className={TEXTAREA_SURFACE_CLASS}
                data-testid="textarea-content-ar"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('admin.announcements.fieldTarget')}</Label>
                <Select value={formData.target} onValueChange={(v) => setFormData({ ...formData, target: v })}>
                  <SelectTrigger className={INPUT_SURFACE_CLASS} data-testid="select-target">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('admin.announcements.targetAll')}</SelectItem>
                    <SelectItem value="players">{t('admin.announcements.targetPlayers')}</SelectItem>
                    <SelectItem value="agents">{t('admin.announcements.targetAgents')}</SelectItem>
                    <SelectItem value="affiliates">{t('admin.announcements.targetAffiliates')}</SelectItem>
                    <SelectItem value="vip">{t('admin.announcements.targetVip')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('admin.announcements.fieldPriority')}</Label>
                <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                  <SelectTrigger className={INPUT_SURFACE_CLASS} data-testid="select-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t('admin.announcements.priorityLow')}</SelectItem>
                    <SelectItem value="normal">{t('admin.announcements.priorityNormal')}</SelectItem>
                    <SelectItem value="high">{t('admin.announcements.priorityHigh')}</SelectItem>
                    <SelectItem value="urgent">{t('admin.announcements.priorityUrgent')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expiresAt">{t('admin.announcements.fieldExpiresAt')}</Label>
                <Input
                  id="expiresAt"
                  type="datetime-local"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                  className={INPUT_SURFACE_CLASS}
                  data-testid="input-expires-at"
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch
                  id="isPinned"
                  checked={formData.isPinned}
                  onCheckedChange={(v) => setFormData({ ...formData, isPinned: v })}
                  data-testid="switch-is-pinned"
                />
                <Label htmlFor="isPinned" className="cursor-pointer">
                  {t('admin.announcements.fieldIsPinned')}
                </Label>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 flex-wrap">
            <Button
              className={BUTTON_3D_CLASS}
              onClick={() => setIsCreateDialogOpen(false)}
              data-testid="button-cancel-dialog"
            >
              {t('common.cancel')}
            </Button>
            <Button
              className={BUTTON_3D_CLASS}
              onClick={handleSaveAsDraft}
              disabled={!formData.title || !formData.content || createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-draft"
            >
              {t('admin.announcements.saveAsDraft')}
            </Button>
            {!editingAnnouncement && (
              <Button
                className={cn(BUTTON_3D_PRIMARY_CLASS, 'gap-2')}
                onClick={handleSaveAndPublish}
                disabled={!formData.title || !formData.content || createMutation.isPending}
                data-testid="button-save-publish"
              >
                <Send className="h-4 w-4" />
                {t('admin.announcements.saveAndPublish')}
              </Button>
            )}
            {editingAnnouncement && (
              <Button
                className={BUTTON_3D_PRIMARY_CLASS}
                onClick={() => {
                  updateMutation.mutate({ id: editingAnnouncement.id, data: formData });
                }}
                disabled={!formData.title || !formData.content || updateMutation.isPending}
                data-testid="button-save-changes"
              >
                {t('common.save')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={isPublishDialogOpen}
        title={t('admin.announcements.publishConfirmTitle')}
        description={t('admin.announcements.publishConfirmDescription')}
        confirmLabel={t('admin.announcements.publishNow')}
        loading={publishMutation.isPending}
        onConfirm={handleConfirmPublish}
        onCancel={() => setIsPublishDialogOpen(false)}
      />
    </div>
  );
}
