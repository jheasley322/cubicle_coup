import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Project Pages site is served from /cubicle_coup/, so assets must resolve there.
// Override with VITE_BASE=/ for local preview at the root if desired.
export default defineConfig({
  base: process.env.VITE_BASE || "/cubicle_coup/",
  plugins: [react()],
});
