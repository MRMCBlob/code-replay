import { defineConfig } from "tsup";

// Two builds: CLI gets a shebang banner, library entry must NOT (a shebang in an
// imported ES module is a syntax error — Node only strips it on the main entry).
export default defineConfig([
  {
    entry: ["src/cli.ts"],
    format: ["esm"],
    target: "node18",
    platform: "node",
    clean: true,
    dts: false,
    sourcemap: false,
    splitting: false,
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    target: "node18",
    platform: "node",
    clean: false,
    dts: true,
    sourcemap: false,
    splitting: false,
  },
]);
