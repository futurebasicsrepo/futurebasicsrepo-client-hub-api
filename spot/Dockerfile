FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
RUN mkdir -p /data
ENV NODE_ENV=production PORT=3000 SPOT_DB=/data/spot.db
EXPOSE 3000
CMD ["npm","start"]
