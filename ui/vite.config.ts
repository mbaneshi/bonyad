/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API binds to 127.0.0.1 only and has no CORS surface, so the dev server proxies it.
const api = process.env.BONYAD_API ?? "http://127.0.0.1:58080";
const agent = process.env.BONYAD_AGENT ?? "http://127.0.0.1:58090";

export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", port: 55173, proxy: { "/v1": api, "/healthz": api, "/agent": agent } },
  preview: { host: "127.0.0.1", port: 55173, proxy: { "/v1": api, "/healthz": api, "/agent": agent } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
