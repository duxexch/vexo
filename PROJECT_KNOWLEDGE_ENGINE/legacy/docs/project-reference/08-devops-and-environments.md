# 08 - DevOps and Environments

## Build and runtime scripts (`package.json`)

Core scripts:

- `npm run dev`: development server via `tsx server/index.ts`
- `npm run build`: production build pipeline
- `npm run start`: run built server bundle
- `npm run check`: TypeScript check
- `npm run db:push`: drizzle schema push

## Docker model

### Local compose (`docker-compose.yml`)

Services:

1. PostgreSQL
2. Redis
3. App container

### Production compose (`docker-compose.prod.yml`)

Extended services include:

1. PostgreSQL
2. Redis
3. MinIO
4. App container

## PM2 model

File: `deploy/ecosystem.config.js`

- runs built cluster entry (`dist/cluster.cjs`)
- sets process memory limits
- centralizes logs
- used with Nginx reverse proxy model

## Cluster model

File: `server/cluster.ts`

- optional process-level scaling with sticky IP hash
- worker auto-restart behavior
- intended for high concurrency and ws affinity

## Environment files in project root

- `.env`: local development
- `.env.production`: production deployment values
- `.env.example`: template

## Production safety rules

1. Never commit active credentials.
2. Rotate exposed secrets immediately.
3. Keep bootstrap/reset credentials empty after first secure setup.
4. Keep backups before destructive data operations.
5. Validate with type-check and startup checks before deployment.

## Operational scripts

Folder: `scripts/`

Includes helper scripts for:

- install/setup
- deploy
- docker run/setup
- backups
- seed and utility maintenance

## Release validation baseline

Recommended baseline before release:

1. `npx tsc --noEmit`
2. app startup validation
3. health route check
4. smoke test key endpoints
5. verify migrations/seed safety
