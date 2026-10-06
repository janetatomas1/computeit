#!/usr/bin/env bash
# Add a nightly entry to the current user's crontab that renews Let's Encrypt certs
# and reloads nginx. certbot only renews certs within 30 days of expiry.
# Requires passwordless sudo for this user (cron can't type a password).
# Safe to re-run: the existing entry is replaced, not duplicated.
set -euo pipefail

MARKER="# computeit-cert-renew"
JOB="17 3 * * * sudo certbot renew --quiet --deploy-hook 'systemctl reload nginx' >> \$HOME/certbot-renew.log 2>&1 $MARKER"

{ crontab -l 2>/dev/null | grep -vF "$MARKER" || true; echo "$JOB"; } | crontab -

echo "Installed crontab entry:"
crontab -l | grep -F "$MARKER"
