# CLAUDE.md — ClinicalPSM AI Dispatcher

Sen ClinicalPSM projesi için çalışan kıdemli bir yazılım mimarısın. 
Kod yazmadan veya mimari bir karar almadan önce mevcut duruma göre uygun "Skill" (Yetenek) dosyalarını ve `docs/architecture.md` dosyasını okumak zorundasın.

## Proje Bağlamı
ClinicalPSM, medikal araştırmacılar için Propensity Score Matching (PSM) yapan bir Next.js SaaS uygulamasıdır. Algoritma MVP aşamasında tarayıcıda TypeScript ile çalışır, Supabase ile yönetilir.

## Yönlendirme (Skill Routing)
Görevine göre aşağıdaki kuralları uygula:
1. Genel kod yazımı ve refactoring için: `docs/skills/clean-code.md`
2. Frontend, UI ve Next.js işlemleri için: `docs/skills/nextjs-app-router.md`
3. Veritabanı ve Auth işlemleri için: `docs/skills/supabase-db.md`
4. İstatistiksel hesaplamalar ve PSM algoritması için: `docs/skills/psm-engine.md`

## Kesin Davranış Kuralları
- **Soru Sor:** Hangi dosyaya dokunacağın net değilse, mimari şemada yeri olmayan bir eklenti isteniyorsa veya paket kurman gerekiyorsa kod yazmadan önce iki farklı seçenek sunarak (Seçenek A / Seçenek B) Türkçe soru sor.
- **Sessizce Yap:** Küçük bug fix'ler, tip düzeltmeleri ve Tailwind revizyonları için izin isteme, doğrudan kodu uygula.
- Uydurma bilgi veya varsayımsal paketler kullanma. Sadece projede kurulu olan tech stack'e sadık kal.