import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";

const root = process.cwd();
const allowed = ["apps/web/examples", "apps/web/dist-workbench", "node_modules/vue/dist"].map(path => resolve(root, path) + sep);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json" };
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (pathname === "/") { response.writeHead(302, { Location: "/apps/web/examples/workbench.html" }).end(); return; }
    const file = resolve(root, `.${pathname}`);
    if (!allowed.some(directory => file.startsWith(directory))) { response.writeHead(404).end(); return; }
    const content = await readFile(file);
    response.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" }).end(content);
  } catch { response.writeHead(404).end(); }
}).listen(5179, "127.0.0.1", () => console.log("OPM example: http://127.0.0.1:5179"));
