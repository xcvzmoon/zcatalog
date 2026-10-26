# syntax=docker/dockerfile:1

FROM node:26.0.0-bookworm-slim AS base

WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates libgomp1 \
    && rm -rf /var/lib/apt/lists/*

FROM base AS build

ENV CI=true \
    LEFTHOOK=0

RUN npm install --global pnpm@12.15.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store

COPY . .
RUN pnpm build
RUN runtime_arch="$(node -p 'process.arch')" \
    && runtime_bin=.output/server/node_modules/onnxruntime-node/bin/napi-v6/linux \
    && test -d "$runtime_bin/$runtime_arch" \
    && find "$runtime_bin" -mindepth 1 -maxdepth 1 ! -name "$runtime_arch" -exec rm -rf {} + \
    && rm -rf .output/server/node_modules/onnxruntime-web

FROM base AS runtime

LABEL org.opencontainers.image.source="https://github.com/xcvzmoon/zcatalog"

ENV NODE_ENV=production \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000

COPY --from=build /app/.output ./.output
RUN mkdir -p .data .output/server/node_modules/@huggingface/transformers/.cache \
    && chown -R node:node .data .output/server/node_modules/@huggingface/transformers/.cache

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node --input-type=module -e "const response = await fetch('http://127.0.0.1:3000/api', { signal: AbortSignal.timeout(4000) }); if (!response.ok) { process.exit(1); }"

CMD ["node", ".output/server/index.mjs"]
