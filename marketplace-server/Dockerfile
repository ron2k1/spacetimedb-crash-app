# syntax=docker/dockerfile:1
#
# Crash -- marketplace-server container image
# Build context: REPO ROOT (required so Docker can reach pnpm-lock.yaml
# and pnpm-workspace.yaml which live at root, not inside marketplace-server/).
#
# Strategy: `pnpm deploy` (single-stage after a build stage).
# pnpm deploy --prod copies the package + its workspace dependencies + their
# production node_modules into an isolated output directory, producing a
# self-contained folder that does not need the rest of the monorepo at runtime.
# This is simpler and more correct than manually pruning node_modules across
# workspace boundaries with --filter, and avoids the "hoisted packages not
# found" class of bugs that multi-stage filter approaches hit on pnpm v10.
# ---------------------------------------------------------------------------

# ---- builder: compile TypeScript ----------------------------------------
FROM node:24-alpine AS builder
WORKDIR /repo

# Enable pnpm via corepack (matches packageManager field in root package.json).
RUN corepack enable

# Copy root-level manifest files needed to install the full workspace.
# Copy ALL workspace package.json files so pnpm can resolve the dependency
# graph before any source is present (layer cache: only invalidates on
# manifest changes, not source changes).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY protocol/package.json ./protocol/package.json
COPY backend/package.json ./backend/package.json
COPY frontend/r3f-shell/package.json ./frontend/r3f-shell/package.json
COPY marketplace-server/package.json ./marketplace-server/package.json

# Install the full workspace so workspace: protocol dep resolves correctly.
# --frozen-lockfile: fail fast if lockfile is out of date (CI hygiene).
RUN pnpm install --frozen-lockfile

# Copy source for the packages marketplace-server depends on at build time.
# protocol/ is a workspace dep; its source is needed for tsc to type-check.
COPY protocol/ ./protocol/
COPY marketplace-server/ ./marketplace-server/

# Build marketplace-server (tsc -> marketplace-server/dist/).
RUN pnpm --filter @crash/marketplace-server run build

# ---- deployer: create a pruned production-only bundle -------------------
FROM node:24-alpine AS deployer
WORKDIR /repo

RUN corepack enable

# Copy the full build tree so `pnpm deploy` can resolve workspace internals.
COPY --from=builder /repo ./

# pnpm deploy produces a self-contained directory with only production deps
# and the compiled dist/.  No devDependencies, no other workspace packages.
RUN pnpm deploy --filter @crash/marketplace-server --prod /app

# ---- runtime: minimal image with only the deployed bundle ---------------
FROM node:24-alpine AS runtime
WORKDIR /app

# Copy the pruned self-contained bundle from the deployer stage.
COPY --from=deployer /app ./

# marketplace-server is type=module; dist/server.js is the compiled entrypoint.
EXPOSE 8787
ENV PORT=8787
ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
