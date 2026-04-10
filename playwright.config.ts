import { defineConfig, devices } from '@playwright/test'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

// Load .env first
dotenv.config({ path: path.resolve(__dirname, 'clinicalpsm/.env') })
// Override with .env.local
dotenv.config({ path: path.resolve(__dirname, 'clinicalpsm/.env.local'), override: true })

// If .env.local provided a dummy service role key, restore the real one from .env
if (process.env.SUPABASE_SERVICE_ROLE_KEY?.includes('dummy')) {
  const envPath = path.resolve(__dirname, 'clinicalpsm/.env')
  if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath))
    if (envConfig.SUPABASE_SERVICE_ROLE_KEY) {
      process.env.SUPABASE_SERVICE_ROLE_KEY = envConfig.SUPABASE_SERVICE_ROLE_KEY
    }
  }
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run start',
    cwd: './clinicalpsm',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
