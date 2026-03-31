import { storage } from "../storage";
import { broadcastAdminAlert } from "../websocket";
import type { InsertAdminAlert } from "@shared/schema";

export async function emitAdminAlert(alert: Omit<InsertAdminAlert, 'isRead' | 'readAt' | 'readBy'>) {
  const created = await storage.createAdminAlert({
    ...alert,
    isRead: false,
  });
  
  broadcastAdminAlert(created);
  
  return created;
}

export async function emitDisputeAlert(options: {
  disputeId: string;
  tradeId?: string;
  isNew: boolean;
  severity?: 'info' | 'warning' | 'critical' | 'urgent';
  message: string;
  messageAr?: string;
}) {
  const type = options.isNew ? 'new_dispute' : 'dispute_update';
  const title = options.isNew ? 'New P2P Dispute Opened' : 'P2P Dispute Updated';
  const titleAr = options.isNew ? 'نزاع P2P جديد' : 'تحديث نزاع P2P';
  
  return emitAdminAlert({
    type,
    severity: options.severity || (options.isNew ? 'warning' : 'info'),
    title,
    titleAr,
    message: options.message,
    messageAr: options.messageAr,
    entityType: 'p2p_dispute',
    entityId: options.disputeId,
    deepLink: `/admin/p2p?dispute=${options.disputeId}`,
    metadata: options.tradeId ? JSON.stringify({ tradeId: options.tradeId }) : undefined,
  });
}

export async function emitComplaintAlert(options: {
  complaintId: string;
  ticketNumber: string;
  isNew: boolean;
  isEscalated?: boolean;
  severity?: 'info' | 'warning' | 'critical' | 'urgent';
  message: string;
  messageAr?: string;
}) {
  const type = options.isEscalated ? 'complaint_escalated' : (options.isNew ? 'new_complaint' : 'new_complaint');
  const title = options.isEscalated ? 'Complaint Escalated' : (options.isNew ? 'New Complaint Submitted' : 'Complaint Updated');
  const titleAr = options.isEscalated ? 'تصعيد شكوى' : (options.isNew ? 'شكوى جديدة' : 'تحديث شكوى');
  
  return emitAdminAlert({
    type,
    severity: options.severity || (options.isEscalated ? 'critical' : (options.isNew ? 'warning' : 'info')),
    title,
    titleAr,
    message: options.message,
    messageAr: options.messageAr,
    entityType: 'complaint',
    entityId: options.complaintId,
    deepLink: `/admin/disputes`,
    metadata: JSON.stringify({ ticketNumber: options.ticketNumber }),
  });
}

export async function emitGameChangeAlert(options: {
  gameId: string;
  gameKey: string;
  gameName: string;
  action: 'activated' | 'deactivated' | 'updated';
  message: string;
  messageAr?: string;
}) {
  return emitAdminAlert({
    type: 'game_change',
    severity: 'info',
    title: `Game ${options.action}: ${options.gameName}`,
    titleAr: `تحديث اللعبة: ${options.gameName}`,
    message: options.message,
    messageAr: options.messageAr,
    entityType: 'multiplayer_game',
    entityId: options.gameId,
    deepLink: `/admin/multiplayer-games`,
    metadata: JSON.stringify({ gameKey: options.gameKey, action: options.action }),
  });
}

export async function emitSystemAlert(options: {
  title: string;
  titleAr?: string;
  message: string;
  messageAr?: string;
  severity?: 'info' | 'warning' | 'critical' | 'urgent';
  deepLink?: string;
  entityType?: string;
  entityId?: string;
}) {
  return emitAdminAlert({
    type: 'system_alert',
    severity: options.severity || 'info',
    title: options.title,
    titleAr: options.titleAr,
    message: options.message,
    messageAr: options.messageAr,
    deepLink: options.deepLink,
    entityType: options.entityType,
    entityId: options.entityId,
  });
}
