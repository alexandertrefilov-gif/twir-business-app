// next.config.mjs
import { fileURLToPath } from 'node:url'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

/** @type {import('next').NextConfig} */
const sharedConfig = {
  outputFileTracingRoot: projectRoot,
  output: 'standalone',

  // Strikte Typenprüfung im Build
  typescript: {
    ignoreBuildErrors: false,
  },

  experimental: {
    // Next.js liest den Request-Body vollständig ein, sobald der Proxy
    // greift (siehe proxy.ts-Matcher). Ohne dieses Limit werden Bodies
    // über 10 MB stillschweigend abgeschnitten — der 20-MB-Upload für
    // Kundenbestellungen (lib/security/upload-validator.ts) würde dann mit
    // einem kaputten multipart-Body statt einer sauberen 413-Antwort scheitern.
    proxyClientMaxBodySize: '25mb',
    // Aktiviert next/navigation forbidden()/unauthorized(): eine in einer
    // Server-Component-Seite geworfene ForbiddenError/UnauthorizedError wird
    // dadurch korrekt als 403/401 beantwortet statt als generischer 500-Fehler
    // (siehe requirePagePermission in lib/auth/permissions.ts sowie
    // forbidden.tsx/unauthorized.tsx in den jeweiligen Routengruppen).
    authInterrupts: true,
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
      {
        // Die authentifizierte Angebotsvorschau wird ausschließlich innerhalb
        // derselben TWIR-Origin im Workflow-Dialog eingebettet.
        source: '/api/offers/:id/preview',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      {
        // Die konfigurierbare Auftragsvorschau wird ausschließlich innerhalb
        // derselben TWIR-Origin im Workflow-Dialog eingebettet.
        source: '/api/orders/:id/pdf',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      {
        // Archiv-PDFs bleiben authentifiziert und dürfen nur in der
        // Explorer-Vorschau derselben TWIR-Origin eingebettet werden.
        source: '/api/document-archive/file',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      {
        // Eingegangene Kundenbestellungen werden ausschließlich nach
        // Session- und Dokumentberechtigungsprüfung inline ausgeliefert.
        source: '/api/documents/:id/download',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
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
