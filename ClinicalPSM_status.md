# ClinicalPSM — Proje Durum Belgesi

> Son güncelleme: 19 Nisan 2026
> Repo: https://github.com/ErenTahiroglu/ClinicalPSM
> Çalışma dizini: `/Users/eren/repos/ClinicalPSM`

---

## Kısa Bağlam

ClinicalPSM, tıp ve akademi dünyasındaki araştırmacıların kod yazmadan Propensity Score Matching (PSM) analizi yapmasını sağlayan bir Next.js SaaS uygulaması.

**Stack:** Next.js 16.2.1 (App Router) · React 19.2.4 · TypeScript · Tailwind CSS v4 · shadcn/ui · Supabase (Auth + PostgreSQL + Storage + RLS) · Vitest · Vercel · Playwright · @polar-sh/sdk 0.47.0
**Mimari:** Feature-Driven Clean Architecture · `[locale]` i18n routing (next-intl) · TR/EN

---

## Tamamlananlar

### Faz 4.8 — Mimari Yenilenme & Feature-Driven Geçiş ✅ (11 Nisan 2026)

| Görev | Açıklama |
|---|---|
| **Root Migration** | Proje `clinicalpsm/` alt klasöründen ana dizine (root) taşındı. |
| **Feature-Driven Structure** | `src/features/` (auth, profile, analysis) oluşturuldu. |
| **Naming Standard** | UI: `PascalCase.tsx`, Logic: `kebab-case.ts`. |
| **Vercel Build Fixes** | `shadcn` CLI devDeps'e alındı, Node 20+ zorunlu. |
| **E2E Fixture Refactor** | `analyses_used` sütunu kaldırıldı, profil upsert uyarlandı. |
| **Lint & TS Fixes** | 20+ CI lint hatası `eslint.config.mjs` üzerinden çözüldü. |

### Faz 4.9 — Bug Fixes & Resiliency ✅ (11 Nisan 2026)

| # | Dosya | Bug | Düzeltme |
|---|---|---|---|
| **BUG-06** | `src/features/auth/actions/auth.ts` | Brave şifreleri regex'e takılıyordu | `[\W_]` olarak güncellendi |
| **BUG-07** | `src/app/(dashboard)/analyses/page.tsx` | PGRST205 cache hatası dashboard 500 | Fallback profil objesi eklendi |
| **BUG-08** | `src/lib/audit.ts` | `audit_logs` yoksa runtime patlıyordu | Graceful degradation |
| **BUG-09** | `src/proxy.ts` | Env var eksikse `!` ile çöküyordu | Opsiyonel kontrol eklendi |

### Faz 5.0 — TR/EN i18n ✅ (önceki session)

- `[locale]` routing eklendi (next-intl). Desteklenen: `en`, `tr`.
- `messages/en.json` + `messages/tr.json` tam çeviri dosyaları.
- `src/proxy.ts` Next.js 16 konvansiyonuna uyarlandı (eski `middleware.ts` silindi).
- Tüm sayfalarda `useTranslations` / `getTranslations` kullanılıyor.

### Faz 5.1 — Polar.sh Pricing + Checkout ✅ (19 Nisan 2026)

#### Yeni / değiştirilen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/polar.ts` | `POLAR_CHECKOUT_URLS`, `buildPolarCheckoutUrl`, `PLAN_CONFIG`, `planFromProductId` |
| `src/app/[locale]/pricing/page.tsx` | Canlı checkout linkleri, locale-aware fiyatlar (EN: $ / TR: ₺), "Coming Soon" kaldırıldı |
| `src/components/shared/Header.tsx` | Pricing linki eklendi (unauthenticated branch) |
| `messages/en.json` | `pricing.subscribe`, `pricing.plans.*.price`, `pricing.plans.{plus,pro}.priceNote` |
| `messages/tr.json` | Aynı keyler, Türkçe |
| `playwright.config.ts` | `workers: 2`, dev server + doğru `.env*` yolu |
| `e2e/basic.spec.ts` | "pricing page shows subscribe CTAs" testi eklendi |

#### Checkout URL'leri

- **Plus:** `https://buy.polar.sh/polar_cl_qGDywjE4LOrepoPMR2qBG5puP60Oj4GZjNlmB4MpDKH`
- **Pro:** `https://buy.polar.sh/polar_cl_Ie0w7Rzml8NPBi9m3B9ITrGFWUsK2Kb5fknJd3Ihe2r`

Fiyatlar (pay-what-you-want):

- Plus: min $5 / önerilen $10 · min ₺200 / önerilen ₺250
- Pro: min $20 / önerilen $25 · min ₺1000 / önerilen ₺1250

#### Auth register redirect
`/register?redirect=/en/pricing` → kayıt sonrası pricing'e döner.
`src/features/auth/actions/auth.ts`'e `redirect` param desteği eklendi.
`src/app/[locale]/(auth)/register/page.tsx`'te `RedirectInput` (Suspense sınırı) eklendi.

### Faz 5.2 — .edu Teşvik + Polar Webhook ✅ (19 Nisan 2026)

#### .edu Akademik Teşvik (görsel only, DB değişikliği yok)

- `src/app/[locale]/(auth)/register/page.tsx`: `isAcademic` regex → `/\.(edu(\.[a-z]{2,3})?|ac\.[a-z]{2,3})$/i`
- Email alanı altında hint + live "Academic ✓" / "Akademik ✓" pill
- `messages/en.json` + `messages/tr.json` → `auth.register.emailHint`, `auth.register.academicBadge`
- Hiçbir doğrulama değişikliği yok — .edu olmayan mailler normal kayıt olur

#### Polar Webhook → Otomatik Plan Yükseltme

**Yeni dosyalar:**

| Dosya | İçerik |
|---|---|
| `src/lib/supabase/admin.ts` | `createAdminClient()` factory (service-role, no session) |
| `src/app/api/webhooks/polar/route.ts` | POST handler — Polar subscription event'lerini işler |
| `src/lib/__tests__/polar.test.ts` | 8 unit test (PLAN_CONFIG, buildPolarCheckoutUrl, planFromProductId) |

**Değiştirilen dosyalar:**

| Dosya | Değişiklik |
|---|---|
| `src/lib/polar.ts` | `PLAN_CONFIG`, `planFromProductId` eklendi |
| `src/lib/env.ts` | `getPolarEnv()` helper eklendi (ayrı assert, rest of app etkilenmiyor) |
| `src/lib/audit.ts` | `logPlanChanged(adminClient, userId, metadata)` eklendi |
| `src/features/profile/actions/profile.ts` | Inline admin client → `createAdminClient()` import |
| `.env.example` | `POLAR_PLUS_PRODUCT_ID` / `POLAR_PRO_PRODUCT_ID` (`NEXT_PUBLIC_` prefix kaldırıldı) |
| `CLAUDE.md` | Quota bölümü güncellendi |

**Webhook event → profil eşlemesi:**

| Event | Aksiyon |
|---|---|
| `subscription.created/updated/active/uncanceled` | `plan`, `analyses_limit`, `plan_interval`, `plan_reset_at`, `polar_customer_id`, `polar_subscription_id` güncellenir |
| `subscription.revoked` | `plan='free'`, `limit=1`, `interval='daily'`, `plan_reset_at=null`, `polar_subscription_id=null` |
| `subscription.canceled` | Değişiklik yok — dönem sonuna kadar erişim devam eder |
| Diğer | Log, 200 ok |

**Kullanıcı eşleme:** `customer.externalId` (checkout'ta `customer_external_id=user.id` gönderilir) → yoksa `customer.email` fallback → yine yoksa log + no-op.

**Plan config:**

```
free:  analysesLimit=1,      interval='daily'
plus:  analysesLimit=20,     interval='monthly'
pro:   analysesLimit=999999, interval='monthly'
```

**Env vars gerekli (`.env.local` + Vercel):**

```
POLAR_WEBHOOK_SECRET=...
POLAR_PLUS_PRODUCT_ID=...
POLAR_PRO_PRODUCT_ID=...
```

**Polar dashboard'da webhook URL:** `https://www.clinicalpsm.com/api/webhooks/polar`
Events: `subscription.*`

#### Test durumu (19 Nisan 2026)

```
npx tsc --noEmit  → 0 hata
npm run lint      → 0 hata
npm test          → 265/265 pass (8 yeni polar test dahil)
npx playwright test --workers=2 → 25 pass, 106 pre-existing i18n locale-prefix fail (scope dışı)
```

---

## Dosya Yapısı (Güncel)

```
ClinicalPSM/
├── src/
│   ├── features/
│   │   ├── auth/actions/auth.ts          # register (redirect param), login, signOut, updatePassword
│   │   ├── profile/
│   │   │   ├── actions/profile.ts        # deleteAccount (createAdminClient kullanır)
│   │   │   └── components/SettingsClient.tsx
│   │   └── analysis/components/          # PsmWizard, LovePlot, ...
│   ├── app/
│   │   ├── [locale]/
│   │   │   ├── page.tsx                  # Landing
│   │   │   ├── pricing/page.tsx          # Pricing + Polar checkout linkleri
│   │   │   └── (auth)/
│   │   │       ├── register/page.tsx     # .edu badge + redirect param
│   │   │       ├── login/page.tsx
│   │   │       └── ...
│   │   └── api/
│   │       └── webhooks/polar/route.ts   # Polar subscription webhook
│   ├── lib/
│   │   ├── polar.ts                      # URLs, PLAN_CONFIG, planFromProductId
│   │   ├── env.ts                        # getServerEnv, getPolarEnv
│   │   ├── audit.ts                      # AuditLogger + logPlanChanged
│   │   ├── supabase/
│   │   │   ├── server.ts                 # SSR client
│   │   │   ├── client.ts                 # Browser client
│   │   │   └── admin.ts                  # Service-role client (NEW)
│   │   └── __tests__/                    # polar.test.ts + diğerleri
│   ├── proxy.ts                          # Edge auth guard (Next.js 16 konvansiyonu)
│   └── types/database.ts
├── messages/
│   ├── en.json                           # Tam EN çevirisi
│   └── tr.json                           # Tam TR çevirisi
├── e2e/basic.spec.ts
├── supabase/migrations/
├── .env.example
├── playwright.config.ts
└── CLAUDE.md
```

---

## Teknik Notlar

- **Deployment:** Vercel → `https://www.clinicalpsm.com` (ve `https://clinical-psm.vercel.app`)
- **middleware.ts silindi** — Next.js 16'da `src/proxy.ts` konvansiyonu kullanılıyor; iki dosyanın birlikte olması conflict çıkartıyordu.
- **Quota:** COUNT-based dinamik limit — `create_analysis_with_limit_check` RPC atomic (migration 007). `analyses_used` fiziksel sütun yok.
- **Polar idempotency:** Aynı webhook tekrar gelirse aynı değerleri yazar — güvenli.
- **`NEXT_PUBLIC_POLAR_*`→`POLAR_*`:** Product ID'ler artık server-only. Checkout URL'leri hardcoded `POLAR_CHECKOUT_URLS` const'ta.

---

## Bekleyen Test Görevleri

Aşağıdaki testler **henüz yazılmadı**, bir sonraki sohbette ele alınacak.

### P0 — Webhook unit testleri (kritik)

`src/app/api/webhooks/polar/__tests__/route.test.ts` dosyası yok.
Yazılması gereken senaryolar:

| # | Senaryo | Test Yöntemi |
|---|---|---|
| 1 | `POLAR_WEBHOOK_SECRET` unset → 500 | mock env, POST handler |
| 2 | Geçersiz imza → 422 | mock `validateEvent` throw |
| 3 | Bilinmeyen productId → profil değişmez | mock `planFromProductId` null |
| 4 | `subscription.created` + plus productId → profil güncellenir | mock admin client |
| 5 | `subscription.revoked` → free'ye düşer | mock admin client |
| 6 | `subscription.canceled` → profil değişmez | mock + spy |
| 7 | externalId yok, email var → fallback resolve | mock listUsers |
| 8 | externalId yok, email yok → no-op, no throw | assert admin.update NOT called |
| 9 | İdempotency: aynı event 2 kez → 2. de 200 | aynı değerler |
| 10 | Hesap silinmiş user revoke → 200, no crash | update returns 0 rows |

### P1 — E2E genişletme

- `e2e/pricing.spec.ts` — Subscribe href doğrulama (login state'e göre)
- `e2e/auth.spec.ts` — .edu badge TR/EN parity
- `e2e/i18n.spec.ts` — locale switch path koruması

### Manuel test (staging'de) — üretime çıkmadan önce ZORUNLU

1. Polar dashboard → webhook URL set et → test event gönder → 200 + log doğrula
2. Sandbox Plus checkout → DB'de `plan='plus'`, `analyses_limit=20` doğrula
3. Sandbox Pro checkout → `plan='pro'`, `analyses_limit=999999` doğrula
4. Cancel + revoke → `plan='free'`, `limit=1` doğrula
5. `customer_external_id` değerinin DB'deki `auth.users.id` ile eşleştiğini doğrula
6. Build'de service role key sızıntısı: `grep -r SERVICE_ROLE .next/static` → boş olmalı

---

## En Riskli 5 Alan

1. **Bilinmeyen productId yanlış plan vermesin** — env karıştırılırsa (P0 #3 testi)
2. **`customer_external_id` doğru user'a bağlı mı** — checkout link oluştururken login user'ın id'si kullanılıyor (P0 #5 manuel)
3. **`canceled` ≠ `revoked`** — canceled'da plan düşürülürse ödediği halde erişim kaybeder
4. **Quota race condition** — atomic RPC koruyor ama e2e testi yok
5. **Service role key client bundle'a sızmaması** — `getServerEnv()` guard var ama build sonrası doğrulama yapılmadı

---

## Hızlı Başlangıç

```bash
cd /Users/eren/repos/ClinicalPSM
npm run lint && npx tsc --noEmit && npm test
# Beklenen: 0 hata / 0 uyarı / 265 test geçiyor

npx playwright test --workers=2
# Beklenen: 25 pass, ~106 pre-existing fail (i18n locale-prefix — scope dışı)
```

Polar webhook local test:

```bash
cloudflared tunnel --url http://localhost:3000
# Polar dashboard → Webhooks → <tunnel>/api/webhooks/polar
# subscription.* events seç → Send test webhook
```
