import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mismo alias "@/..." que tsconfig.json
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    // Carga .env.local para las pruebas (igual que Next.js en desarrollo)
    env: loadEnv("development", process.cwd(), ""),
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
