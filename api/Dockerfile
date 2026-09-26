FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
RUN mkdir -p /data/media
ENV NODE_ENV=production PORT=4000 MEDIA_DIR=/data/media
EXPOSE 4000
CMD ["node","src/server.js"]
