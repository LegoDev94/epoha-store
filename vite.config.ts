import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Относительная база — корректно работает на GitHub Pages проекта
// (https://<user>.github.io/patina-vintage/) без хардкода имени репо.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    target: "es2020",
    cssMinify: true,
  },
});
