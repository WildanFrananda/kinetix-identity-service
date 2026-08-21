FROM oven/bun:1-alpine AS builder

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile || bun install

COPY . .

EXPOSE 5000

ENV PORT=5000

CMD ["bun", "run", "src/main.ts"]
