import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Las Server Actions reciben (estadoPrevio, datos) aunque no siempre los usen: prefijo "_".
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // Copias de trabajo externas y sus dependencias generadas.
    ".claude/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Edge Functions: código Deno con su propio runtime.
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
