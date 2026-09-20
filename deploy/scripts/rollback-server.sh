#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${KARUTA_APP_ROOT:-/opt/karuta}"
SERVICE_NAME="${KARUTA_SERVICE_NAME:-karuta}"
CURRENT_LINK="$APP_ROOT/current"
PREVIOUS_LINK="$APP_ROOT/previous"

if [[ ! -L "$PREVIOUS_LINK" ]]; then
  echo "no previous release is available" >&2
  exit 1
fi

PREVIOUS_TARGET="$(readlink -f "$PREVIOUS_LINK")"
CURRENT_TARGET=""
if [[ -L "$CURRENT_LINK" ]]; then
  CURRENT_TARGET="$(readlink -f "$CURRENT_LINK")"
fi

ln -s "$PREVIOUS_TARGET" "$CURRENT_LINK.next"
mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"
if [[ -n "$CURRENT_TARGET" ]]; then
  ln -sfn "$CURRENT_TARGET" "$PREVIOUS_LINK"
fi
systemctl restart "$SERVICE_NAME"

READY_URL="${KARUTA_READY_URL:-http://127.0.0.1:8080/readyz}"
for _ in {1..30}; do
  if curl --fail --silent --max-time 2 "$READY_URL" >/dev/null; then
    echo "rolled back to $(basename "$PREVIOUS_TARGET")"
    exit 0
  fi
  sleep 1
done

echo "rollback target did not become ready" >&2
exit 1
