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

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              {t('admin.announcements.title')}
            </CardTitle>
            <CardDescription>{t('admin.announcements.description')}</CardDescription>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                <SelectValue placeholder={t('common.status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('p2p.all')}</SelectItem>
                <SelectItem value="draft">{t('admin.announcements.statusDraft')}</SelectItem>
                <SelectItem value="published">{t('admin.announcements.statusPublished')}</SelectItem>
                <SelectItem value="archived">{t('admin.announcements.statusArchived')}</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleOpenCreate} data-testid="button-create-announcement">
              <Plus className="h-4 w-4 me-2" />
              {t('admin.announcements.create')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !announcements?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('admin.announcements.noAnnouncements')}</p>
            </div>
          ) : (
            <div className="rounded-md border">
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
                  {announcements.map((announcement) => (
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
                            size="icon"
                            variant="ghost"
                            onClick={() => handleOpenEdit(announcement)}
                            data-testid={`button-edit-${announcement.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {announcement.status === 'draft' && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleOpenPublish(announcement.id)}
                              data-testid={`button-publish-${announcement.id}`}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                          {announcement.status === 'published' && (
                            <Button
                              size="icon"
                              variant="ghost"
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
          )}
        </CardContent>
      </Card>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                data-testid="textarea-content-ar"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('admin.announcements.fieldTarget')}</Label>
                <Select value={formData.target} onValueChange={(v) => setFormData({ ...formData, target: v })}>
                  <SelectTrigger data-testid="select-target">
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
                  <SelectTrigger data-testid="select-priority">
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
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
              data-testid="button-cancel-dialog"
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="secondary"
              onClick={handleSaveAsDraft}
              disabled={!formData.title || !formData.content || createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-draft"
            >
              {t('admin.announcements.saveAsDraft')}
            </Button>
            {!editingAnnouncement && (
              <Button
                onClick={handleSaveAndPublish}
                disabled={!formData.title || !formData.content || createMutation.isPending}
                data-testid="button-save-publish"
              >
                <Send className="h-4 w-4 me-2" />
                {t('admin.announcements.saveAndPublish')}
              </Button>
            )}
            {editingAnnouncement && (
              <Button
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
