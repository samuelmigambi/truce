# Truce's production image: the Next.js standalone server on a slim Node image, run as a non-root
# user. Secrets never enter the image; Cloud Run injects them from Secret Manager at runtime
# (scripts/deploy-cloud-run.sh). Build and run locally:
#
#   docker build -t truce .
#   docker run --rm -p 8080:8080 -e TRUCE_STORE=memory truce      # http://localhost:8080

ARG NODE_VERSION=24

# ── Dependencies: cached on the lockfile alone ────────────────────────────────
FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ── Build: next build with standalone output ──────────────────────────────────
FROM node:${NODE_VERSION}-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── Runtime: the standalone server, its static files and public assets ───────
FROM node:${NODE_VERSION}-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 8080
CMD ["node", "server.js"]
