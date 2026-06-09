import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANT: `base` must match your GitHub repo name for GitHub Pages.
// If your repo is github.com/<you>/dockos  ->  base: "/dockos/"
// If you deploy to a custom domain or a <you>.github.io repo -> base: "/"
export default defineConfig({
  plugins: [react()],
  base: "/dockos/",
});
