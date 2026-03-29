# Architecture — ClinicalPSM

> Son güncelleme: Mart 2026 | Versiyon: MVP (v0.1)

---

## Genel Bakış

ClinicalPSM, **sunucu merkezli bir Next.js uygulaması** olarak tasarlanmıştır.
PSM hesaplaması MVP'de TypeScript ile tarayıcıda çalışır; v2'de Python microservice'e taşınır.

```
┌─────────────────────────────────────────────────┐
│                   Kullanıcı                      │
│              (Araştırmacı, Tarayıcı)             │
└──────────────────────┬──────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────┐
│              Next.js App (Vercel)                │
│                                                  │
│  ┌─────────────┐    ┌──────────────────────┐    │
│  │ React UI    │    │  API Routes          │    │
│  │ (App Router)│    │  /api/analyses       │    │
│  │             │    │  /api/webhooks/polar │    │
│  └──────┬──────┘    └──────────┬───────────┘    │
│         │                      │                 │
│  ┌──────▼──────────────────────▼───────────┐    │
│  │           PSM Engine (TypeScript)        │    │
│  │  logistic.ts → matching.ts → balance.ts  │    │
│  └─────────────────────────────────────────┘    │
└──────────────────┬──────────────────────────────┘
                   │
       ┌───────────┼───────────┐
       │           │           │
┌──────▼───┐ ┌────▼─────┐ ┌──▼──────┐
│ Supabase │ │ Supabase │ │Polar.sh │
│   Auth   │ │  DB +    │ │Payments │
│          │ │ Storage  │ │         │
└──────────┘ └──────────┘ └─────────┘
```

---

## Veri Akışı: PSM Analizi

```
1. UPLOAD
   Kullanıcı CSV seçer
   → Client: FileReader ile parse (Papa Parse)
   → Önizleme göster (ilk 5 satır, sütun isimleri)
   → API: POST /api/analyses/upload
   → Supabase Storage'a dosya yükle
   → DB: uploads tablosuna kayıt

2. CONFIGURE
   Kullanıcı değişkenleri seçer:
   - Treatment variable (binary: 0/1)
   - Outcome variable (opsiyonel)
   - Covariates (çoklu seçim)
   - Matching ratio (1:1, 1:2, 1:3)
   - Caliper (opsiyonel, 0.2 * SD önerilen)
   → DB: analyses.config güncelle

3. COMPUTE (MVP: Client-side TypeScript)
   Web Worker içinde çalışır (UI donmaz):
   a. Veri validasyonu (eksik değer kontrolü)
   b. Logistic regression → propensity score'lar
   c. Nearest neighbor matching (with/without replacement)
   d. Caliper filtresi (seçildiyse)
   e. Balance istatistikleri (SMD, variance ratio)
   → API: POST /api/analyses/{id}/results
   → DB: analyses.result_summary, analyses.status = 'completed'

4. RESULTS
   - Balance tablosu (before/after SMD)
   - Love plot (ggplot2 tarzı görsel)
   - Matched dataset CSV indirme
   → Analiz kotası güncelleme (profiles.analyses_used++)
```

---

## PSM Algoritması (TypeScript Engine)

### Adım 1: Propensity Score Hesaplama

```
Logistic Regression:
- Input: covariate matrix X (n × p), treatment vector T (n × 1)
- Output: propensity score p(X) = P(T=1|X) ∈ [0,1]
- Implementasyon: gradient descent (100 iterasyon, lr=0.01)
- Alternatif (v2): Python scikit-learn LogisticRegression
```

### Adım 2: Nearest Neighbor Matching

```
For each treated unit i:
  Find control unit j* = argmin |p_i - p_j| among unmatched controls
  If |p_i - p_j*| <= caliper → match
  Else → unmatched (exclude)

Çıktı: matched pairs listesi [(treated_idx, control_idx), ...]
```

### Adım 3: Balance Değerlendirmesi

```
Standardized Mean Difference (SMD):
  SMD = (mean_treated - mean_control) / pooled_SD

Hedef: |SMD| < 0.1 (iyi balance)
Uyarı: |SMD| > 0.1 (kötü balance, kullanıcıya göster)
```

---

## Veritabanı Şeması

```sql
-- Supabase Auth tarafından yönetilen: auth.users

-- Kullanıcı profili ve plan bilgisi
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'plus', 'pro')),
  analyses_used INTEGER DEFAULT 0,
  analyses_limit INTEGER DEFAULT 3,  -- free: 3 | plus: 25 | pro: 999999
  polar_customer_id TEXT,
  polar_subscription_id TEXT,
  plan_interval TEXT DEFAULT 'monthly',
  plan_reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PSM analizleri
CREATE TABLE analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'completed', 'failed')),
  config JSONB,  -- {treatment, outcome, covariates, ratio, caliper}
  result_summary JSONB,  -- {n_treated, n_matched, smd_before, smd_after, ...}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Yüklenen CSV dosyaları
CREATE TABLE uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID REFERENCES analyses(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,  -- Supabase Storage path
  row_count INTEGER,
  column_names TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own their profiles" ON profiles
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users own their analyses" ON analyses
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users own their uploads" ON uploads
  FOR ALL USING (
    analysis_id IN (SELECT id FROM analyses WHERE user_id = auth.uid())
  );
```

---

## Frekans Limitleri (Freemium)

```
Free Plan:
  - 3 analiz toplam (analyses_limit = 3)
  - Maks. 500 satır CSV
  - Sadece nearest neighbor matching
  - CSV export

Plus Plan ($5/ay):
  - 25 analiz/ay (analyses_limit = 25, plan_reset_at ile sıfırlanır)
  - Maks. 500 satır CSV
  - CSV export
  - Email destek

Pro Plan ($20/ay):
  - Sınırsız analiz (analyses_limit = 999999)
  - Maks. 500 satır CSV
  - CSV export
  - Öncelikli destek
```

---

## Güvenlik

- Supabase Auth: JWT tabanlı session yönetimi
- Row Level Security: Her kullanıcı sadece kendi verisini görür
- API route'larında `auth.getUser()` kontrolü (her route'da zorunlu)
- CSV dosyaları Supabase Storage'da private bucket'ta saklanır
- Polar.sh webhook imzası doğrulanır
- Server-side row limit: free plan için 500 satır kontrolü
- Duplicate completion guard: tamamlanmış analizlere tekrar sonuç yazılamaz (409)

---

## v2 Yol Haritası (MVP Sonrası)

```
v0.2 — Para Testi
  + Polar.sh ödeme entegrasyonu
  + Plus ve Pro plan aktif
  + Polar webhook: checkout.order.created → plan aktif et
  + Polar webhook: subscription.revoked → free'ye düşür

v0.3 — Python Engine
  + FastAPI microservice (Railway üzerinde)
  + scikit-learn PSM (daha doğru logistic regression)
  + Kernel matching, optimal matching algoritmaları

v0.4 — Export
  + PDF export (publication-ready)
  + DOCX tablo export
  + LaTeX tablo çıktısı

v0.5 — Büyüme
  + Çoklu dil (önce İspanyolca — Latin Amerika akademi pazarı)
  + API erişimi (kurumsal plan)
```

---

## Teknoloji Seçim Gerekçeleri

| Karar | Seçilen | Reddedilen | Neden |
|---|---|---|---|
| Framework | Next.js 16 | Vite+React | SEO kritik (araştırmacılar Google'da arar), API routes built-in |
| DB | Supabase | Firebase | PostgreSQL (JSONB, RLS), daha ucuz, SQL bilgisi |
| PSM (MVP) | TypeScript | Python/WASM | Sıfır altyapı maliyeti, browser'da çalışır |
| UI | shadcn/ui | MUI, Chakra | Tailwind uyumu, copy-paste, vendor lock yok |
| Hosting | Vercel | Netlify, Railway | Next.js native, free tier yeterli |
| Payments | Polar.sh | Stripe | Daha basit entegrasyon, açık kaynak dostu |
