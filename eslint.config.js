import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

const simLogicFiles = [
  "server/src/world/**",
  "server/src/perception/**",
  "server/src/memory/**",
  "server/src/economy/**",
  "server/src/decision/**",
  "server/src/sim/**",
  "server/src/reflection/**",
];

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "data/**", ".claude/**", "maps/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "id-length": ["error", { min: 2, properties: "never", exceptions: ["x", "y", "_"] }],
      "no-console": "error",
      "no-restricted-syntax": [
        "error",
        { selector: "ExportDefaultDeclaration", message: "Use named exports only." },
      ],
    },
  },
  {
    files: ["**/*.config.{js,ts}", "**/vite.config.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    files: ["**/logger.ts"],
    rules: { "no-console": "off" },
  },
  {
    files: simLogicFiles,
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "Use the sim clock in sim logic." },
        { object: "Math", property: "random", message: "Use the seeded random generator." },
      ],
    },
  },
);
