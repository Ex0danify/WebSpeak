FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY web/package.json web/package-lock.json ./web/
RUN npm ci --ignore-scripts --no-audit --no-fund
RUN npm rebuild @discordjs/opus --foreground-scripts --no-audit --no-fund
RUN npm --prefix web ci

COPY . .
RUN npm run build \
  && npm prune --omit=dev \
  && rm -rf web/node_modules

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates libstdc++6 iputils-ping \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data \
  && chown node:node /data

ENV NODE_ENV=production
ENV WEBSPEAK_DATA_DIR=/data

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/web/dist ./web/dist

USER node
VOLUME ["/data"]
# Documentation only: the port is WEBSPEAK_PORT (3040 in .env.example).
EXPOSE 3040/tcp 39087/udp 40000-40099/udp
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["sh", "-c", "if [ \"$WEBSPEAK_MODE\" = \"relay\" ]; then node -e \"process.exit(0)\"; else node -e \"fetch('http://127.0.0.1:'+process.env.WEBSPEAK_PORT+'/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))\"; fi"]

CMD ["node", "dist/index.js"]
