#!/usr/bin/env bash
# Restores an archive of backup.sh into the database and the uploads volume of a Compose project whose Strapi is
# stopped (spec, Backup and restore): a fresh project for the restore drill or the move, or the same one after a loss.
#   docker compose -p <project> -f cms/compose.yaml up --detach --wait postgres
#   docker compose -p <project> -f cms/compose.yaml --profile restore run --rm \
#     -v /path/of/the/archives:/target:ro -v /path/of/the/age/key:/run/backup/age_identity:ro restore /target/<archive>
# BACKUP_AGE_IDENTITY names the private age key (default /run/backup/age_identity); it stays with the owner and is
# mounted only for the restore. The database is replaced (pg_restore --clean); the uploads volume is emptied first.
set -euo pipefail

archive="${1:?usage: restore.sh <archive .tar.age>}"
identity="${BACKUP_AGE_IDENTITY:-/run/backup/age_identity}"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
umask 077

age --decrypt --identity "$identity" "$archive" | tar -C "$work" -xf -
pg_restore --clean --if-exists --no-owner --exit-on-error --dbname="$PGDATABASE" "$work/db.dump"
find /uploads -mindepth 1 -delete
tar -C /uploads -xf "$work/uploads.tar"
echo "restore: $(basename "$archive") into database $PGDATABASE and the uploads volume"
ls "$work" | grep '^strapi-export-' | sed 's/^/restore: the archive also holds /' || true
