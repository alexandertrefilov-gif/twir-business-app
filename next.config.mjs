// next.config.mjs
import { fileURLToPath } from 'node:url'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

/** @type {import('next').NextConfig} */
const sharedConfig = {
  outputFileTracingRoot: projectRoot,

  // Strikte Typenprüfung im Build
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },

  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/_next/image',
          destination: '/api/image-optimizer-disabled',
        },
      ],
    }
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

/** @type {import('next').NextConfig} */
const developmentConfig = {
  ...sharedConfig,
  distDir: '.next-dev',
}

/**
 * Entwicklungs- und Produktionsserver dürfen nicht dieselben Build-Artefakte
 * verwenden. Andernfalls kann ein parallel laufendes `next dev` einen bereits
 * gebauten Middleware-Bundle unter `.next` ersetzen.
 *
 * @param {string} phase
 * @returns {import('next').NextConfig}
 */
export default function nextConfig(phase) {
  return phase === PHASE_DEVELOPMENT_SERVER
    ? developmentConfig
    : sharedConfig
}
