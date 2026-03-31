import {
  scheduledConfigChanges,
  type ScheduledConfigChange, type InsertScheduledConfigChange,
  type ScheduledChangeStatus,
} from "@shared/schema";
import { db } from "../../db";
import { eq, desc, and, asc, lte } from "drizzle-orm";
import { getErrorMessage } from "../helpers";
import { getMultiplayerGame, updateMultiplayerGame } from "../games";
import { setSystemConfig } from "./settings";

// ==================== SCHEDULED CONFIG CHANGES ====================

export async function createScheduledConfigChange(change: InsertScheduledConfigChange): Promise<ScheduledConfigChange> {
  const [created] = await db.insert(scheduledConfigChanges).values(change).returning();
  return created;
}

export async function getScheduledConfigChange(id: string): Promise<ScheduledConfigChange | undefined> {
  const [change] = await db.select().from(scheduledConfigChanges).where(eq(scheduledConfigChanges.id, id));
  return change || undefined;
}

export async function listScheduledConfigChanges(gameId?: string, status?: string): Promise<ScheduledConfigChange[]> {
  const conditions = [];
  if (gameId) conditions.push(eq(scheduledConfigChanges.gameId, gameId));
  if (status) conditions.push(eq(scheduledConfigChanges.status, status as ScheduledChangeStatus));

  if (conditions.length > 0) {
    return db.select().from(scheduledConfigChanges)
      .where(and(...conditions))
      .orderBy(desc(scheduledConfigChanges.scheduledAt));
  }
  return db.select().from(scheduledConfigChanges).orderBy(desc(scheduledConfigChanges.scheduledAt));
}

export async function getPendingScheduledChanges(): Promise<ScheduledConfigChange[]> {
  const now = new Date();
  return db.select().from(scheduledConfigChanges)
    .where(and(
      eq(scheduledConfigChanges.status, 'pending'),
      lte(scheduledConfigChanges.scheduledAt, now)
    ))
    .orderBy(asc(scheduledConfigChanges.scheduledAt));
}

export async function updateScheduledConfigChange(id: string, data: Partial<ScheduledConfigChange>): Promise<ScheduledConfigChange | undefined> {
  const [updated] = await db.update(scheduledConfigChanges)
    .set(data)
    .where(eq(scheduledConfigChanges.id, id))
    .returning();
  return updated || undefined;
}

export async function cancelScheduledConfigChange(id: string): Promise<boolean> {
  const change = await getScheduledConfigChange(id);
  if (!change || change.status !== 'pending') {
    return false;
  }
  await db.update(scheduledConfigChanges)
    .set({ status: 'cancelled' })
    .where(eq(scheduledConfigChanges.id, id));
  return true;
}

export async function applyScheduledConfigChange(id: string): Promise<{ success: boolean; error?: string }> {
  const change = await getScheduledConfigChange(id);
  if (!change) {
    return { success: false, error: 'Scheduled change not found' };
  }
  if (change.status !== 'pending') {
    return { success: false, error: `Change is not pending (status: ${change.status})` };
  }

  try {
    const game = await getMultiplayerGame(change.gameId);
    if (!game) {
      await updateScheduledConfigChange(id, { status: 'failed', failureReason: 'Game not found', appliedAt: new Date() });
      return { success: false, error: 'Game not found' };
    }

    // Apply the change based on action type
    switch (change.action) {
      case 'activate':
        await updateMultiplayerGame(change.gameId, { isActive: true });
        break;
      case 'deactivate':
        await updateMultiplayerGame(change.gameId, { isActive: false });
        break;
      case 'update_settings':
        if (change.changes) {
          const settings = JSON.parse(change.changes);
          await updateMultiplayerGame(change.gameId, settings);
        }
        break;
    }

    // Mark as applied
    await updateScheduledConfigChange(id, { status: 'applied', appliedAt: new Date() });

    // Update config version to trigger real-time sync
    await setSystemConfig('multiplayer_games_version', Date.now().toString());

    return { success: true };
  } catch (error: unknown) {
    await updateScheduledConfigChange(id, { status: 'failed', failureReason: getErrorMessage(error), appliedAt: new Date() });
    return { success: false, error: getErrorMessage(error) };
  }
}
