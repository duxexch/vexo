import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
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
