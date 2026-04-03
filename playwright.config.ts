import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  retries: 1,
  use: {
    baseURL: "https://mosstrafikk.no",
  },
  projects: [
    {
      name: "public",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
