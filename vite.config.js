import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In sviluppo /api viene inoltrato al servizio di prova (npm run mock) o a un backend reale.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": { target: process.env.RENDER_API_URL || "http://localhost:8787", changeOrigin: true } },
  },
});
