## 1. Create Directory Structure

- [x] 1.1 Create `../openemr-local/` directory (sibling to ehsClone)
- [x] 1.2 Create `docker-compose.yml` with OpenEMR and MariaDB services

## 2. Configure OpenEMR Docker

- [x] 2.1 Use `openemr/openemr:flex` image with API environment variables
- [x] 2.2 Configure ports: 8300 (HTTP), 9300 (HTTPS), 3307 (MySQL)
- [x] 2.3 Set admin credentials via `OE_USER` and `OE_PASS`
- [x] 2.4 Enable REST API via `OPENEMR_SETTING_rest_api: 1`
- [x] 2.5 Enable FHIR API via `OPENEMR_SETTING_rest_fhir_api: 1`
- [x] 2.6 Enable OAuth password grant via `OPENEMR_SETTING_oauth_password_grant: 3`
- [x] 2.7 Enable system scopes via `OPENEMR_SETTING_rest_system_scopes_api: 1`

## 3. Create Helper Scripts

- [x] 3.1 Create `start.sh` to run `docker compose up -d`
- [x] 3.2 Create `stop.sh` to run `docker compose down`
- [x] 3.3 Create `reset.sh` to run `docker compose down -v` and reload with demo data
- [x] 3.4 Create `load-demo-data.sh` to run devtools `dev-reset-install-demodata`

## 4. Documentation

- [x] 4.1 Create README.md with quick start instructions
- [x] 4.2 Document API endpoints and base URLs
- [x] 4.3 Document demo user credentials
- [x] 4.4 Document OAuth client registration process

## 5. Update EMR Profile

- [x] 5.1 Update `config/profiles/emr.env` to use `https://localhost:9300` as default
- [x] 5.2 Add comment explaining local OpenEMR setup requirement
- [x] 5.3 Update CLAUDE.md with local OpenEMR instructions

## 6. Verification

- [x] 6.1 Test `docker compose up` starts OpenEMR successfully
- [x] 6.2 Test admin login at https://localhost:9300
- [x] 6.3 Test OAuth client registration
- [x] 6.4 Test OAuth password grant token request
- [x] 6.5 Test REST API endpoint with token
- [x] 6.6 Test FHIR API endpoint with token
- [x] 6.7 Test demo data is present (patients, providers)
