FROM node:24-bookworm-slim@sha256:91acba91b842bec0bf7ea6f5e09c644c7ccad72c4996ed9616d861d1c7cd60d4 AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig*.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm build && pnpm prune --prod
# Declared after the build so a new commit only invalidates the build-info layer.
ARG BUILD_COMMIT=unknown
COPY scripts/build-info.mjs ./scripts/build-info.mjs
RUN node scripts/build-info.mjs "$BUILD_COMMIT" /app/build-info.json

FROM node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS runtime
ARG BUILD_COMMIT=unknown
ARG BUILD_VERSION=unknown
LABEL org.opencontainers.image.title="gitea-chatgpt-plugin" \
      org.opencontainers.image.source="https://github.com/Tracht-Digital-Solutions/gitea-chatgpt-plugin" \
      org.opencontainers.image.revision="$BUILD_COMMIT" \
      org.opencontainers.image.version="$BUILD_VERSION"
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/build-info.json ./build-info.json
COPY --chown=node:node package.json ./
COPY --chown=node:node plugin/assets ./plugin/assets
RUN rm -rf /usr/local/lib/node_modules /opt/yarn* /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn* \
    && mkdir /app/data && chown node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","dist/apps/mcp-server/src/index.js"]
