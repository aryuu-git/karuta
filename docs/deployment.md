# Versioned server deployment

This directory contains the production baseline for atomic, rollback-capable
single-server deployment. It is compatible with the existing Go binary, Vite
`dist`, SQLite database, uploads directory and optional COS configuration.

## One-time server bootstrap

Run these steps during a maintenance window because the current in-memory games
cannot survive the first service restart.

```bash
sudo useradd --system --home /opt/karuta --shell /usr/sbin/nologin karuta || true
sudo mkdir -p /opt/karuta/{releases,incoming,shared,scripts}
sudo mkdir -p /data/karuta/backups
sudo chown -R karuta:karuta /opt/karuta /data/karuta

sudo install -m 0755 deploy/scripts/deploy-server.sh /opt/karuta/scripts/deploy-server.sh
sudo install -m 0755 deploy/scripts/rollback-server.sh /opt/karuta/scripts/rollback-server.sh
sudo install -m 0644 deploy/systemd/karuta.service /etc/systemd/system/karuta.service
sudo install -m 0600 deploy/karuta.env.example /opt/karuta/shared/karuta.env
```

Edit `/opt/karuta/shared/karuta.env` and replace all production secrets and
domain values. Preserve the existing production `DB_PATH` and COS values when
migrating an existing installation; `UPLOAD_DIR` and `COS_ENABLED` are no
longer used because server-local media storage has been removed.

Create the first release from the currently deployed binary and frontend, then
point `/opt/karuta/current` at it. Verify the actual legacy frontend directory;
older installations may use either `/opt/karuta/frontend/dist` or
`/var/www/karuta/dist`. The supplied `nginx.conf` reads the frontend through
`/opt/karuta/current`, so frontend and backend switch and roll back together.

```bash
sudo mkdir -p /opt/karuta/releases/initial/frontend
sudo cp /opt/karuta/karuta-server /opt/karuta/releases/initial/karuta-server
sudo cp -a /var/www/karuta/dist /opt/karuta/releases/initial/frontend/dist
sudo ln -s /opt/karuta/releases/initial /opt/karuta/current
sudo install -m 0644 nginx.conf /etc/nginx/sites-available/karuta
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl daemon-reload
sudo systemctl enable --now karuta
curl --fail http://127.0.0.1:8080/readyz
```

The release workflow produces `karuta-<commit>.tar.zst` and its SHA-256 file.
Upload the artifact to a private, server-near URL (same-region COS is preferred
for the weak-network host), then run:

```bash
sudo /opt/karuta/scripts/deploy-server.sh VERSION SIGNED_ARCHIVE_URL SHA256
```

The script downloads into `incoming`, verifies the digest, creates a new release
directory, creates a consistent SQLite backup, atomically switches `current`,
restarts systemd and checks `/readyz`. A failed restart or readiness check invokes
the rollback script automatically.

Manual rollback:

```bash
sudo /opt/karuta/scripts/rollback-server.sh
```

## Observability endpoints

The server exposes three operational endpoints that require no authentication
(they sit at the same level as health checks for the service manager and reverse
proxy):

- `GET /healthz` — liveness only.
- `GET /readyz` — readiness: DB ping **and** schema version must equal the
  binary's expected version (a stale binary against a migrated database refuses
  traffic instead of corrupting data).
- `GET /version` — release version / commit / build time.
- `GET /metrics` — minimal JSON counters for human inspection and log scraping:
  rooms by status, WS connections, media assets/bytes, process uptime /
  goroutines / heap. Deliberately no Prometheus exposition at this scale.

```bash
curl --fail http://127.0.0.1:8080/readyz
curl -s http://127.0.0.1:8080/metrics | jq
```

## Maintenance CLI (karuta-admin)

Operational recovery commands, run directly on the server against the SQLite
file. All mutating commands write to `admin_audit_logs` where applicable.

```bash
karuta-admin backup-db -source /opt/karuta/current/data/karuta.db -destination /data/karuta/backups/karuta-$(date +%F).db
karuta-admin set-admin -database PATH -username NAME [-enabled=false]   # grant/revoke admin (audit-logged)
karuta-admin reset-password -database PATH -username NAME -password NEW # forgot-password recovery (guests refused, audit-logged)
karuta-admin media gc -database PATH [-dry-run=false] [-yes]            # physically delete unreferenced COS objects
```

## Database compatibility rule

Automatic application rollback is safe only while the previous release remains
compatible with the current schema. Use additive/expand-contract migrations.
Take a maintenance window and restore the database backup for destructive schema
changes; never attempt to automatically reverse them during a failed deploy.

Note that `DB_PATH` resolves **relative to the process working directory**. The
systemd unit must (and does) run from the release root so `./data/karuta.db`
lands in `/opt/karuta/current/data/`; for ad-hoc local runs from `backend/`,
pass `DB_PATH=../data/karuta.db` explicitly.
