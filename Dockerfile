# 一体化部署：同一个容器、同一个端口提供网页和联机服务
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server ./server
COPY package.json ./
ENV PORT=8787
EXPOSE 8787
CMD ["node", "server/index.js"]
