# CLAUDE.md — ClinicalPSM

Bu dosya, bu repoda çalışan her Claude instance'ının okuması gereken ana rehberdir.
Kod yazmadan önce bu dosyayı ve `docs/architecture.md` dosyasını oku.

---

## Proje Nedir?

**ClinicalPSM**, kod yazmayı bilmeyen akademik ve medikal araştırmacıların
CSV dosyası yükleyerek **Propensity Score Matching (PSM)** analizi yapmasını
ve yayına hazır istatistiksel tablolar/görseller almasını sağlayan bir web SaaS uygulamasıdır.

**Hedef kullanıcı:** Tıp/akademi alanında çalışan, R veya Stata bilmeyen araştırmacılar.
**Temel akış:** CSV yükle → Değişkenleri seç → PSM çalıştır → Tablo/grafik indir

---

## Tech Stack

| Katman | Teknoloji | Neden |
|---|---|---|
| Framework | Next.js 16 (App Router) + TypeScript | SEO, server components, built-in API routes |
| Styling | Tailwind CSS v4 + shadcn/ui | Hızlı geliştirme, profesyonel görünüm |
| Auth + DB | Supabase | Auth, PostgreSQL, file storage hepsi bir arada |
| PSM Engine | TypeScript (MVP) → Python microservice (v2) | MVP'de sıfır maliyet |
| Deployment | Vercel (frontend) + Railway (Python, v2'de) | Free tier yeterli |
| Payments | Polar.sh | Freemium → ücretli geçiş, basit entegrasyon |

---

## Klasör Yapısı

```
clinicalpsm/
├── src/
│   ├── app/                    # Next.js App Router sayfaları
│   │   ├── (auth)/             # Login, register sayfaları
│   │   ├── (dashboard)/        # Korumalı dashboard sayfaları
│   │   │   ├── analyses/       # Analiz listesi
│   │   │   └── new/            # Yeni analiz wizard'ı
│   │   ├── api/                # API route'ları
│   │   │   ├── analyses/       # PSM analiz endpoint'leri
│   │   │   └── webhooks/       # Polar.sh webhook'ları
│   │   └── page.tsx            # Landing page
│   ├── components/
│   │   ├── ui/                 # shadcn/ui bileşenleri (dokunma)
│   │   ├── analysis/           # PSM akışına özel bileşenler
│   │   └── shared/             # Header, Footer, vb.
│   ├── lib/
│   │   ├── supabase/           # Supabase client ve server helper'ları
│   │   ├── psm/                # PSM hesaplama motoru (TypeScript)
│   │   │   ├── logistic.ts     # Logistic regression (propensity score)
│   │   │   ├── matching.ts     # Nearest neighbor matching
│   │   │   └── balance.ts      # SMD ve balance tabloları
│   │   ├── export/             # PDF ve CSV export fonksiyonları
│   │   └── polar/              # Polar.sh helper'ları
│   ├── hooks/                  # Custom React hook'ları
│   └── types/                  # TypeScript tip tanımları
├── docs/
│   ├── architecture.md         # Teknik mimari detayları
│   └── psm-algorithm.md        # PSM algoritmasının açıklaması
├── supabase/
│   └── migrations/             # DB migration dosyaları
├── CLAUDE.md                   # ← bu dosya
└── .env.local.example          # Gerekli environment variable'lar
```

---

## Temel Kurallar

### Genel
- Her zaman **TypeScript** kullan, `any` tipinden kaçın.
- Bileşenler **server component** olarak başlar; sadece gerektiğinde `"use client"` ekle.
- API route'larında **her zaman** Supabase auth kontrolü yap.
- Hassas iş mantığı (PSM hesaplama, Polar.sh) asla client tarafına gitmez.

### Naming
- Dosyalar: `kebab-case.ts`
- React bileşenleri: `PascalCase.tsx`
- Fonksiyonlar/değişkenler: `camelCase`
- Supabase tablo isimleri: `snake_case`

### Hata Yönetimi
- API route'larında `try/catch` zorunlu.
- Kullanıcıya gösterilen hata mesajları İngilizce ve anlaşılır olmalı.
- PSM hesaplamasında veri kalitesi sorunları (eksik değer, küçük n) kullanıcıya açıkça bildirilmeli.

### PSM Engine Kuralları
- `src/lib/psm/` içindeki hesaplama fonksiyonları **pure function** olmalı (side-effect yok).
- Her fonksiyon için birim testi zorunlu.
- Hesaplama hataları `PsmError` tipinde fırlatılmalı, genel `Error` değil.

---

## Supabase Tabloları

```sql
-- Kullanıcı analiz kotası ve abonelik durumu
-- plan: 'free' (limit=3) | 'plus' (limit=25, $5/ay) | 'pro' (limit=999999, $20/ay)
profiles (id, user_id, plan, analyses_used, analyses_limit, polar_customer_id, polar_subscription_id)

-- Her PSM analizi
analyses (id, user_id, name, status, config, result_summary, created_at)

-- Yüklenen CSV dosyaları (Supabase Storage'a referans)
uploads (id, analysis_id, file_path, row_count, column_names, created_at)
```

---

## Environment Variables

```
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
POLAR_ACCESS_TOKEN=
POLAR_WEBHOOK_SECRET=
NEXT_PUBLIC_POLAR_PLUS_PRODUCT_ID=
NEXT_PUBLIC_POLAR_PRO_PRODUCT_ID=
```

---

## MVP Kapsamı (v0.1)

**Dahil:**
- [ ] Email/password auth (Supabase Auth)
- [ ] CSV yükleme ve sütun önizleme
- [ ] Değişken seçim arayüzü (treatment, outcome, covariates)
- [ ] TypeScript PSM motoru (logistic regression + nearest neighbor)
- [ ] Balance tablosu (SMD before/after)
- [ ] Love plot görseli
- [ ] CSV sonuç indirme
- [ ] Freemium limit (3 analiz ücretsiz)

**Dahil Değil (v0.1):**
- Polar.sh ödeme entegrasyonu (önce validasyon)
- PDF export
- Çoklu eşleştirme algoritması (sadece nearest neighbor)
- Team/collaboration özellikleri
- Çoklu dil desteği

---

## Claude Code Davranış Kuralları

### Net Olmayan Durumlarda Soru Sor
Aşağıdaki durumlarda kodu yazmadan önce **Türkçe olarak sor:**

- Hangi sayfaya / bileşene kod yazılacağı net değilse
- Birden fazla mantıklı implementasyon yolu varsa
- Yeni bir tablo veya Supabase kolonu gerekiyorsa (şemayı değiştirmeden önce sor)
- Bir özelliğin MVP kapsamında olup olmadığı belirsizse
- Kullanıcı deneyimi kararı gerekiyorsa (akış, hata mesajı, yönlendirme)
- Dış servis / API anahtarı gerekiyorsa

### Soru Formatı
```
❓ [Konu]: [Net olmayan şey]
Seçenek A: ...
Seçenek B: ...
Hangisini tercih edersin?
```

### Soru Sormadan Devam Et
Bunlar için soru sorma, doğrudan yap:
- Küçük bug fix'ler
- Tip düzeltmeleri
- Tailwind stil değişiklikleri
- Dosya/klasör oluşturma (architecture.md'ye uygunsa)
- Console.log temizleme

---

## Geliştirme Komutları

```bash
npm run dev          # Geliştirme sunucusu
npm run build        # Production build
npm run test         # Birim testleri (psm engine)
npm run typecheck    # TypeScript kontrol
npx supabase start   # Yerel Supabase
npx supabase db push # Migration'ları uygula
```
