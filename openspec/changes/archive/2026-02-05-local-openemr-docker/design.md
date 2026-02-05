## Context

The Elise Clone project needs a reliable OpenEMR instance for EMR profile development. The public demo at demo.openemr.io has proven unreliable:
- Daily resets invalidate OAuth clients
- API access appears restricted
- Other users modify credentials
- Frequent downtime (502 errors)

OpenEMR provides official Docker images with comprehensive dev tools, including:
- `openemr/openemr:flex` - Development image with API settings via environment variables
- Built-in `devtools` scripts for reset, demo data loading, and configuration
- Support for OAuth password grant, REST API, and FHIR API

## Goals / Non-Goals

**Goals:**
- Create a standalone Docker Compose setup in `../openemr-local/`
- Pre-configure all API settings (REST, FHIR, OAuth password grant)
- Load demo data with patients, providers, and appointments
- Provide simple start/stop/reset scripts
- Update EMR profile to use local instance

**Non-Goals:**
- Production-ready configuration (this is for local development only)
- SSL certificate management (use self-signed)
- High availability or clustering
- Integration with the main ehsClone docker-compose.yml (keep separate for flexibility)

## Decisions

### 1. Use `openemr/openemr:flex` image with environment-based configuration

**Rationale:** The flex image supports `OPENEMR_SETTING_*` environment variables to pre-configure globals, eliminating the need to manually configure via admin UI.

**Alternative considered:** Production image (`openemr/openemr:7.0.4`) - rejected because it requires manual configuration after startup.

### 2. Separate directory (`../openemr-local/`) rather than subdirectory

**Rationale:** Keeps OpenEMR Docker volumes and configuration isolated from the main project. Makes it easy to `docker compose down -v` without affecting ehsClone.

**Alternative considered:** Add to ehsClone's docker-compose.yml - rejected because it would couple the projects and complicate selective startup.

### 3. Use devtools `dev-reset-install-demodata` for initial setup

**Rationale:** Official OpenEMR devtools provide tested demo data including:
- Multiple users with proper access controls
- Sample patients with medical records
- Provider schedules and appointments

**Alternative considered:** Manual SQL import - rejected because devtools handle all the complexity.

### 4. Expose on ports 8300/9300 (HTTP/HTTPS)

**Rationale:** Matches the easy-dev environment ports. Avoids conflict with standard ports 80/443 that might be in use.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Disk space (~2-3GB) | Document requirement; volumes can be removed with `docker compose down -v` |
| Port conflicts (8300, 9300, 3307) | Use non-standard ports; document in README |
| Demo data may not match production schema | Use for development/testing only; production uses real MRS |
| OpenEMR updates may break configuration | Pin to specific image version; document upgrade path |

## Key Environment Variables

```yaml
# API Configuration
OPENEMR_SETTING_rest_api: 1
OPENEMR_SETTING_rest_fhir_api: 1
OPENEMR_SETTING_rest_system_scopes_api: 1
OPENEMR_SETTING_oauth_password_grant: 3  # Both roles
OPENEMR_SETTING_site_addr_oath: 'https://localhost:9300'

# Admin credentials
OE_USER: admin
OE_PASS: pass

# MySQL
MYSQL_HOST: mysql
MYSQL_ROOT_PASS: root
```

## Demo Data Credentials

Per [OpenEMR Development Demo docs](https://www.open-emr.org/wiki/index.php/Development_Demo#Demo_Credentials):
- Admin: admin / pass
- Physician: physician / physician
- Clinician: clinician / clinician
- Front Office: frontoffice / frontoffice
