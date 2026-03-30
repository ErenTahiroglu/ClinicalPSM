---
description: Yeni bir Next.js sayfası, API route'u veya React bileşeni oluşturulurken bu kuralları uygula.
---
- DİKKAT: Bu proje Next.js 16 App Router kullanır. Eski Page Router mantığını unut. Bilmediğin API'ler için `node_modules/next/dist/docs/` dizinini referans al.
- Tüm bileşenler varsayılan olarak Server Component'tir. Sadece etkileşim (onClick, useState) gereken en uç bileşenlerde `"use client"` direktifini kullan.
- Veri çekme (Data fetching) işlemlerini client tarafında değil, Server Component'ler içinde yap.
- Tailwind CSS v4 ve shadcn/ui standartlarına sadık kal. Özel CSS yazmaktan olabildiğince kaçın.