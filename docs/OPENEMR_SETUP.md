# OpenEMR Integration Setup

This guide covers configuring Elise to work with OpenEMR as the EHR backend.

## Environment Variables

```bash
# Required
OPENEMR_URL=https://demo.openemr.io/openemr    # Base URL for OpenEMR instance
OPENEMR_CLIENT_ID=<your-client-id>              # OAuth 2.0 client ID
OPENEMR_CLIENT_SECRET=<your-client-secret>      # OAuth 2.0 client secret
OPENEMR_USERNAME=admin                           # OpenEMR username
OPENEMR_PASSWORD=pass                            # OpenEMR password

# Optional
OPENEMR_TIMEOUT_MS=10000                         # Request timeout (default: 10000)
```

## OAuth 2.0 Client Registration

OpenEMR requires OAuth 2.0 authentication. You need to register an API client before connecting.

### Automatic Registration

You can register a client programmatically by POSTing to the registration endpoint:

```bash
curl -X POST "https://your-openemr/openemr/oauth2/default/registration" \
  -H "Content-Type: application/json" \
  -d '{
    "application_type": "private",
    "redirect_uris": ["http://localhost:3000/callback"],
    "client_name": "Elise Healthcare Assistant",
    "token_endpoint_auth_method": "client_secret_post",
    "scope": "openid api:oemr user/patient.crus user/appointment.cruds"
  }'
```

The response will include `client_id` and `client_secret` - save these for your environment variables.

### Manual Registration

1. Log into OpenEMR as an administrator
2. Navigate to **Administration > System > API Clients**
3. Create a new client with:
   - Application Type: `private`
   - Scopes: `openid api:oemr user/patient.crus user/appointment.cruds`
4. Note the generated `client_id` and `client_secret`

### Required Scopes

| Scope | Purpose |
|-------|---------|
| `openid` | Required for OAuth 2.0 |
| `api:oemr` | Access to standard OpenEMR API |
| `user/patient.crus` | Create, Read, Update, Search patients |
| `user/appointment.cruds` | Create, Read, Update, Delete, Search appointments |

## Demo Instance

OpenEMR provides a public demo instance for testing:

- **URL**: `https://demo.openemr.io/openemr`
- **Username**: `admin`
- **Password**: `pass`

### Demo Limitations

- **Resets daily** at 8:00 AM UTC - all data created is lost
- **Shared instance** - other users may modify data
- **Rate limits** may be in place (undocumented)

For persistent testing, consider running a local OpenEMR instance.

## Local Development with Docker

```bash
# Pull and run OpenEMR
docker run -p 80:80 -p 443:443 --name openemr \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_USER=openemr \
  -e MYSQL_PASS=openemr \
  -e OE_USER=admin \
  -e OE_PASS=Admin123 \
  openemr/openemr:7.0.4

# OpenEMR will be available at http://localhost/openemr
```

After starting, register an OAuth client as described above.

## Usage Example

```typescript
import { OpenEMRAdapter } from './mrs/adapters/openemr/index.js';

// Create adapter from environment
const adapter = OpenEMRAdapter.fromEnv();

// Or create with explicit config
const adapter = new OpenEMRAdapter({
  url: 'https://demo.openemr.io/openemr',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  username: 'admin',
  password: 'pass',
});

// Connect (authenticates via OAuth)
await adapter.connect();

// Search for patients
const patients = await adapter.searchPatients({ name: 'John' });

// Create an appointment
const appointment = await adapter.createAppointment({
  patientMrsId: patients[0].mrsId,
  startDateTime: new Date('2026-02-10T09:00:00'),
  endDateTime: new Date('2026-02-10T09:30:00'),
  serviceId: '5', // Appointment category ID
});

// Check health
const health = await adapter.healthCheck();
console.log(`OpenEMR healthy: ${health.healthy}, latency: ${health.latencyMs}ms`);

// Disconnect
await adapter.disconnect();
```

## Appointment Categories

OpenEMR uses appointment categories (stored in the `apptstat` list) instead of service types. Common categories:

| ID | Name | Duration |
|----|------|----------|
| 1 | Office Visit | 15 min |
| 2 | New Patient | 30 min |
| 3 | Follow-up | 15 min |

Fetch available categories with:

```typescript
const types = await adapter.getAppointmentTypes();
```

## Status Codes

OpenEMR uses single-character status codes:

| Code | Meaning | Maps To |
|------|---------|---------|
| `-` | Pending | `scheduled` |
| `@` | Arrived | `arrived` |
| `>` | In Exam Room | `in_service` |
| `<` | Checked Out | `completed` |
| `x` | Cancelled | `cancelled` |
| `?` | Did Not Show | `no_show` |
| `$` | Paid | `confirmed` |

## Troubleshooting

### Authentication Errors

1. **Invalid client**: Ensure client ID and secret are correct
2. **Token expired**: The adapter refreshes tokens automatically, but if issues persist, reconnect
3. **Scope denied**: Verify your client has the required scopes

### Connection Issues

```bash
# Test OpenEMR is reachable
curl -I https://your-openemr/openemr/apis/default/fhir/metadata

# Check OAuth discovery
curl https://your-openemr/openemr/oauth2/default/.well-known/openid-configuration
```

### API Limitations

- FHIR Appointment resources are **read-only** - use the standard API for creating appointments
- Appointment updates require delete + recreate (no direct status update endpoint)
- Patient search works best through the FHIR API (`/fhir/Patient?name=...`)
