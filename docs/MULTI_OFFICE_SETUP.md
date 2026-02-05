# Multi-Office Setup Guide

Run multiple Elise instances simultaneously, each connected to a different MRS backend.

## Overview

Each office runs as a separate repo clone with its own:
- PostgreSQL database (isolated patient/appointment data)
- MRS connection (OpenMRS or OpenEMR)
- Server port (no conflicts)
- Ngrok tunnel (separate webhook URLs for VAPI)

## Quick Start

### Clone 1: Maple Grove (OpenMRS)

```bash
git clone <repo> ~/elise-mrs
cd ~/elise-mrs
cp .env.example .env

# Edit .env: add your VAPI_API_KEY, set PROFILE=mrs
pnpm install
docker compose up -d     # starts elise-postgres-mrs on port 5432
pnpm run db:migrate
pnpm run db:seed
pnpm run dev             # server on port 3000
pnpm run tunnel          # ngrok to mrs domain (separate terminal)
```

### Clone 2: Evergreen (OpenEMR)

```bash
git clone <repo> ~/elise-emr
cd ~/elise-emr
cp .env.example .env

# Edit .env: add your VAPI_API_KEY, set PROFILE=emr
pnpm install
docker compose up -d     # starts elise-postgres-emr on port 5433
pnpm run db:migrate
pnpm run db:seed
pnpm run dev             # server on port 3001
pnpm run tunnel          # ngrok to emr domain (separate terminal)
```

## Profile Configuration

Each profile is defined in `config/profiles/`:

| Profile | File | Server Port | DB Port | MRS |
|---------|------|-------------|---------|-----|
| mrs | `config/profiles/mrs.env` | 3000 | 5432 | OpenMRS |
| emr | `config/profiles/emr.env` | 3001 | 5433 | OpenEMR |

### What's in `.env` (secrets, gitignored)

```bash
PROFILE=mrs              # Which profile to use
VAPI_API_KEY=xxx         # Your VAPI credentials
VAPI_ASSISTANT_ID=xxx
```

### What's in `config/profiles/*.env` (committed)

```bash
PORT=3000                # Server port
DB_PORT=5432             # PostgreSQL port
OPENMRS_URL=https://...  # MRS API endpoint
NGROK_DOMAIN=xxx.ngrok-free.dev
```

## How It Works

```
┌─────────────┐
│   .env      │──▶ PROFILE=mrs, secrets
└─────────────┘         │
                        ▼
              ┌─────────────────────┐
              │ config/profiles/    │
              │     mrs.env         │──▶ PORT, DB_PORT, MRS URL, NGROK_DOMAIN
              └─────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
   docker-compose   pnpm run dev    pnpm run tunnel
   (postgres-mrs)   (server:3000)   (ngrok domain)
```

## Ngrok Domains

Each profile needs its own static ngrok domain:

1. Go to [ngrok dashboard](https://dashboard.ngrok.com/cloud-edge/domains)
2. Claim a static domain (free tier allows multiple)
3. Update `config/profiles/<profile>.env` with your domain

## VAPI Phone Routing

Each phone number routes to a different office:

1. Create separate VAPI assistants for each office
2. Point each assistant's webhook URL to the corresponding ngrok domain
3. Assign phone numbers to the appropriate assistant

| Phone | VAPI Assistant | Webhook URL |
|-------|----------------|-------------|
| (555) 123-4567 | Maple Grove | https://mrs-domain.ngrok-free.dev/vapi/tools |
| (555) 234-5678 | Evergreen | https://emr-domain.ngrok-free.dev/vapi/tools |

## Troubleshooting

### "PROFILE environment variable is required"

Add `PROFILE=mrs` (or `emr`) to your `.env` file.

### Database connection refused

Make sure Docker is running the right profile:
```bash
docker compose up -d
docker ps  # Should show elise-postgres-mrs or elise-postgres-emr
```

### Port already in use

Check you're not running both profiles from the same clone. Each clone should have a different PROFILE.

### Ngrok domain error

1. Verify the domain is claimed in your ngrok dashboard
2. Check `config/profiles/<profile>.env` has the correct NGROK_DOMAIN
