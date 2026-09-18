# deploy/Dockerfile
# Nutzt next.config.mjs `output: 'standalone'` (CP17) und den Node-24-Pin aus
# .nvmrc/package.json engines (CP17).
#
# Persistenter Storage wird NICHT ins Image gebacken — STORAGE_LOCAL_PATH und
# der Dokumentenarchiv-Pfad werden als Docker-Volumes von außen gemountet
# (siehe docker-compose.production.yml, Volumes "uploads"/"archive"). Ein
# Rebuild/Redeploy des Containers darf niemals Upload-/Archivdaten löschen.
#
# Build-Context ist der Repo-Root (siehe docker-compose.production.yml:
# build.context: ..), .dockerignore schließt .env*, node_modules, storage/
# etc. explizit vom Build-Context aus — kein Secret, keine lokale Nutzdaten
# im Image.

# ---- Stage 1: deps + prisma generate ----
FROM node:24-slim AS deps
WORKDIR /app
# node:24-slim enthält kein OpenSSL — Prisma braucht es sowohl hier (um beim
# generate den richtigen Engine-Binary-Typ zu erkennen) als auch später zur
# Laufzeit (siehe runner-Stage). Ohne dies: "Unable to require(...): libssl.so
# cannot open shared object file" beim ersten DB-Zugriff (real getestet, CP17
# Aufgabe 9).
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate

# ---- Stage 2: build ----
FROM node:24-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .
RUN npm run build

# ---- Stage 3: runtime (schlank, kein npm/prisma-CLI) ----
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Siehe Kommentar in der deps-Stage — ohne OpenSSL kann Prismas Query-Engine-
# Binary zur Laufzeit nicht geladen werden (libssl.so.1.1/3 fehlt sonst).
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Non-root User, wie von Next.js' eigenem Docker-Beispiel empfohlen
RUN groupadd --gid 1001 nodejs && useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nextjs

# Kein public/-Verzeichnis in diesem Projekt vorhanden (geprüft) — Next.js'
# eigener Build erzeugt auch keines; falls später eines hinzukommt, hier
# `COPY --from=builder /app/public ./public` ergänzen.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Storage- und Archiv-Verzeichnisse existieren als Volume-Mountpunkte
# (siehe docker-compose.production.yml, Volumes "uploads" und "archive") —
# hier nur die Mountpunkte mit korrekten Rechten anlegen, keine Daten.
RUN mkdir -p /app/storage/documents /app/archive \
    && chown -R nextjs:nodejs /app/storage /app/archive

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
