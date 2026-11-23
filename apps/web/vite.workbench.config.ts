import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [vue()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  css: { postcss: { plugins: [{
    postcssPlugin: "opm-workbench-style-boundary",
    Rule(rule) {
      if (!rule.source?.input.file?.replaceAll("\\", "/").includes("/shared/styles/")) return;
      // 样式仅作用于组件容器；关键帧百分比不属于元素选择器。
      if (rule.parent?.type === "atrule" && rule.parent.name.endsWith("keyframes")) return;
      rule.selectors = rule.selectors.map(selector => selector === ":root" ? ".opm-workbench" : `.opm-workbench ${selector}`);
    },
  }] } },
  build: {
    outDir: "dist-workbench",
    lib: {
      entry: { index: fileURLToPath(new URL("./src/workbench/index.ts", import.meta.url)),
        runtime: fileURLToPath(new URL("./src/workbench/localRuntimeServices.ts", import.meta.url)) },
      formats: ["es"], fileName: (_format, name) => `${name}.js`, cssFileName: "style",
    },
    rollupOptions: { external: ["vue"] },
  },
});
