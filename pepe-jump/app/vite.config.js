import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({ include: ["buffer", "crypto", "stream", "util"] }),
  ],
  define: {
    "process.env": {},
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  server: {
    port: 3000,
    open: true,
  },
});
