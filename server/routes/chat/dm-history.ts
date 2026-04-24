/**
 * Realtime DM history endpoint (Task #16).
 *
 * Returns the persisted text-message timeline for the realtime
 * Socket.IO `/chat` DM channel. Both ends share the same `chat_messages`
 * table as the legacy HTTP chat surface, but this endpoint exposes the
 * minimal text-only projection used by the inbox scroll buffer.
 *
 * Authorization: only the two participants of the conversation can read
 * it — the caller's authenticated user id is one side, the path peer
 * the other.
 */

import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { storage } from "../../storage";

export function registerDirectMessageHistoryRoutes(app: Express): void {
  app.get(
    "/api/dm/:peerId/history",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const peerId = String(req.params.peerId || "").slice(0, 64);
        if (!peerId || peerId === userId) {
          return res.status(400).json({ error: "invalid_peer" });
        }

        const limitRaw = parseInt(String(req.query.limit ?? ""), 10);
        const limit = Number.isFinite(limitRaw) ? limitRaw : undefined;

        const beforeRaw = req.query.before
          ? new Date(String(req.query.before))
          : undefined;
        const before =
          beforeRaw && !Number.isNaN(beforeRaw.getTime())
            ? beforeRaw
            : undefined;

        // Task #28: storage now returns a definitive `hasMore` flag
        // alongside the page so the client never has to guess from row
        // count. We forward both verbatim — the client uses `hasMore`
        // to drive the "start of conversation" indicator.
        const page = await storage.getDirectMessageHistory({
          userId,
          peerId,
          limit,
          before,
        });

        res.json(page);
      } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );
}
