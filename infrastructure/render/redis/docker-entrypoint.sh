#!/bin/sh
set -eu

: "${REDIS_PASSWORD:?REDIS_PASSWORD is required}"

exec redis-server \
  --requirepass "$REDIS_PASSWORD" \
  --appendonly yes \
  --appendfsync everysec \
  --maxmemory-policy noeviction
