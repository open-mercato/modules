#!/usr/bin/env bash
# The nightly backup of the Strapi host (spec, Backup and restore), run in the backup job of compose.yaml:
#   docker compose -f cms/compose.yaml --profile backup run --rm backup
# A pg_dump --format=custom of the database and a tar of the uploads volume (and on Sundays the newest
# `strapi export` archive of the exports volume, which Strapi encrypted itself), in one tar encrypted with age to
# BACKUP_AGE_RECIPIENT, whose private key the owner holds. Sent to BACKUP_TARGET: a directory (`/target` in a test) or
# `user@host:dir` of the Storage Box of Q8 over ssh (port BACKUP_SSH_PORT, the key and known_hosts files the Compose
# file mounts). Keeps the 14 newest daily and the 8 newest weekly archives there.
set -euo pipefail

: "${BACKUP_TARGET:?set BACKUP_TARGET in cms/.env}"
: "${BACKUP_AGE_RECIPIENT:?set BACKUP_AGE_RECIPIENT in cms/.env}"
KEEP_DAILY=14
KEEP_WEEKLY=8
SSH_PORT="${BACKUP_SSH_PORT:-23}"
SSH_OPTS=(-p "$SSH_PORT" -i /run/backup/ssh_key -o UserKnownHostsFile=/run/backup/known_hosts -o StrictHostKeyChecking=yes -o BatchMode=yes)

stamp=$(date -u +%Y%m%dT%H%M%SZ)
kind="${BACKUP_KIND:-$([ "$(date -u +%u)" = 7 ] && echo weekly || echo daily)}"
name="strapi-$stamp-$kind.tar.age"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
umask 077

pg_dump --format=custom --file="$work/db.dump"
tar -C /uploads -cf "$work/uploads.tar" .
parts=(db.dump uploads.tar)
if [ "$kind" = weekly ]; then
  export_file=$(find /exports -maxdepth 1 -type f -name 'strapi-export-*' -printf '%T@ %f\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
  if [ -n "$export_file" ]; then
    cp "/exports/$export_file" "$work/$export_file"
    parts+=("$export_file")
  else
    echo "backup: no strapi export archive in the exports volume" >&2
  fi
fi
tar -C "$work" -cf - "${parts[@]}" | age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" > "$work/$name"

remote() { [[ "$BACKUP_TARGET" != /* ]]; }
host() { echo "${BACKUP_TARGET%%:*}"; }
dir() { echo "${BACKUP_TARGET#*:}"; }

if remote; then
  scp -P "$SSH_PORT" -i /run/backup/ssh_key -o UserKnownHostsFile=/run/backup/known_hosts -o StrictHostKeyChecking=yes -o BatchMode=yes "$work/$name" "$BACKUP_TARGET/$name"
  list() { ssh "${SSH_OPTS[@]}" "$(host)" ls -1 "$(dir)"; }
  remove() { ssh "${SSH_OPTS[@]}" "$(host)" rm "$(dir)/$1"; }
else
  cp "$work/$name" "$BACKUP_TARGET/$name"
  list() { ls -1 "$BACKUP_TARGET"; }
  remove() { rm -f "$BACKUP_TARGET/$1"; }
fi
echo "backup: $name ($(du -h "$work/$name" | cut -f1)) to $BACKUP_TARGET"

# retention: the newest KEEP_DAILY daily and KEEP_WEEKLY weekly archives (names sort by time)
for k in daily weekly; do
  keep=$([ "$k" = daily ] && echo "$KEEP_DAILY" || echo "$KEEP_WEEKLY")
  { list | grep -E "^strapi-[0-9]{8}T[0-9]{6}Z-$k\.tar\.age$" || true; } | sort | head -n "-$keep" | while read -r old; do
    remove "$old"
    echo "backup: removed $old"
  done
done
