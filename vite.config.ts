import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.CLIENT_PORT ?? 43210);
const SERVER_PORT = Number(process.env.PORT ?? 43211);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    "import.meta.env.VITE_API_PORT": JSON.stringify(String(SERVER_PORT)),
  },
  resolve: {
    alias: {
      "@shared": path.resolve(root, "shared"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: PORT,
    allowedHosts: true,
    proxy: {
      "/socket.io": {
        target: `http://127.0.0.1:${SERVER_PORT}`,
        ws: true,
        changeOrigin: true,
      },
      "/api": {
        target: `http://127.0.0.1:${SERVER_PORT}`,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: PORT,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three") || id.includes("node_modules/@react-three") || id.includes("node_modules/cannon-es")) {
            return "three";
          }
        },
      },
    },
  },
});
