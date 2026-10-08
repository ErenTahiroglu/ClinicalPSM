# SEC-00 Son Kontrol Listesi (Sahibi için, Türkçe)

Durum (2026-10-08, ben doğruladım): aşağıdaki üç koruma **henüz yapılmamış**. Hiçbir şeyi ben değiştirmedim. Her adımdan sonra bana yalnızca "yaptım" yaz; ben dışarıdan doğrularım (`scripts/devtools/verify-containment.sh`). Şifre, e-posta veya anahtar paylaşma.

## Sırayla yapılacaklar (hepsi geri alınabilir, kod ya da veri değişikliği yok)

### 1. Vercel: üretim alan adını korumaya al (en önemlisi)
Vercel → **clinicalpsm** projesi → **Settings → Deployment Protection** → **Vercel Authentication** açık → kapsam: **All Deployments** → **Save**.
- Dikkat: **"Standard Protection" yetmez**; Vercel dokümanına göre o seçenek *production alan adlarını korumaz*. Şu an proje bu ayarda (`all_except_custom_domains`), bu yüzden `www.clinicalpsm.com` herkese açık.
- Etki: site, Vercel hesabınla giriş yapmayan herkes için kapanır (Hobby planda ücretsiz). Polar webhook'u da kapanır; abone olmadığı için sorun değil.
- Geri alma: aynı ekrandan kapat.

### 2. Supabase: yeni kayıtları kapat
Supabase → **ClinicalPSM** → **Authentication → Sign In / Providers** (eski arayüzde *Authentication → General*) → **"Allow new users to sign up"** kapalı → Save.
- Şu an açık (`disable_signup: false`). İki mevcut hesabın çalışmaya devam eder.

### 3. Supabase: Data API'yi kapat (doğrudan veritabanı erişimini keser)
Supabase → **Integrations → Data API** (veya *Settings → Data API*) → **Enable Data API** kapalı.
- Neden: Vercel koruması **PostgREST/RPC'yi engellemez**. Herkesin görebildiği genel (publishable) anahtarla şu an doğrudan `…supabase.co/rest/v1/…` çağrılabiliyor (ben `analysis_cache` için 200 yanıtı gördüm; tablo boş). Canlı veritabanında `anon` rolünün tüm tablolarda geniş yetkisi var ve `analysis_cache` ile `audit_logs` politikaları anonim kullanıcıya açık.
- Etki: eski site çalışmaz (zaten kapatıyoruz). Geri alma: aynı anahtar.

### 4. Polar: eski ödeme bağlantılarını devre dışı bırak
Polar paneli → **Products / Checkout Links** → Plus ve Pro bağlantılarını **arşivle/devre dışı bırak**. (Aboneliğe dokunma; abone yok.) Bunu dışarıdan doğrulayamam; senin onayın gerekir.

### 5. GitHub: gizli anahtar taraması
GitHub → repo **ClinicalPSM → Settings → Advanced Security (Code security)** → **Secret scanning: Enable** ve **Push protection: Enable** (herkese açık depolarda ücretsiz).

## Yedek gerekli mi?
- **Hayır, şimdi gerekli değil.** İki hesap da senin; analiz, yükleme, depolama nesnesi, abonelik yok (benim yaptığım salt-okunur sayımlar bunu doğruladı).
- Önerilen: **yalnızca şema/yapılandırma dışa aktarımı** (veri içermez; yönerge `SEC-00-SUPABASE-INVENTORY-AND-BACKUP.md` bölüm 8.1). Auth/audit verisi için arşiv **isteğe bağlı**; istersen şifreli ve Git/Claude dışında saklanır.
- Unutma: tam uygulama geri dönüşü şemadan fazlasını gerektirir (Auth ayarları/SMTP, API anahtarları, ortam değişkenleri). Supabase'i **durdurma (pause)** yedeksiz de geri alınabilir (1 yıllık geri yükleme penceresi; bu 2026-10-08 itibarıyla Supabase dokümanındaki ifade).

## Supabase'i duraklatabilir miyim?
**Henüz değil.** Önce 1–3 yapılmalı ve Kırmızı Takım onayı gelmeli (`SEC-00-RETIREMENT-GATE.md`). Duraklatma/silme için ayrı yazılı onayın gerekir.

## Bana geri yazacakların (sadece evet/hayır)
1. Vercel All Deployments açıldı mı? 2. Sign-ups kapatıldı mı? 3. Data API kapatıldı mı? 4. Polar bağlantıları devre dışı mı? 5. GitHub secret scanning + push protection açık mı?
(İsteğe bağlı: audit kayıtlarının senin test çalışmandan olduğunu doğrulamak istersen, kendi bilgisayarında IP'ni `printf '%s' '<ip>' | md5 | cut -c1-8` ile özetleyip "eşleşiyor/eşleşmiyor" yazman yeterli; IP'yi paylaşma.)
