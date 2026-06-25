import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js", "tests/**/*.test.ts"],
    env: {
      NEXT_PUBLIC_APP_VERSION: pkg.version,
    },
  },
  resolve: {
    alias: {
      "@": path.join(root, "app"),
    },
  },
});
