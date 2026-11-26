import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    {
      name: "minify-html",
      apply: "build",
      transformIndexHtml: (html: string) =>
        html
          .replace(/<!--[\s\S]*?-->/g, "")
          .replace(/>\s+</g, "><")
          .replace(/\s{2,}/g, " ")
          .trim(),
    },
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    target: "es2022",
    minify: true,
    cssMinify: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
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
