## 1. Profile Config Files

- [x] 1.1 Create `config/profiles/` directory
- [x] 1.2 Create `config/profiles/mrs.env` with PORT=3000, DB_PORT=5432, OPENMRS_URL, NGROK_DOMAIN
- [x] 1.3 Create `config/profiles/emr.env` with PORT=3001, DB_PORT=5433, OPENEMR_URL, NGROK_DOMAIN
- [x] 1.4 Claim second static ngrok domain for EMR profile (SKIPPED: free tier only allows one domain)

## 2. Environment Setup

- [x] 2.1 Update `.env.example` to include PROFILE= with description of valid values (mrs, emr)
- [x] 2.2 Update `.env.example` to reference profile-specific config location
- [x] 2.3 Add `.gitignore` entry for `.env` if not already present (already exists)

## 3. Server Layered Env Loading

- [x] 3.1 Update server startup to check for PROFILE env var and fail fast if missing
- [x] 3.2 Load `.env` first, then `config/profiles/${PROFILE}.env`
- [x] 3.3 Print active profile on server startup for visibility

## 4. Docker Compose Updates

- [x] 4.1 Update `docker-compose.yml` to use `${PROFILE}` in container name (`elise-postgres-${PROFILE}`)
- [x] 4.2 Update `docker-compose.yml` to use `${DB_PORT}` for port mapping
- [x] 4.3 Update `docker-compose.yml` to use profile-specific volume (`elise_data_${PROFILE}`)

## 5. Ngrok Script Updates

- [x] 5.1 Update `scripts/ngrok.sh` to load profile env file
- [x] 5.2 Update `scripts/ngrok.sh` to read NGROK_DOMAIN from profile config
- [x] 5.3 Update `scripts/ngrok.sh` to read PORT from profile config

## 6. Documentation

- [x] 6.1 Add multi-office setup guide to docs (clone twice, set PROFILE, run both)
- [x] 6.2 Update README with profile system overview
