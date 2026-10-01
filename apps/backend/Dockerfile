FROM node:22-bookworm-slim AS build

WORKDIR /app

# O contexto de build é a raiz do monorepo; o lockfile e os manifests dos
# workspaces permitem instalar apenas as dependências do backend.
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
RUN npm ci --workspace @estoque-revisao/backend --include-workspace-root=false --no-audit --no-fund

COPY apps/backend/nest-cli.json apps/backend/tsconfig.json apps/backend/tsconfig.build.json apps/backend/
COPY apps/backend/src apps/backend/src
RUN npm run build --workspace @estoque-revisao/backend

FROM node:22-bookworm-slim AS production-dependencies

ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
RUN npm ci --omit=dev --workspace @estoque-revisao/backend --include-workspace-root=false --no-audit --no-fund

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./package.json
COPY --chown=node:node apps/backend/package.json ./apps/backend/package.json
COPY --from=build --chown=node:node /app/apps/backend/dist ./apps/backend/dist

USER node
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@estoque-revisao/backend"]
