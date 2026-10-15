import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Carga .env.local para las pruebas (igual que Next.js en desarrollo)
    env: loadEnv("development", process.cwd(), ""),
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
