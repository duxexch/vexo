import { type Express } from "express";
import express from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  // Serve downloads folder explicitly (APK, AAB, etc.) before Vite middleware
  const publicDownloads = path.resolve(import.meta.dirname, "..", "client", "public", "downloads");

  // ── Service Worker — explicit route with no-cache headers (dev mode) ──
  // Must be BEFORE vite.middlewares to prevent Vite's static serving from caching it
  const publicDir = path.resolve(import.meta.dirname, "..", "client", "public");
  app.get("/sw.js", (_req, res) => {
    const swPath = path.join(publicDir, "sw.js");
    if (fs.existsSync(swPath)) {
      const content = fs.readFileSync(swPath, "utf-8");
      res.set({
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        "Service-Worker-Allowed": "/",
      });
      res.status(200).send(content);
    } else {
      res.status(404).end("// Service worker not found");
    }
  });

  app.use("/downloads", express.static(publicDownloads, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.apk')) {
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
      } else if (filePath.endsWith('.aab')) {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
      }
    }
  }));

  app.use(vite.middlewares);

  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    // Skip SPA transform for direct file downloads (APK, AAB, binary files)
    const skipExtensions = /\.(apk|aab|zip|tar|gz|exe|dmg|deb|rpm|png|jpg|jpeg|gif|webp|svg|ico|mp3|mp4|wav|ogg|pdf|woff2?|ttf|eot)(\?.*)?$/i;
    if (skipExtensions.test(url)) {
      return next();
    }

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
