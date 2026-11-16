import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".claude/**",
    "graft/**",
    ".trail/**",
    "**/.wrangler/**",
    // Vendored from the chatcn and React Bits registries, kept as they ship.
    "src/components/ui/chatcn/**",
    "src/hooks/use-chatcn-*",
    "src/lib/chatcn-icons.tsx",
    "src/components/crystalized-ball.tsx",
  ]),
]);

export default eslintConfig;
