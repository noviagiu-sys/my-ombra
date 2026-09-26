import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Replit-Erkennung: dort muss der Dev-Server extern erreichbar sein (Proxy).
// Lokal und auf Vercel bleibt alles beim Standard.
const onReplit = !!process.env.REPL_ID;

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
    // PDF/QR bleiben bewusst im sofort offline gecachten Hauptpaket.
    // 850 kB roh entsprechen derzeit rund 260 kB gzip.
    chunkSizeWarningLimit: 850,
  },
  server: onReplit ? {
    host: true,
    port: 3000,
    strictPort: true,
    hmr: { clientPort: 443 },
    allowedHosts: true,
  } : undefined,
  preview: onReplit ? { host: true, port: 3000, strictPort: true } : undefined,
});
