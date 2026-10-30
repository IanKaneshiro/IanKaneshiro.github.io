import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";
import kan from "./tools/gate/lint/eslint-plugin-kan.js";

export default defineConfig(
  {
    // The old site (index.html, css/, js/, assets/) is served as-is until the cutover (SHIP-008).
    ignores: [
      "node_modules/",
      "css/",
      "js/",
      "assets/",
      "specs/",
      "gate-reports/",
      "**/dist/",
      "**/www/",
      "**/.astro/",
      "**/storybook-static/",
      // Stencil's generated output.
      "**/loader/",
      "**/.stencil/",
      "packages/components/docs.d.ts",
      "packages/components/src/components.d.ts",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    languageOptions: { globals: { ...globals.node, Bun: "readonly" } },
  },
  {
    files: ["tools/specs/review/public/**/*.js"],
    languageOptions: { sourceType: "script", globals: globals.browser },
  },
  {
    files: ["packages/components/**/*.{ts,tsx}"],
    plugins: { kan },
    rules: {
      "kan/component-tag-prefix": "error",
      // JSX compiles to h() and Fragment, which ESLint can't see being used.
      "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^(h|Fragment)$" }],
    },
  },
);
