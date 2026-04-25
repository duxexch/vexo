import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    include: ["client/src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "dist", "build", ".cache"],
    setupFiles: ["./tests/setup-vitest.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
});
