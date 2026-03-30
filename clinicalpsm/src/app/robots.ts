import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://clinicalpsm.com'

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/pricing'],
        disallow: ['/analyses', '/new', '/settings', '/api/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
