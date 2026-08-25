import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";
const runtimeOrigin = process.env.VITE_LOCAL_RUNTIME_ORIGIN ?? "http://127.0.0.1:17850";
export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    server: {
        host: "127.0.0.1",
        proxy: {
            "/opm-bootstrap.js": {
                target: runtimeOrigin,
                changeOrigin: true,
            },
            "/api/v1": {
                target: runtimeOrigin,
                changeOrigin: true,
            },
            "/api/v1/events": {
                target: runtimeOrigin,
                changeOrigin: true,
            },
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    "opd-canvas": ["@antv/x6"],
                    "vue-runtime": ["pinia", "vue", "vue-router"],
                },
            },
        },
    },
    test: {
        environment: "jsdom",
    },
});
