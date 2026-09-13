import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // tests/e2e/* are Playwright specs — they import @playwright/test,
    // which cannot run under vitest. `npm run test:e2e` runs those.
    exclude: ["node_modules/**", "tests/e2e/**"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
