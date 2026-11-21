import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    // Markdown is formatted by the AGENTS.md prettier command, whose compact
    // table style differs from this formatter's padded tables.
    ignorePatterns: ["**/*.md"],
    sortImports: true,
    sortPackageJson: {
      sortScripts: true,
    },
  },
  lint: {
    rules: {
      "unicorn/prefer-node-protocol": "warn",
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          fix: {
            imports: "off",
            variables: "off",
          },
        },
      ],
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
