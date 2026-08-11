import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Пути от корня сайта. Относительная база («./») годилась, пока витрина
// жила на одном адресе и различала страницы решёткой. С настоящими
// адресами вида /lot/78 браузер искал бы стили в /lot/assets/.
export default defineConfig({
  base: "/",
  plugins: [react()],
  build: {
    target: "es2020",
    cssMinify: true,
  },
});
