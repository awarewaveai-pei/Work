# Production image: small, non-root, no bind-mount required
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs apiuser

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

USER apiuser
EXPOSE 3001

CMD ["node", "src/index.js"]
