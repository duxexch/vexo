import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { readFileSync } from "node:fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// Read package.json at config-evaluation time so the bundle gets a stable
// build-time identifier baked in. The runtime release-poll in main.tsx
// uses this to decide whether the server is advertising a *strictly newer*
// version than the bundle the user is actually executing — without this,
// any server-side version churn (manifest rewrite, env flip) would
// trigger a spurious "update available" banner even when the loaded
// bundle is already current.
const pkgJson = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "package.json"), "utf8"),
) as { version?: string };
const BUILD_APP_VERSION = String(pkgJson.version ?? "0.0.0");

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(BUILD_APP_VERSION),
  },
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
      process.env.REPL_ID !== undefined
      ? [
        await import("@replit/vite-plugin-cartographer").then((m) =>
          m.cartographer(),
        ),
        await import("@replit/vite-plugin-dev-banner").then((m) =>
          m.devBanner(),
        ),
      ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: true,
    cssMinify: 'lightningcss',
    chunkSizeWarningLimit: 500, // Warn if any chunk exceeds 500 KB
    // Explicit ES2020 baseline matches the .browserslistrc floor
    // (Chrome 76 / iOS 13.4 / Safari 13.1) — keeps optional chaining,
    // nullish coalescing, BigInt, and dynamic import working natively
    // on every supported device without forcing heavy polyfills.
    target: ['es2020', 'chrome76', 'safari13.1', 'firefox78', 'edge90'],
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.debug'],
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            const moduleId = id.replace(/\\/g, '/');

            if (moduleId.includes('/node_modules/react-dom/')) return 'vendor-react-dom';
            if (moduleId.includes('/node_modules/react/')) return 'vendor-react';
            if (moduleId.includes('/node_modules/scheduler/')) return 'vendor-react';

            if (moduleId.includes('@radix-ui')) return 'vendor-radix';
            if (moduleId.includes('@tanstack')) return 'vendor-query';
            if (moduleId.includes('react-icons')) return 'vendor-social-icons';
            if (moduleId.includes('recharts')) return 'vendor-charts';
            if (moduleId.includes('chess.js')) return 'vendor-chess';
            if (moduleId.includes('date-fns')) return 'vendor-date';
            if (moduleId.includes('zod')) return 'vendor-validation';
            if (moduleId.includes('wouter')) return 'vendor-router';
            if (moduleId.includes('embla-carousel')) return 'vendor-carousel';
            if (moduleId.includes('react-hook-form')) return 'vendor-forms';
          }
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
