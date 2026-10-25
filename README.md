# ClinicalPSM

ClinicalPSM is a modern web platform designed to make **Propensity Score Matching (PSM)** analysis accessible, secure, and intuitive for researchers and clinicians. Built with Next.js and Supabase, it provides a high-performance environment for observational data analysis.

## ✨ Key Features

- **Feature-Driven Architecture**: Highly scalable and maintainable folder structure organized by domain (auth, profile, analysis).
- **Dynamic Limit Management**: Robust daily analysis limit system (1 free analysis/day) powered by **PostgreSQL Advisory Locks** to prevent race conditions.
- **Atomic Creation**: Zero-latency analysis generation with atomic database operations.
- **E2E Testing Suite**: Comprehensive end-to-end coverage using Playwright to ensure reliability across all critical workflows.
- **Professional Analytics**: Detailed balance tables, SMD visualizations (Love Plots), and propensity score histograms.

## 💻 Tech Stack

- **Framework**: [Next.js 16 (App Router)](https://nextjs.org/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Database & Auth**: [Supabase](https://supabase.com/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) & [shadcn/ui](https://ui.shadcn.com/)
- **Testing**: [Playwright](https://playwright.dev/) & [Vitest](https://vitest.dev/)
- **Payments**: [Polar.sh](https://polar.sh/) (Beta)

## 🚀 Local Setup

Follow these steps to get the project running locally:

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/ClinicalPSM.git
   cd clinicalpsm
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy the example environment file and fill in your Supabase credentials:
   ```bash
   cp .env.example .env.local
   ```

4. **Run development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) with your browser to see the results.

## ☁️ Vercel Deployment

ClinicalPSM is optimized for Vercel. When deploying:
1. Import your repository into the Vercel Dashboard.
2. Add all environment variables listed in `.env.example` in the Project Settings -> Environment Variables section.
3. Deploy!

## 🧪 Testing

To run the full test suite:
```bash
# Unit & Integration tests
npm run test

# End-to-End tests
# (Requires a running dev/test server and environment setup)
cd .. && npx playwright test
```

## 📄 License

[![PolyForm Strict 1.0.0](https://img.shields.io/badge/PolyForm%20Strict-1.0.0-00a35c)](LICENSE.md)

**TR:** ClinicalPSM'nin lisanslama yetkisine sahip olunan özgün kodu, [PolyForm Strict License 1.0.0](LICENSE.md) kapsamında ticari olmayan araştırma ve kullanım için sunulur. Bu lisans, kodu değiştirme veya yeniden dağıtma izni vermez. Ücretli ürün, ticari klinik analiz hizmeti veya başka bir ürünle entegrasyon için ilgili hak sahiplerinden ayrıca yazılı lisans alınması gerekir.

**EN:** Original ClinicalPSM code for which the licensor has rights is offered under the [PolyForm Strict License 1.0.0](LICENSE.md). Noncommercial use is permitted; modification and redistribution are not licensed. Commercial applications, paid clinical analysis services, and integration into another product require separate written permission from the relevant rights holder.

This is **source-available**, not an OSI-approved open-source license. Third-party components, including WebR, R and R packages, remain subject to their **own licenses**. Historical rights or valid permissions already granted are not revoked merely by changing this README. See [license scope and third-party notes](docs/licensing/SCOPE_AND_THIRD_PARTY.md).
