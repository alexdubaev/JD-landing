FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_SITE_URL=https://deere-shop.ru
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV DIRECTUS_URL=http://127.0.0.1:9
ENV DIRECTUS_PUBLIC_FOLDER_ID=1ecf70c5-0ad4-4e5e-8d73-78ee549f064a

RUN DIRECTUS_TOKEN=build-time-placeholder-token \
  REVALIDATE_SECRET=build-time-placeholder-secret \
  npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
