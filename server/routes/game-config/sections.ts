import type { Express, Request, Response } from "express";
import { AuthRequest, adminTokenMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { db } from "../../db";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { gameSections, games, insertGameSectionSchema, multiplayerGames, externalGames } from "@shared/schema";

const defaultSectionMeta: Record<string, { nameEn: string; nameAr: string; icon: string; iconColor: string }> = {
  most_played: { nameEn: "Most Played", nameAr: "الأكثر لعباً", icon: "TrendingUp", iconColor: "text-orange-500" },
  crash: { nameEn: "Crash Games", nameAr: "ألعاب الانهيار", icon: "TrendingUp", iconColor: "text-red-500" },
  dice: { nameEn: "Dice Games", nameAr: "ألعاب النرد", icon: "Dices", iconColor: "text-blue-500" },
  wheel: { nameEn: "Wheel Games", nameAr: "ألعاب العجلة", icon: "CircleDot", iconColor: "text-green-500" },
  slots: { nameEn: "Slots", nameAr: "السلوتس", icon: "Star", iconColor: "text-purple-500" },
  jackpot: { nameEn: "Jackpot", nameAr: "الجائزة الكبرى", icon: "Trophy", iconColor: "text-yellow-500" },
  board: { nameEn: "Board Games", nameAr: "ألعاب اللوحة", icon: "Gamepad2", iconColor: "text-cyan-500" },
  cards: { nameEn: "Card Games", nameAr: "ألعاب الورق", icon: "Crown", iconColor: "text-pink-500" },
  strategy: { nameEn: "Strategy", nameAr: "الاستراتيجية", icon: "Target", iconColor: "text-orange-500" },
  multiplayer: { nameEn: "Multiplayer", nameAr: "متعددة اللاعبين", icon: "Gamepad2", iconColor: "text-primary" },
  featured: { nameEn: "Featured", nameAr: "المميزة", icon: "Star", iconColor: "text-yellow-500" },
  popular: { nameEn: "Popular", nameAr: "الشائعة", icon: "TrendingUp", iconColor: "text-orange-500" },
  arcade: { nameEn: "Arcade", nameAr: "الأركيد", icon: "Zap", iconColor: "text-blue-500" },
  puzzle: { nameEn: "Puzzle", nameAr: "الألغاز", icon: "CircleDot", iconColor: "text-green-500" },
  single: { nameEn: "Single Player", nameAr: "لاعب واحد", icon: "Gamepad2", iconColor: "text-primary" },
};

function normalizeSectionKey(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/^_+|_+$/g, "");
}

function keyToReadableName(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getSectionMeta(key: string): { nameEn: string; nameAr: string; icon: string; iconColor: string } {
  const mapped = defaultSectionMeta[key];
  if (mapped) return mapped;

  const fallback = keyToReadableName(key);
  return {
    nameEn: fallback,
    nameAr: fallback,
    icon: "Gamepad2",
    iconColor: "text-primary",
  };
}

export function registerSectionsRoutes(app: Express): void {

  // ==================== GAME SECTIONS API ====================

  // Public: Get active game sections
  app.get("/api/game-sections", async (_req: Request, res: Response) => {
    try {
      const sections = await db.select().from(gameSections)
        .where(eq(gameSections.isActive, true))
        .orderBy(asc(gameSections.sortOrder));
      res.json(sections);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: List all game sections
  app.get("/api/admin/game-sections", adminTokenMiddleware, async (_req: AuthRequest, res: Response) => {
    try {
      const sections = await db.select().from(gameSections)
        .orderBy(asc(gameSections.sortOrder));
      res.json(sections);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: Initialize missing game sections from existing game categories
  app.post("/api/admin/game-sections/initialize", adminTokenMiddleware, async (_req: AuthRequest, res: Response) => {
    try {
      const [existingSections, singleGameCategories, multiplayerCategories, externalCategories] = await Promise.all([
        db.select().from(gameSections),
        db.select({ category: games.category }).from(games),
        db.select({ category: multiplayerGames.category }).from(multiplayerGames),
        db.select({ category: externalGames.category }).from(externalGames),
      ]);

      const existingKeys = new Set(
        existingSections
          .map((section) => normalizeSectionKey(section.key))
          .filter(Boolean)
      );

      const discoveredKeys = new Set<string>();

      const addCategory = (category: string | null | undefined) => {
        const normalized = normalizeSectionKey(category);
        if (normalized) discoveredKeys.add(normalized);
      };

      for (const row of singleGameCategories) addCategory(row.category);
      for (const row of multiplayerCategories) addCategory(row.category);
      for (const row of externalCategories) addCategory(row.category);

      const keysToInsert = Array.from(discoveredKeys)
        .filter((key) => !existingKeys.has(key))
        .sort((a, b) => a.localeCompare(b));

      if (keysToInsert.length === 0) {
        return res.json({
          inserted: 0,
          discovered: discoveredKeys.size,
          skippedExisting: discoveredKeys.size,
          sections: [],
        });
      }

      const maxSortOrder = existingSections.reduce((maxOrder, section) => {
        return Math.max(maxOrder, section.sortOrder);
      }, 0);

      const rowsToInsert = keysToInsert.map((key, index) => {
        const meta = getSectionMeta(key);
        return {
          key,
          nameEn: meta.nameEn,
          nameAr: meta.nameAr,
          icon: meta.icon,
          iconColor: meta.iconColor,
          sortOrder: maxSortOrder + index + 1,
          isActive: true,
        };
      });

      const insertedSections = await db.insert(gameSections).values(rowsToInsert).returning();

      res.status(201).json({
        inserted: insertedSections.length,
        discovered: discoveredKeys.size,
        skippedExisting: discoveredKeys.size - insertedSections.length,
        sections: insertedSections,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: Create game section
  app.post("/api/admin/game-sections", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const data = insertGameSectionSchema.parse(req.body);
      // Check for duplicate key
      const [existing] = await db.select().from(gameSections).where(eq(gameSections.key, data.key));
      if (existing) {
        return res.status(400).json({ error: "A section with this key already exists" });
      }
      const [section] = await db.insert(gameSections).values(data).returning();
      res.status(201).json(section);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: Update game section
  app.patch("/api/admin/game-sections/:id", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const [existing] = await db.select().from(gameSections).where(eq(gameSections.id, id));
      if (!existing) {
        return res.status(404).json({ error: "Section not found" });
      }
      const [updated] = await db.update(gameSections)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(gameSections.id, id))
        .returning();
      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: Delete game section
  app.delete("/api/admin/game-sections/:id", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const [existing] = await db.select().from(gameSections).where(eq(gameSections.id, id));
      if (!existing) {
        return res.status(404).json({ error: "Section not found" });
      }
      await db.delete(gameSections).where(eq(gameSections.id, id));
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
