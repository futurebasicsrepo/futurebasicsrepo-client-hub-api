FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
# Chromium for the checkout agent (only used when SPOT_AGENT=on).
RUN npx playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*
COPY src ./src
# Spot in 3D and his stills (built: npm run build:spot3d), served from /assets
COPY assets ./assets
RUN mkdir -p /data
ENV NODE_ENV=production PORT=3000 SPOT_DB=/data/spot.db
EXPOSE 3000
CMD ["node","--disable-warning=ExperimentalWarning","src/server.js"]
