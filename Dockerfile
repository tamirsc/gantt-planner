# Single-container deployment: builds every package and serves the API plus the web app.
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/mspdi/package.json packages/mspdi/
COPY packages/web/package.json packages/web/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile
COPY packages ./packages
RUN pnpm -r build
# Keep only production dependencies for the runtime image.
RUN pnpm --filter @gantt-planner/server --prod --legacy deploy /out/server \
 && cp -r packages/web/dist /out/web-dist

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/server ./server
COPY --from=build /out/web-dist ./web/dist
COPY packages/server/migrations ./server/migrations
WORKDIR /app/server
ENV PORT=3000
ENV WEB_DIST=/app/web/dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
