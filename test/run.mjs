// Runs every *.test.mjs in this directory, each in its own process.
//
// Separate processes are required, not just tidy: the storage tests stub
// globalThis.window to fake a locked-down iframe, and storage.js picks its
// tier once at import time. Sharing a process would let one test's fake
// browser leak into the next.
//
//   node test/run.mjs

import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((f) => f.endsWith(".test.mjs")).sort();

let failed = 0;
for (const file of files) {
  console.log(`\n── ${file} ${"─".repeat(Math.max(0, 60 - file.length))}`);
  const result = spawnSync(
    process.execPath,
    // The app is plain static files with no package.json, so Node warns that
    // js/*.js has no declared module type. Expected; silence just that one.
    ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", join(here, file)],
    { stdio: "inherit" }
  );
  if (result.status !== 0) failed++;
}

console.log(
  failed === 0
    ? `\nAll ${files.length} test files passed.`
    : `\n${failed} of ${files.length} test files FAILED.`
);
process.exit(failed === 0 ? 0 : 1);
