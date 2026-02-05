## Context

The Elise scheduling assistant needs an OpenMRS instance with the appointment scheduling module to demo the full patient scheduling flow. The public O3 demo lacks this module. We need a self-hosted instance that:

- Runs OpenMRS 3 with appointment scheduling module
- Is publicly accessible via a stable URL
- Can be deployed/destroyed easily (ephemeral data is fine)
- Costs minimal $/day for a few-day demo period

## Goals / Non-Goals

**Goals:**
- Deployable OpenMRS 3 instance with appointment scheduling module
- Public URL accessible from anywhere (for Elise app + manual demo)
- One-command deployment via Railway
- OpenMRS web UI available for visual demos
- REST API available for Elise integration

**Non-Goals:**
- Data persistence across deployments (ephemeral is fine)
- Production-grade security hardening
- Custom theming or branding
- High availability or scaling

## Decisions

### 1. Base Image: OpenMRS 3 Reference Application

**Decision**: Use the official `openmrs/openmrs-reference-application-3-*` images as base.

**Rationale**: These are the same images powering `o3.openmrs.org`. Well-tested, regularly updated, and include all the O3 frontend/backend infrastructure.

**Alternatives considered**:
- Bahmni distribution: Includes appointments but is heavier and has different API paths
- Building from source: Too much effort for a demo

### 2. Module Installation: Bake into Dockerfile

**Decision**: Create a custom Dockerfile that extends the backend image and copies `.omod` files into `/openmrs/modules/`.

```dockerfile
FROM openmrs/openmrs-reference-application-3-backend:${TAG}
COPY modules/*.omod /openmrs/modules/
```

**Rationale**: Modules are installed on startup. Baking them in means no manual upload step after deployment.

**Alternatives considered**:
- Upload via admin UI post-deploy: Extra manual step, would need to document
- Mount volume with modules: More complex for Railway deployment

### 3. Deployment Platform: Railway

**Decision**: Deploy all four services (gateway, frontend, backend, db) to Railway.

**Rationale**:
- Native docker-compose support
- Persistent URLs (`*.up.railway.app`)
- Simple CLI deployment (`railway up`)
- Handles inter-service networking automatically
- ~$5-10/mo, prorated

**Alternatives considered**:
- Fly.io: Awkward for multi-container apps, would need 4 separate apps
- AWS Lightsail VM: Simple but requires SSH/manual docker-compose management
- Render: Similar to Railway, either would work

### 4. Repository Location: Sibling Directory

**Decision**: Create at `~/projects/elise/openmrs-demo`, separate from `elise-clone`.

**Rationale**:
- Clean separation (OpenMRS config vs Elise app)
- Railway deploys cleanest from repo root
- Different lifecycles (set-and-forget vs active development)

### 5. Module Versions

**Decision**: Use latest stable versions compatible with O3:
- `appointmentscheduling` module: Latest from OpenMRS Addons
- `appointmentschedulingui` module: Latest from OpenMRS Addons

**Note**: Will need to verify exact version compatibility with O3 backend version.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Module version incompatibility with O3 | Test locally with docker-compose before Railway deploy |
| Railway free tier limits | Use hobby tier ($5/mo), sufficient for demo |
| OpenMRS slow startup (~2-3 min) | Document expected wait time; Railway keeps containers warm |
| No data persistence | Acceptable for demo; can seed test data on startup if needed |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Railway Deployment                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  *.up.railway.app:443                                           │
│          │                                                      │
│          ▼                                                      │
│    ┌──────────┐                                                 │
│    │ Gateway  │  nginx reverse proxy                            │
│    │  :80     │                                                 │
│    └────┬─────┘                                                 │
│         │                                                       │
│    ┌────┴────┐                                                  │
│    ▼         ▼                                                  │
│ ┌──────┐  ┌─────────┐                                          │
│ │Front │  │ Backend │  Custom image with appointment modules   │
│ │ end  │  │         │                                          │
│ └──────┘  └────┬────┘                                          │
│                │                                                │
│                ▼                                                │
│          ┌──────────┐                                           │
│          │ MariaDB  │                                           │
│          └──────────┘                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Open Questions

- [ ] Exact `.omod` versions compatible with current O3 release tag
- [ ] Whether Railway requires any special networking config for inter-service communication
- [ ] Default admin credentials for the deployed instance (likely admin/Admin123)
