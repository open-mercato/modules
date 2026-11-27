#!/usr/bin/env bash
# Writes cms/.env for a throwaway instance (cms.yml, a local test): random secrets, a local address, no tunnel. Never
# for the Strapi host, whose cms/.env holds the owner's values. Refuses to overwrite an existing file.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -e .env ]; then
  echo "cms/.env exists, not overwritten" >&2
  exit 1
fi
rand() { openssl rand -base64 24 | tr -d '\n'; }
umask 077
cat > .env <<ENV
PUBLIC_URL=http://127.0.0.1:${CMS_PORT:-1337}
APP_KEYS=$(rand),$(rand),$(rand),$(rand)
API_TOKEN_SALT=$(rand)
ADMIN_JWT_SECRET=$(rand)
TRANSFER_TOKEN_SALT=$(rand)
JWT_SECRET=$(rand)
DATABASE_NAME=strapi
DATABASE_USERNAME=strapi
DATABASE_PASSWORD=$(openssl rand -hex 16)
ENV
echo "wrote cms/.env"
