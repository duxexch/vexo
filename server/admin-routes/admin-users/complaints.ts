import type { Express, Response } from "express";
import { storage } from "../../storage";
import { complaints, type ComplaintStatus, type ComplaintPriority } from "@shared/schema";
import { sendNotification } from "../../websocket";
import { db } from "../../db";
import { eq, desc, and } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";

export function registerComplaintsRoutes(app: Express) {

  // ==================== COMPLAINTS / DISPUTES ====================

  app.get("/api/admin/complaints", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { status, priority } = req.query;
      const conditions = [];
      
      if (status) conditions.push(eq(complaints.status, status as ComplaintStatus));
      if (priority) conditions.push(eq(complaints.priority, priority as ComplaintPriority));
      
      let query = db.select().from(complaints);
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }
      
      const result = await query.orderBy(desc(complaints.createdAt));
      res.json(result);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/admin/complaints/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { status, resolution, priority, assignedTo, adminNote } = req.body;
      const updates: Record<string, any> = {};
      if (status !== undefined) updates.status = status;
      if (resolution !== undefined) updates.resolution = resolution;
      if (priority !== undefined) updates.priority = priority;
      if (assignedTo !== undefined) updates.assignedTo = assignedTo;
      if (adminNote !== undefined) updates.adminNote = adminNote;
      
      const updated = await storage.updateComplaint(id, updates);
      
      if (updates.status === "resolved" || updates.status === "closed") {
        await logAdminAction(req.admin!.id, "dispute_resolve", "complaint", id, {
          newValue: updates.status,
          reason: updates.resolution
        }, req);
      }

      if (updated && updated.userId && updates.status) {
        const statusLabels: Record<string, { en: string; ar: string }> = {
          resolved: { en: 'Resolved', ar: 'تم الحل' },
          closed: { en: 'Closed', ar: 'مغلقة' },
          in_progress: { en: 'In Progress', ar: 'قيد المعالجة' },
          escalated: { en: 'Escalated', ar: 'مصعدة' },
        };
        const label = statusLabels[updates.status] || { en: updates.status, ar: updates.status };
        await sendNotification(updated.userId, {
          type: 'system',
          priority: updates.status === 'resolved' || updates.status === 'closed' ? 'high' : 'normal',
          title: `Complaint ${label.en}`,
          titleAr: `الشكوى ${label.ar}`,
          message: `Your complaint has been updated to: ${label.en}.${updates.resolution ? ' Resolution: ' + updates.resolution : ''}`,
          messageAr: `تم تحديث شكواك إلى: ${label.ar}.${updates.resolution ? ' القرار: ' + updates.resolution : ''}`,
          link: '/complaints',
          metadata: JSON.stringify({ complaintId: id, status: updates.status }),
        }).catch(() => {});
      }
      
      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
