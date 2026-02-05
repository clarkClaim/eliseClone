## Why

We need to demo Elise with multiple offices (Maple Grove → OpenMRS, Evergreen → OpenEMR), each with its own configuration and database. Rather than building complex multi-tenancy, we run separate repo clones, each configured for one MRS. Phone routing happens at VAPI level (each phone number assigned to a different webhook URL).

## What Changes

- Add `PROFILE` env var as single switch (`mrs` or `emr`)
- Create `config/profiles/` with committed MRS-specific configs (ports, URLs, ngrok domains)
- Update `docker-compose.yml` to use `${PROFILE}` and `${DB_PORT}` for isolation
- Server loads layered env files: `.env` (secrets) + `config/profiles/${PROFILE}.env`
- Update ngrok script to read domain from profile config

## Capabilities

### New Capabilities
- `instance-profiles`: Configuration system where `PROFILE` env var selects MRS-specific settings. Profile configs in `config/profiles/*.env` are committed (public info). Secrets stay in `.env` (gitignored). Server and scripts load both files.

### Modified Capabilities
- `local-development`: Docker Compose uses `${PROFILE}` for container names and volumes, `${DB_PORT}` for port mapping. Enables running multiple instances simultaneously from separate repo clones.

## Impact

- **config/profiles/mrs.env**: New file with OpenMRS config (PORT, DB_PORT, OPENMRS_URL, NGROK_DOMAIN)
- **config/profiles/emr.env**: New file with OpenEMR config
- **.env.example**: Add `PROFILE=` placeholder
- **docker-compose.yml**: Use `${PROFILE}` and `${DB_PORT}` variables
- **src/server.ts**: Load profile env file based on `PROFILE`
- **scripts/ngrok.sh**: Read domain from profile config
- **Documentation**: Setup guide for multi-office demo
