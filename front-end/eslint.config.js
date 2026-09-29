import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
    "no-undef": "error",
    // 本体の no-unused-vars は型シグネチャの引数名を誤検出するため TS 版を使う
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": "error",
    "react/prop-types": "off",
    // 既存コードに多数あるため、CI では警告に留める（新規は直していく）
    "@typescript-eslint/no-explicit-any": "warn",
    "react-hooks/set-state-in-effect": "warn",
    },
  },
])
