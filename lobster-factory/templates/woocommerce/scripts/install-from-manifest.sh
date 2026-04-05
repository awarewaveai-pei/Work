#!/usr/bin/env bash
set -euo pipefail

# Phase 1 installer:
# - Reads a manifest JSON file
# - Applies install_theme/install_plugin steps through wp-cli
# - Supports DRY_RUN=1 for safe preview

MANIFEST_PATH="${1:-}"
WP_PATH="${2:-}"

if [[ -z "${MANIFEST_PATH}" || -z "${WP_PATH}" ]]; then
  echo "Usage: $0 <manifest-path> <wp-root-path>"
  exit 1
fi

if [[ ! -f "${MANIFEST_PATH}" ]]; then
  echo "Manifest not found: ${MANIFEST_PATH}"
  exit 1
fi

if [[ ! -d "${WP_PATH}" ]]; then
  echo "WordPress root not found: ${WP_PATH}"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but not found in PATH"
  exit 1
fi

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "[DRY_RUN] enabled. No changes will be applied."
  if ! command -v wp >/dev/null 2>&1; then
    echo "[DRY_RUN] wp-cli not in PATH — listing intended wp commands only (no wp execution)."
  fi
elif ! command -v wp >/dev/null 2>&1; then
  echo "wp-cli is required but not found in PATH (use DRY_RUN=1 for preview without wp)"
  exit 1
fi

TARGET="$(node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(String(m.target||''));" "${MANIFEST_PATH}")"
if [[ "${TARGET}" != "staging-only" ]]; then
  echo "Refuse to continue: manifest target must be staging-only (got '${TARGET}')"
  exit 1
fi

# Parse steps as "type|slug" pairs.
mapfile -t STEPS < <(node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));for(const s of (m.steps||[])){if(s && s.type && s.slug){console.log(s.type+'|'+s.slug)}}" "${MANIFEST_PATH}")

for item in "${STEPS[@]}"; do
  IFS='|' read -r step_type slug <<< "${item}"
  case "${step_type}" in
    install_theme)
      if [[ "${DRY_RUN:-0}" == "1" ]]; then
        echo "[DRY_RUN] wp theme install ${slug} --activate --path=\"${WP_PATH}\""
      else
        wp theme install "${slug}" --activate --path="${WP_PATH}"
      fi
      ;;
    install_plugin|conditional_plugin)
      if [[ "${DRY_RUN:-0}" == "1" ]]; then
        echo "[DRY_RUN] wp plugin install ${slug} --activate --path=\"${WP_PATH}\""
      else
        wp plugin install "${slug}" --activate --path="${WP_PATH}"
      fi
      ;;
    *)
      echo "Skip unsupported step type: ${step_type}"
      ;;
  esac
done

echo "install-from-manifest complete"
