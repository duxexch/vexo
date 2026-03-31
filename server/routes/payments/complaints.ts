import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";
import crypto from "crypto";

export function registerComplaintRoutes(app: Express): void {

  app.get("/api/complaints", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { status } = req.query;
      const userId = req.user!.role === "admin" || req.user!.role === "agent" ? undefined : req.user!.id;
      const complaints = await storage.listComplaints(userId, status as string);
      res.json(complaints);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/complaints", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const agent = await storage.getAvailableAgentForAssignment();
      // SECURITY: Whitelist allowed fields — prevent mass assignment of userId, status, priority, etc.
      const { subject, description, category, transactionId } = req.body;
      const safeSubject = subject ? String(subject).replace(/<[^>]*>/g, '').slice(0, 200) : '';
      const safeDescription = description ? String(description).replace(/<[^>]*>/g, '').slice(0, 2000) : '';
      const complaint = await storage.createComplaint({
        userId: req.user!.id,
        ticketNumber: `CMP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
        assignedAgentId: agent?.id,
        status: agent ? "assigned" : "open",
        slaDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
        subject: safeSubject,
        description: safeDescription,
        category: (category ? String(category).slice(0, 50) : 'other') as any,
      });
      if (agent) {
        await storage.updateAgent(agent.id, { assignedCustomersCount: agent.assignedCustomersCount + 1 });
      }
      const { emitComplaintAlert } = await import("../../lib/admin-alerts");
      emitComplaintAlert({
        complaintId: complaint.id,
        ticketNumber: complaint.ticketNumber || complaint.id.slice(0, 8),
        isNew: true,
        message: `New complaint from user ${req.user!.username}: ${req.body.subject || 'No subject'}`,
        messageAr: `شكوى جديدة من المستخدم ${req.user!.username}: ${req.body.subject || 'بدون عنوان'}`,
      }).catch(() => {});
      res.status(201).json(complaint);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/complaints/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const complaint = await storage.getComplaint(req.params.id);
      if (!complaint) return res.status(404).json({ error: "Complaint not found" });
      // SECURITY: Only complaint owner, assigned agent, or admin can view
      if (complaint.userId !== req.user!.id && req.user!.role !== 'admin' && req.user!.role !== 'agent') {
        return res.status(403).json({ error: "Access denied" });
      }
      const messages = await storage.getComplaintMessages(complaint.id);
      res.json({ ...complaint, messages });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/complaints/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "agent" && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Agent access required" });
      }
      // SECURITY: Whitelist allowed update fields — prevent mass assignment
      const { status, priority, adminNote, resolution } = req.body;
      const safeUpdate: Record<string, any> = {};
      if (status) safeUpdate.status = String(status).slice(0, 50);
      if (priority) safeUpdate.priority = String(priority).slice(0, 20);
      if (adminNote) safeUpdate.adminNote = String(adminNote).replace(/<[^>]*>/g, '').slice(0, 1000);
      if (resolution) safeUpdate.resolution = String(resolution).replace(/<[^>]*>/g, '').slice(0, 2000);
      const complaint = await storage.updateComplaint(req.params.id, safeUpdate);
      if (!complaint) return res.status(404).json({ error: "Complaint not found" });
      res.json(complaint);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/complaints/:id/messages", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      // SECURITY: Verify user is party to this complaint
      const complaint = await storage.getComplaint(req.params.id);
      if (!complaint) return res.status(404).json({ error: "Complaint not found" });
      if (complaint.userId !== req.user!.id && req.user!.role !== 'admin' && req.user!.role !== 'agent') {
        return res.status(403).json({ error: "Access denied" });
      }
      const message = await storage.addComplaintMessage({
        complaintId: req.params.id, senderId: req.user!.id, message: req.body.message, isInternal: req.body.isInternal || false,
      });
      res.status(201).json(message);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
