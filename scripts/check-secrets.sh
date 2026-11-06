#!/usr/bin/env bash
set -euo pipefail

# EasyPrint Credential & Default Secrets Scanner
# Fails with exit code 1 if any known default passwords appear in source or docs.

FORBIDDEN_PATTERNS=(
  "Owner@123"
  "Admin@EasyPrint2026!"
  "Admin@123456"
)

FOUND=0

echo "[Secrets Check] Scanning repository for forbidden default credential patterns..."

for PATTERN in "${FORBIDDEN_PATTERNS[@]}"; do
  # Search using git grep if in a git repo, otherwise standard grep
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    MATCHES=$(git grep -n -I --untracked -E "$PATTERN" -- ':!scripts/check-secrets.*' ':!.env' || true)
  else
    MATCHES=$(grep -rn -I --exclude-dir={.git,node_modules,dist,bin,obj,publish,.data,.redis} --exclude="check-secrets.*" --exclude=".env" -E "$PATTERN" . || true)
  fi

  if [ -n "$MATCHES" ]; then
    echo "[ERROR] Forbidden pattern '$PATTERN' found in tracked files:"
    echo "$MATCHES"
    FOUND=1
  fi
done

if [ "$FOUND" -ne 0 ]; then
  echo ""
  echo "=========================================================================="
  echo " [SECURITY VIOLATION] Known default credentials found in repository!"
  echo " Replace them with environment variable placeholders (e.g. <OWNER_SEED_PASSWORD>)"
  echo " before committing."
  echo "=========================================================================="
  exit 1
fi

echo "[OK] No default secrets detected across repository."
exit 0
