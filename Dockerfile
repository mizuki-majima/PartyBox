FROM public.ecr.aws/docker/library/node:22-alpine AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM public.ecr.aws/docker/library/node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3001
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 3001
CMD ["node", "dist/server/index.js"]
