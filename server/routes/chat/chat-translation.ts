import type { Express, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware";
import { getErrorMessage } from "../helpers";
import { translateText, detectLanguage, getSupportedLanguages } from "../../lib/translation-service";
import { z } from "zod";

const translateSchema = z.object({
  text: z.string().min(1).max(2000),
  sourceLang: z.string().min(2).max(10).default('auto'),
  targetLang: z.string().min(2).max(10),
});

const batchTranslateSchema = z.object({
  texts: z.array(z.string().min(1).max(2000)).min(1).max(20),
  sourceLang: z.string().min(2).max(10).default('auto'),
  targetLang: z.string().min(2).max(10),
});

export function registerChatTranslationRoutes(app: Express): void {

  // Translate a single message
  app.post("/api/chat/translate", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { text, sourceLang, targetLang } = translateSchema.parse(req.body);

      const result = await translateText(text, sourceLang, targetLang);

      res.json({
        originalText: text,
        translatedText: result.translatedText,
        sourceLang: result.detectedLanguage || sourceLang,
        targetLang,
        cached: result.cached,
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Batch translate multiple messages
  app.post("/api/chat/translate/batch", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { texts, sourceLang, targetLang } = batchTranslateSchema.parse(req.body);

      const results = await Promise.all(
        texts.map(text => translateText(text, sourceLang, targetLang))
      );

      res.json({
        translations: results.map((r, i) => ({
          originalText: texts[i],
          translatedText: r.translatedText,
          cached: r.cached,
        })),
        sourceLang,
        targetLang,
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Detect language of a text
  app.post("/api/chat/detect-language", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { text } = z.object({ text: z.string().min(1).max(2000) }).parse(req.body);
      const language = await detectLanguage(text);
      res.json({ language });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Get supported translation languages
  app.get("/api/chat/translate/languages", authMiddleware, async (_req: AuthRequest, res: Response) => {
    try {
      const languages = await getSupportedLanguages();
      res.json({ languages });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
