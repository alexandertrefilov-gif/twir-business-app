// next.config.mjs

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strikte Typenprüfung im Build
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },

  // Sicherheits-Header
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',         value: 'DENY' },
          { key: 'X-Content-Type-Options',  value: 'nosniff' },
          { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },

  // Dokumente / Storage nie über Next.js static serving ausliefern
  // Immer über API-Route mit Auth-Prüfung
}

export default nextConfig
