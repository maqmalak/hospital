import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import i18nJsx from "./scripts/i18n-jsx";
import path from "node:path";

// Every Frappe site on this bench uses the same cookie names (sid …) and browsers share cookies across ports, so the
// hospital app runs on its own hostname: hospital.localhost (resolves without /etc/hosts). Plain localhost redirects there.
const PORT = 5183;
const HOST = "hospital.localhost";
const SITE = "hospital";

function ownHostname(): Plugin {
  return {
    name: "hospital-own-hostname",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requested = (req.headers.host ?? "").split(":")[0];
        if (requested === "localhost" || requested === "127.0.0.1") {
          res.writeHead(302, { Location: `http://${HOST}:${PORT}${req.url ?? "/"}` });
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_PROXY_TARGET || "http://127.0.0.1:8011";
  const proxy = { target, changeOrigin: true, headers: { Host: SITE, "X-Frappe-Site-Name": SITE }, cookieDomainRewrite: "", secure: false };
  return {
    base: command === "build" ? "/assets/hospital_vvs/frontend/" : "/",
    plugins: [react({ babel: { plugins: [i18nJsx] } }), ownHostname()],
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    server: {
      port: PORT,
      strictPort: true,
      host: true,
      allowedHosts: [HOST, "localhost"],
      proxy: {
        "/api": proxy, "/files": proxy, "/private": proxy, "/assets": proxy, "/app": proxy, "/desk": proxy, "/printview": proxy,
        "/socket.io": { target: env.VITE_SOCKETIO_TARGET || "http://127.0.0.1:9000", ws: true, changeOrigin: false,
          headers: { "X-Frappe-Site-Name": SITE } },
      },
    },
    build: {
      outDir: "../hospital_vvs/public/frontend",
      emptyOutDir: true,
      chunkSizeWarningLimit: 1500,
      rollupOptions: { output: { manualChunks: { "vendor-react": ["react", "react-dom", "react-router-dom"], "vendor-charts": ["recharts"] } } },
    },
    test: { environment: "jsdom", globals: true },
  };
});
