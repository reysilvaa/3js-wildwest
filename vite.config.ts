import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2022",
    minify: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three/addons")) {
            return "three-addons";
          }
          if (id.includes("node_modules/three")) {
            return "three-core";
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    open: false,
  },
});
