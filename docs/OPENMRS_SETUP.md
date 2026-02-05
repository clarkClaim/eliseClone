# OpenMRS Configuration

Environment variables for OpenMRS integration.

## Connection Settings (Required)

```bash
OPENMRS_URL=http://localhost/openmrs    # Base URL for OpenMRS instance
OPENMRS_USER=admin                       # OpenMRS username
OPENMRS_PASSWORD=Admin123                # OpenMRS password
```

## Patient Creation Settings (Optional)

These have **O3 demo defaults built-in**. Only override for non-demo instances.

```bash
# Override only if needed - defaults work with o3.openmrs.org
OPENMRS_IDENTIFIER_TYPE_UUID=<uuid>     # Default: OpenMRS ID
OPENMRS_IDENTIFIER_LOCATION_UUID=<uuid> # Default: Outpatient Clinic
OPENMRS_PHONE_ATTR_UUID=<uuid>          # Default: Telephone Number
```

See `config/openmrs-o3-demo.json` for the default UUIDs and available locations.

## Finding UUIDs (for non-demo instances)

### Via REST API

```bash
# Identifier types
curl -u admin:password "http://your-openmrs/ws/rest/v1/patientidentifiertype?v=default"

# Locations
curl -u admin:password "http://your-openmrs/ws/rest/v1/location?v=default"

# Person attribute types (for phone)
curl -u admin:password "http://your-openmrs/ws/rest/v1/personattributetype?v=default"
```

### Via Admin UI

1. **Identifier Type**: Administration > Patient Identifier Types
2. **Location**: Administration > Locations
3. **Phone Attribute**: Administration > Person Attribute Types

## Identifier Format

Patients created by Elise get identifiers in the format:
```
ELISE-{YYYYMMDD}-{XXXX}
```

Example: `ELISE-20260205-A7B3`

## Multi-Location (Future)

Currently supports single-location deployment. Multi-location config (different settings per inbound phone number) is planned - see `config/openmrs-o3-demo.json` for location data.
