FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS builder
COPY . .
# Next.js resolves the API rewrite during build; changing the origin requires a rebuild.
ARG COS_API_ORIGIN=http://cognitive-os-api:8420
ENV COS_API_ORIGIN=$COS_API_ORIGIN
RUN npm run build

FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
