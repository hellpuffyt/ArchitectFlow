# ArchitectFlow web image (built and run with Docker Compose on arm64; amd64 via CI).
FROM node:24-slim AS build
WORKDIR /app
ARG ARCHITECTFLOW_API_ORIGIN=http://api:8000
ENV ARCHITECTFLOW_API_ORIGIN=$ARCHITECTFLOW_API_ORIGIN NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx next build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./
USER node
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000", "-H", "0.0.0.0"]
