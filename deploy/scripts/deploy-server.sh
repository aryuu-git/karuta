#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: deploy-server.sh VERSION ARCHIVE_URL SHA256" >&2
  exit 2
fi

VERSION="$1"
ARCHIVE_URL="$2"
EXPECTED_SHA="$3"
APP_ROOT="${KARUTA_APP_ROOT:-/opt/karuta}"
DATA_ROOT="${KARUTA_DATA_ROOT:-/data/karuta}"
SERVICE_NAME="${KARUTA_SERVICE_NAME:-karuta}"
RELEASE_DIR="$APP_ROOT/releases/$VERSION"
INCOMING_DIR="$APP_ROOT/incoming"
ARCHIVE_PATH="$INCOMING_DIR/karuta-$VERSION.tar.zst"
CURRENT_LINK="$APP_ROOT/current"
PREVIOUS_LINK="$APP_ROOT/previous"
CURRENT_TARGET=""

case "$VERSION" in
  (*[!A-Za-z0-9._-]*|'') echo "invalid version" >&2; exit 2 ;;
esac
case "$EXPECTED_SHA" in
  (*[!A-Fa-f0-9]*|'') echo "invalid SHA-256" >&2; exit 2 ;;
esac
if [[ ${#EXPECTED_SHA} -ne 64 ]]; then
  echo "invalid SHA-256 length" >&2
  exit 2
fi
EXPECTED_SHA="${EXPECTED_SHA,,}"

mkdir -p "$APP_ROOT/releases" "$INCOMING_DIR" "$DATA_ROOT/backups"
if [[ -e "$RELEASE_DIR" ]]; then
  echo "release already exists: $RELEASE_DIR" >&2
  exit 1
fi

cleanup() {
  rm -f -- "$ARCHIVE_PATH" "$CURRENT_LINK.next"
}
trap cleanup EXIT

curl --fail --location --retry 3 --connect-timeout 15 \
  --output "$ARCHIVE_PATH" "$ARCHIVE_URL"
ACTUAL_SHA="$(sha256sum "$ARCHIVE_PATH" | awk '{print $1}')"
if [[ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]]; then
  echo "checksum mismatch: expected $EXPECTED_SHA got $ACTUAL_SHA" >&2
  exit 1
fi

mkdir "$RELEASE_DIR"
tar --zstd -xf "$ARCHIVE_PATH" -C "$RELEASE_DIR"
test -x "$RELEASE_DIR/karuta-server"
test -x "$RELEASE_DIR/karuta-admin"
test -f "$RELEASE_DIR/frontend/dist/index.html"

if [[ -L "$CURRENT_LINK" ]]; then
  CURRENT_TARGET="$(readlink -f "$CURRENT_LINK")"
fi

DB_PATH="${DB_PATH:-$DATA_ROOT/karuta.db}"
if [[ -f "$DB_PATH" ]]; then
  BACKUP_PATH="$DATA_ROOT/backups/karuta-$(date -u +%Y%m%dT%H%M%SZ)-$VERSION.db"
  "$RELEASE_DIR/karuta-admin" backup-db -source "$DB_PATH" -destination "$BACKUP_PATH"
fi

if [[ -n "$CURRENT_TARGET" ]]; then
  ln -sfn "$CURRENT_TARGET" "$PREVIOUS_LINK"
fi
ln -s "$RELEASE_DIR" "$CURRENT_LINK.next"
mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"

if ! systemctl restart "$SERVICE_NAME"; then
  "$APP_ROOT/scripts/rollback-server.sh"
  exit 1
fi

READY_URL="${KARUTA_READY_URL:-http://127.0.0.1:8080/readyz}"
for _ in {1..30}; do
  if curl --fail --silent --max-time 2 "$READY_URL" >/dev/null; then
    echo "deployed $VERSION"
    exit 0
  fi
  sleep 1
done

echo "readiness check failed; rolling back" >&2
"$APP_ROOT/scripts/rollback-server.sh"
exit 1
