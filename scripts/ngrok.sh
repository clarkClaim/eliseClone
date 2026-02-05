#!/bin/bash
# Start ngrok tunnel for the active profile
# Usage: ./scripts/ngrok.sh
#
# Reads from .env: PROFILE, NGROK_DOMAIN
# Reads from profile config: PORT
#
# Since free tier only allows one domain, this forwards your single domain
# to whichever port the active PROFILE uses.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Load .env to get PROFILE and NGROK_DOMAIN
if [ -f "$ROOT_DIR/.env" ]; then
  export $(grep -v '^#' "$ROOT_DIR/.env" | grep -v '^$' | xargs)
fi

# Check required vars
if [ -z "$PROFILE" ]; then
  echo "ERROR: PROFILE not set in .env"
  echo "Set PROFILE=mrs or PROFILE=emr"
  exit 1
fi

if [ -z "$NGROK_DOMAIN" ]; then
  echo "ERROR: NGROK_DOMAIN not set in .env"
  echo "Add NGROK_DOMAIN=your-domain.ngrok-free.dev"
  exit 1
fi

# Load profile config for PORT
PROFILE_ENV="$ROOT_DIR/config/profiles/${PROFILE}.env"
if [ -f "$PROFILE_ENV" ]; then
  export $(grep -v '^#' "$PROFILE_ENV" | grep -v '^$' | xargs)
else
  echo "ERROR: Profile config not found: $PROFILE_ENV"
  exit 1
fi

PORT="${PORT:-3000}"

echo "Starting ngrok tunnel..."
echo "  Profile: $PROFILE"
echo "  Domain:  https://$NGROK_DOMAIN"
echo "  Local:   http://localhost:$PORT"
echo ""
echo "Inspector: http://localhost:4040"
echo ""

ngrok http --domain "$NGROK_DOMAIN" "$PORT"
