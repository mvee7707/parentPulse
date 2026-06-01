import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 180000,
  use: {
    headless: false,
    storageState: 'storageState.json',
  },
});