import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

const output = "dist-workbench";
async function rewriteTypes(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await rewriteTypes(file);
    else if (file.endsWith(".d.ts")) {
      const content = await readFile(file, "utf8");
      await writeFile(file, content.replace(/(["'])@\/([^"']+)\1/g, (_match, quote, path) => {
        const target = relative(dirname(file), join(output, "types", path)).replaceAll("\\", "/");
        return `${quote}${target.startsWith(".") ? target : `./${target}`}${quote}`;
      }));
    }
  }
}
await rewriteTypes(join(output, "types"));
await writeFile(join(output, "package.json"), JSON.stringify({
  name: "@opm/workbench", version: "0.2.2-platform.37", type: "module",
  exports: {
    ".": { types: "./types/workbench/index.d.ts", import: "./index.js" },
    "./runtime": { types: "./types/workbench/localRuntimeServices.d.ts", import: "./runtime.js" },
    "./style.css": "./style.css",
  },
  sideEffects: ["**/*.css"], peerDependencies: { vue: "^3.5.26" },
}, null, 2) + "\n");
