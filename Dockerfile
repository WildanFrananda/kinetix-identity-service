# Multi-Stage Production Dockerfile for Kinetix Identity Service (Bun + NestJS)
FROM oven/bun:1-alpine@sha256:07235578f79ef8c6f97d94aee7938e76f5cdba5f21ae5dbfdd3d3d38058437eb AS builder

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install

COPY . .
RUN bun run build

FROM oven/bun:1-alpine@sha256:07235578f79ef8c6f97d94aee7938e76f5cdba5f21ae5dbfdd3d3d38058437eb AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000
ENV GRPC_PORT=50052

COPY package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/proto ./proto

EXPOSE 5000 50052

USER bun

CMD ["bun", "run", "dist/main.js"]
