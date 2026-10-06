FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
RUN mkdir -p /data
ENV NODE_ENV=production PORT=3000 PIGGY_DB=/data/piggy.db
EXPOSE 3000
CMD ["npm","start"]
