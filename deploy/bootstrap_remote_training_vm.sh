#!/usr/bin/env bash
set -euo pipefail

REMOTE_USER="${REMOTE_USER:-fancy}"
REPO_DIR="${REPO_DIR:-/opt/muel/ai-gods-project-remote}"
JOB_ROOT="${JOB_ROOT:-/opt/muel/ai-gods-remote-jobs}"
REPO_URL="${REPO_URL:-https://github.com/team-muel/ai-gods-project.git}"
ENV_TMP_PATH="${ENV_TMP_PATH:-/tmp/ai-gods-remote-training.env}"
PUBLIC_HOST="${PUBLIC_HOST:?PUBLIC_HOST is required}"

sudo install -d -m 0755 -o "$REMOTE_USER" -g "$REMOTE_USER" /opt/muel
sudo install -d -m 0755 -o "$REMOTE_USER" -g "$REMOTE_USER" "$JOB_ROOT"

if ! sudo test -d "$REPO_DIR/.git"; then
  sudo -u "$REMOTE_USER" git clone "$REPO_URL" "$REPO_DIR"
fi

sudo -u "$REMOTE_USER" git -C "$REPO_DIR" fetch origin main
sudo -u "$REMOTE_USER" git -C "$REPO_DIR" checkout main
sudo -u "$REMOTE_USER" git -C "$REPO_DIR" pull --ff-only origin main

sudo install -m 0600 -o "$REMOTE_USER" -g "$REMOTE_USER" "$ENV_TMP_PATH" "$REPO_DIR/.env"

if ! sudo test -d "$REPO_DIR/.venv"; then
  sudo -u "$REMOTE_USER" python3 -m venv "$REPO_DIR/.venv"
fi

sudo -u "$REMOTE_USER" bash -lc "source '$REPO_DIR/.venv/bin/activate' && python -m pip install --upgrade pip && python -m pip install -r '$REPO_DIR/requirements-data.txt' -r '$REPO_DIR/requirements-training.txt'"

sudo cp "$REPO_DIR/deploy/systemd/ai-gods-remote-training-webhook.service" /etc/systemd/system/ai-gods-remote-training-webhook.service

sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
${PUBLIC_HOST} {
  encode zstd gzip

  handle_path /ai-gods-train/* {
    reverse_proxy 127.0.0.1:8788
  }
}
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now caddy
sudo systemctl restart caddy
sudo systemctl enable --now ai-gods-remote-training-webhook
sudo systemctl restart ai-gods-remote-training-webhook

curl -fsS http://127.0.0.1:8788/healthz >/dev/null