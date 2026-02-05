## Context

Currently, Elise runs as a single server instance configured for OpenMRS. To demo multiple offices with different MRS backends (Maple Grove → OpenMRS, Evergreen → OpenEMR), we run separate clones of the repo, each configured for one MRS.

Each clone needs:
- Its own database (patient/appointment data is office-specific)
- Its own MRS adapter configuration
- Its own public URL for VAPI webhooks
- Its own port to avoid conflicts when running simultaneously

## Goals / Non-Goals

**Goals:**
- Run 2+ Elise instances simultaneously via separate repo clones
- Zero config overlap between instances (databases, ports, volumes)
- Simple setup: clone, copy `.env`, set `PROFILE=mrs`, done
- MRS-specific configs committed to git (public info)
- Secrets stay in `.env` (gitignored)

**Non-Goals:**
- Multi-tenancy within a single server instance
- Profile switching within a single clone
- Production deployment architecture (this is for local dev/demo)

## Design

### File Structure

```
elise/
├── .env.example          # Template with PROFILE= placeholder
├── .env                  # Gitignored. Secrets + PROFILE=mrs
│
├── config/
│   └── profiles/
│       ├── mrs.env       # Committed. PORT=3000, DB_PORT=5432, OPENMRS_URL=..., NGROK_DOMAIN=...
│       └── emr.env       # Committed. PORT=3001, DB_PORT=5433, OPENEMR_URL=..., NGROK_DOMAIN=...
│
└── docker-compose.yml    # Uses env vars: ${PROFILE}, ${DB_PORT}
```

### The One Config Change

After cloning, the only change needed is setting `PROFILE` in `.env`:

```bash
# .env
VAPI_API_KEY=your-secret
PROFILE=mrs              # ← This is the switch
```

### How It Works

```
┌─────────────┐
│   .env      │──▶ PROFILE=mrs, secrets
└─────────────┘         │
                        ▼
              ┌─────────────────────┐
              │ config/profiles/    │
              │     mrs.env         │──▶ PORT=3000, DB_PORT=5432, OPENMRS_URL=...
              └─────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
   docker-compose   pnpm run dev    pnpm run tunnel
   (postgres-mrs    (server on      (ngrok to
    on 5432)         3000)           mrs domain)
```

### Port Allocation

| Profile | Server Port | Postgres Port | Ngrok Domain |
|---------|-------------|---------------|--------------|
| mrs     | 3000        | 5432          | (existing static domain) |
| emr     | 3001        | 5433          | (second static domain) |

## Decisions

### 1. PROFILE env var as the single switch

**Decision**: One env var (`PROFILE=mrs` or `PROFILE=emr`) controls everything.

**Rationale**: Minimal configuration. Set once after clone, never think about it again. All scripts read this and do the right thing.

### 2. Layered env files (secrets + profile config)

**Decision**: Split into `.env` (secrets, gitignored) and `config/profiles/*.env` (MRS config, committed).

**Rationale**:
- Profile configs are safe to commit (public MRS URLs, ports)
- Secrets stay private
- Easy to see what differs between profiles (diff the files)
- New developer: clone, copy `.env`, set PROFILE, done

### 3. Docker Compose with env var substitution

**Decision**: Single `docker-compose.yml` using `${PROFILE}` and `${DB_PORT}` variables.

```yaml
services:
  postgres:
    container_name: elise-postgres-${PROFILE}
    ports:
      - "${DB_PORT}:5432"
    volumes:
      - elise_data_${PROFILE}:/var/lib/postgresql/data
```

**Rationale**: Native Docker feature. No wrapper scripts needed. Container names include profile, so both can run simultaneously without conflict.

### 4. Server loads both env files

**Decision**: Server startup loads `.env` first, then `config/profiles/${PROFILE}.env`.

**Rationale**: Simple two-file load. dotenv supports this natively. Profile config overrides/extends base secrets.

### 5. Separate repo clones per office

**Decision**: Each office instance is a separate git clone.

**Rationale**:
- Complete isolation (can even be on different branches)
- No risk of cross-contamination
- Familiar mental model (`cd elise-mrs` vs `cd elise-emr`)
- Both can run simultaneously in different terminals

## Usage

**Clone 1 (Maple Grove → OpenMRS):**
```bash
git clone <repo> ~/elise-mrs
cd ~/elise-mrs
cp .env.example .env
# Edit .env: add secrets, set PROFILE=mrs
docker compose up -d     # starts elise-postgres-mrs on 5432
pnpm run dev             # server on 3000
pnpm run tunnel          # ngrok to mrs domain
```

**Clone 2 (Evergreen → OpenEMR):**
```bash
git clone <repo> ~/elise-emr
cd ~/elise-emr
cp .env.example .env
# Edit .env: add secrets, set PROFILE=emr
docker compose up -d     # starts elise-postgres-emr on 5433
pnpm run dev             # server on 3001
pnpm run tunnel          # ngrok to emr domain
```

## Risks / Trade-offs

**[Trade-off] Two repo clones = more disk space** → Acceptable for dev/demo. Code changes need to be pulled in both.

**[Risk] Developer sets wrong PROFILE for their clone** → Mitigation: Server prints profile on startup. Docker container name makes it obvious.

**[Risk] Second static ngrok domain needed** → Mitigation: Free tier allows up to 3 endpoints. May need to claim second static domain.
