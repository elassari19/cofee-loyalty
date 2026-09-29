import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": srcDir,
    },
  },
  test: {
    environment: "node",
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "scripts/**/*.{test,spec}.ts",
      "tests/**/*.{test,spec}.{ts,tsx}",
    ],
    // Test-only configuration so modules that read `process.env` at import time
    // (TypeORM DataSource, health checks) load without a developer's `.env`.
    // Never point these at production services.
    env: {
      NODE_ENV: "test",
      APP_URL: "http://localhost:3000",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5433/loyalty_dev",
      REDIS_URL: "redis://localhost:6380",
      BETTER_AUTH_SECRET: "test-only-secret-0123456789abcdefghijklmnopqrst",
      BETTER_AUTH_URL: "http://localhost:3000",
      LOG_LEVEL: "silent",
    },
    passWithNoTests: true,
  },
});
