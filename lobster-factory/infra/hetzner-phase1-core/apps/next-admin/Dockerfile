# Production Next.js (standalone output)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_API_BASE_PATH=/api
ARG NEXT_PUBLIC_POSTHOG_KEY=
ARG NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_API_BASE_PATH=$NEXT_PUBLIC_API_BASE_PATH
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Ghostscript for the POD print track ([0-a-gs]): turns pdf-lib's CMYK PDF into PDF/X-1a
# with an embedded ICC /OutputIntent (lib/studio/ghostscript-pdfx.ts). Bundles a SWOP
# CMYK profile at /usr/share/ghostscript/iccprofiles/default_cmyk.icc (the default
# DestOutputProfile). Enable the pass at runtime with POD_OUTPUT_INTENT_DEPLOYED=true.
# font-noto + font-noto-cjk: CJK characters in Sharp SVG overlays (featured image title text).
# fontconfig: required by librsvg/Sharp to locate installed fonts at runtime.
RUN apk add --no-cache ghostscript fontconfig font-noto font-noto-cjk && fc-cache -f

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Explicitly copy SDK modules not traced by Next.js standalone tracer
# (runtime-only imports used in API routes are often missed)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@anthropic-ai ./node_modules/@anthropic-ai
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/ssh2 ./node_modules/ssh2
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/sharp ./node_modules/sharp
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
