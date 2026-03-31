import type { Express, Request, Response } from "express";
import { storage } from "../../storage";
import { supportContacts, insertSupportContactSchema } from "@shared/schema";
import { db } from "../../db";
import { eq, desc } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";

export function registerContactsRoutes(app: Express) {

  // ==================== SUPPORT CONTACTS ====================

  app.get("/api/admin/support/contacts", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const contacts = await db.select().from(supportContacts)
        .orderBy(desc(supportContacts.createdAt));
      res.json(contacts);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/support/contacts", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const parsed = insertSupportContactSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid data", details: parsed.error.errors });

      const [contact] = await db.insert(supportContacts).values(parsed.data).returning();
      await logAdminAction(req.admin?.id || "system", "create_support_contact", "support_contact", contact.id, { metadata: JSON.stringify({ type: contact.type }) }, req);
      res.json(contact);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/admin/support/contacts/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const [contact] = await db.update(supportContacts)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(supportContacts.id, id))
        .returning();

      if (!contact) return res.status(404).json({ error: "Contact not found" });
      await logAdminAction(req.admin?.id || "system", "update_support_contact", "support_contact", id, {}, req);
      res.json(contact);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.delete("/api/admin/support/contacts/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const [deleted] = await db.delete(supportContacts).where(eq(supportContacts.id, id)).returning();
      if (!deleted) return res.status(404).json({ error: "Contact not found" });
      await logAdminAction(req.admin?.id || "system", "delete_support_contact", "support_contact", id, {}, req);
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Public endpoint
  app.get("/api/support/contacts", async (_req: Request, res: Response) => {
    try {
      const contacts = await db.select().from(supportContacts)
        .where(eq(supportContacts.isActive, true))
        .orderBy(desc(supportContacts.createdAt));
      res.json(contacts);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

}
