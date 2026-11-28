# The Strapi image (spec, The cms/ folder): Node 24 as the rest of the repository, built on the host from the lockfile
# that cms.yml checks, run as the non-root user `node` of the official image.
FROM node:24.22.3-bookworm-slim AS build
ENV NODE_ENV=production STRAPI_TELEMETRY_DISABLED=true
WORKDIR /opt/cms
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable && yarn cache clean --all
COPY tsconfig.json ./
COPY config ./config
COPY src ./src
COPY public ./public
COPY database ./database
RUN yarn build

FROM node:24.22.3-bookworm-slim
ENV NODE_ENV=production STRAPI_TELEMETRY_DISABLED=true STRAPI_DISABLE_UPDATE_NOTIFICATION=true
WORKDIR /opt/cms
COPY --from=build --chown=root:root /opt/cms ./
# the only directories Strapi writes: the uploads (a volume, Q5), the weekly export archives (a volume) and its
# temporary files
RUN mkdir -p public/uploads exports .tmp && chown node:node public/uploads exports .tmp
USER node
EXPOSE 1337
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=12 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:1337/_health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "node_modules/@strapi/strapi/bin/strapi.js", "start"]
