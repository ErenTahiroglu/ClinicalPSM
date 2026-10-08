import { test, expect } from '@playwright/test'

/**
 * CP-00 safety hold — unauthenticated, synthetic payloads only.
 * The hold rejects before auth, so 503 (not 401) is expected for write routes.
 */
test.describe('CP-00 safety hold', () => {
  test('upload API rejects direct calls', async ({ request }) => {
    const res = await request.post('/api/analyses/00000000-0000-0000-0000-000000000000/upload', {
      multipart: { file: { name: 'synthetic.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2\n') } },
    })
    expect(res.status()).toBe(503)
    const text = await res.text()
    expect(text).not.toContain('synthetic.csv')
  })

  test('results API rejects direct calls', async ({ request }) => {
    const res = await request.post('/api/analyses/00000000-0000-0000-0000-000000000000/results', {
      data: { resultSummary: { propensityScores: [0.5] }, config: {} },
    })
    expect(res.status()).toBe(503)
  })

  test('create-analysis API rejects direct calls', async ({ request }) => {
    const res = await request.post('/api/analyses', { data: { name: 'synthetic' } })
    expect(res.status()).toBe(503)
  })

  test('landing page (EN/TR) makes no browser-only or publication-ready claims', async ({ page }) => {
    for (const l of ['en', 'tr']) {
      await page.goto(`/${l}`)
      const body = (await page.locator('body').innerText()).toLowerCase()
      expect(body).not.toContain('publication-ready')
      expect(body).not.toContain('yayına hazır')
      expect(body).not.toContain('leaves your browser')
      expect(body).not.toContain('tarayıcınızdan çıkmaz')
    }
  })

  test('pricing remains reachable in both locales', async ({ page }) => {
    for (const l of ['en', 'tr']) {
      const res = await page.goto(`/${l}/pricing`)
      expect(res?.status()).toBe(200)
    }
  })
})
