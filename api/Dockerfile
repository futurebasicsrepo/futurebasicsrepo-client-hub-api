FROM node:22-alpine
WORKDIR /app
# ffmpeg converts uploads to web-safe MP4 and powers live streams.
RUN apk add --no-cache ffmpeg font-dejavu
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
RUN mkdir -p /data/media /data/live
ENV NODE_ENV=production PORT=4000 MEDIA_DIR=/data/media
EXPOSE 4000
CMD ["node","src/server.js"]
