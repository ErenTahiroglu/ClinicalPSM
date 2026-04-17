// Root layout: minimal shell for non-locale routes (API, auth callback).
// All page routes live under src/app/[locale]/layout.tsx.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
