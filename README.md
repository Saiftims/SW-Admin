# Silent Witness Admin Dashboard (Scaffold)

This repo bootstraps a production-minded internal admin dashboard for onboarding law firms and provisioning per-tenant Clawdbot instances.

## Local dependencies

```powershell
docker compose up -d
```

## Configure env

Copy `.env.example` to `.env` and update secrets (especially `JWT_SECRET` and `ENCRYPTION_KEY_BASE64`).

## Initialize database

```powershell
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

## Run dev server

```powershell
npm run dev
```

## Dev worker (queue)

This scaffold includes a worker entrypoint, but background jobs are currently placeholder handlers.

```powershell
npm run worker:dev
```

