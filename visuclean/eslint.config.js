// ESLint Flat Config — VisuClean (React 18 + Vite)
import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";

export default [
  { ignores: ["dist", "dist-demo", "dist-std", "node_modules"] },
  {
    // Node-Kontext für Konfigurationsdateien (vite.config.js etc.)
    files: ["*.config.js"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.es2021 },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // Die Integrations- und A11y-Tests stellen Browser-APIs über jsdom bzw.
    // fake-indexeddb bereit; werkbank/breitenmessung.mjs reicht Funktionen
    // an einen echten Browser durch (page.evaluate). ESLint soll diese
    // absichtlichen Globals kennen.
    files: ["a11ytest.mjs", "persisttest.mjs", "screeninganzeigetest.mjs",
      "sequenztest.mjs", "schmutztest.mjs", "pruefflaechetest.mjs",
      "werkbank/breitenmessung.mjs", "werkbank/rahmenmessung.mjs",
      "werkbank/kandidatenspur.mjs", "werkbank/bedienlauf.mjs", "schadenstest.mjs"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: "18.3" } },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      "react/react-in-jsx-scope": "off", // React 18 + neue JSX-Transform (Vite-Plugin)
      "react/prop-types": "off",
      "react/jsx-key": "off", // Fehlalarm: JSX als Daten in Array-Tupeln (Icon-Spalten), nicht als gerenderte Geschwister-Liste
      "react/no-unescaped-entities": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
];
