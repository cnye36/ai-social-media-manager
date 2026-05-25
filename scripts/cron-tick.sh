#!/usr/bin/env bash
# Hit the deployed app's combined cron route from system crontab (Vercel Hobby
# only allows once-per-day built-in crons — use this on any always-on Linux host).
#
# Setup:
#   export APP_URL="https://your-app.vercel.app"
#   export CRON_SECRET="your-secret"
#   chmod +x scripts/cron-tick.sh
#
# Example crontab (crontab -e):
#   # Publish due posts/articles + Reddit scan every 15 minutes
#   */15 * * * * APP_URL=https://your-app.vercel.app CRON_SECRET=xxx /path/to/repo/scripts/cron-tick.sh
#
# Lighter schedule (hourly publish is enough for most teams; Reddit can stay 15–30m):
#   0 * * * * .../cron-tick.sh publish
#   */30 * * * * .../cron-tick.sh reddit

set -euo pipefail

APP_URL="${APP_URL:?Set APP_URL to your production URL (no trailing slash)}"
CRON_SECRET="${CRON_SECRET:?Set CRON_SECRET}"

MODE="${1:-tick}"
BASE="${APP_URL%/}"

case "$MODE" in
  tick|all)
    PATH_SUFFIX="/api/cron/tick"
    ;;
  publish)
    PATH_SUFFIX="/api/cron/publish"
    ;;
  reddit)
    PATH_SUFFIX="/api/reddit/monitor"
    ;;
  *)
    echo "Usage: $0 [tick|publish|reddit]" >&2
    exit 1
    ;;
esac

curl -fsS -m 120 \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "${BASE}${PATH_SUFFIX}" \
  -o /dev/null -w "cron ${MODE}: HTTP %{http_code}\n" \
  || echo "cron ${MODE}: failed" >&2
