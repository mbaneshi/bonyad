import { defineConfig } from "@playwright/test";
import { PORTS } from "./ports";

const phone = { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true };

export default defineConfig({
  testDir: "specs",
  // One database, one project, one scripted model: tests and viewports run one at a time.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORTS.ui}`,
    // CI installs Chromium; locally the machine's Chrome is used (no browser download).
    ...(process.env.CI ? {} : { channel: "chrome" }),
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile-360", use: phone },
    { name: "tablet-768", use: { viewport: { width: 768, height: 1024 } } },
    { name: "desktop-1280", use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: "node stack.mjs",
    url: `http://127.0.0.1:${PORTS.ui}`,
    timeout: 600_000, // a cold Rust build can be slow
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
    stdout: "pipe",
    stderr: "pipe",
  },
});
