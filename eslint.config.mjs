import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import architecture from "./scripts/eslint/architecture.mjs";

const extensions = "{js,jsx,mjs,cjs,ts,tsx,mts,cts}";
const sourceFiles = ["app.js", `{src,api,data,dev,scripts,tests}/**/*.${extensions}`, "*.{config.ts,config.mjs}"];

export default [
  { ignores: ["node_modules/**", "dist/**", "build/**", "coverage/**", "test-results/**", "playwright-report/**", ".vercel/**", ".reelay-data/**"] },
  {
    files: sourceFiles,
    languageOptions: { ecmaVersion: "latest", sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } }, globals: { ...globals.browser, ...globals.node } },
    rules: {
      ...js.configs.recommended.rules,
      // Unused declarations are checked by tsc in TS. Legacy cleanup is scoped
      // to verified callers, not an automatic deletion of its global entrypoints.
      "no-unused-vars": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Control characters are intentionally rejected by persisted-ID and URL
      // validators. Prohibiting those ranges would weaken boundary validation.
      "no-control-regex": "off",
    },
  },
  {
    files: ["tests/**/*.mjs"],
    // These tests match serialized HTML/source snippets; escaping has no
    // runtime correctness impact and is not part of the first lint rollout.
    rules: { "no-useless-escape": "off" },
  },
  {
    files: ["tests/e2e/**/*.ts"],
    // Playwright inspects fixture parameter destructuring, including {}.
    rules: { "no-empty-pattern": ["error", { allowObjectPatternsAsParameters: true }] },
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: { parser: tseslint.parser },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      ...tseslint.configs.eslintRecommended.rules,
      "no-undef": "off", // TypeScript owns symbol and environment resolution.
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: [`src/{domain,application,server/application}/**/*.${extensions}`],
    ignores: ["**/*.test.*"],
    plugins: { reelay: architecture },
    rules: { "reelay/layer-imports": "error" },
  },
];
