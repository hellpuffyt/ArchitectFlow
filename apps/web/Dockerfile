# ArchitectFlow web image (built and run with Docker Compose on arm64; see docs/PRODUCTION_READINESS.md).
# Build and runtime use Debian 13 (trixie). The runtime stage contains only Node.js and the
# Next.js standalone server: npm, npx and corepack are removed, so their bundled packages ship nowhere.
FROM node:24-trixie-slim AS build
WORKDIR /app
ARG ARCHITECTFLOW_API_ORIGIN=http://api:8000
ENV ARCHITECTFLOW_API_ORIGIN=$ARCHITECTFLOW_API_ORIGIN NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx next build

FROM node:24-trixie-slim
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn-* \
      /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
