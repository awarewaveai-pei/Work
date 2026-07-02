#!/usr/bin/env bash
set -euo pipefail

# Phase 1 installer:
# - Reads a manifest JSON file
# - Applies install_theme/install_plugin steps through wp-cli
# - Supports localZip:true steps: installs from $LOBSTER_PLUGIN_STORE/<slug>.zip
# - Executes postInstall steps: activate_theme, flush_permalinks, set_option
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

# Default plugin/theme zip store — overridden via LOBSTER_PLUGIN_STORE env var.
PLUGIN_STORE="${LOBSTER_PLUGIN_STORE:-/opt/lobster-plugins}"

# ── Install steps ──────────────────────────────────────────────────────────────
# Parse steps as "type|slug|localZip" triples (localZip=1 means use local zip file).
mapfile -t STEPS < <(node -e "
const fs=require('fs');
const m=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
for(const s of (m.steps||[])){
  if(s && s.type && s.slug){
    console.log(s.type+'|'+s.slug+'|'+(s.localZip?'1':'0'));
  }
}" "${MANIFEST_PATH}")

for item in "${STEPS[@]}"; do
  IFS='|' read -r step_type slug local_zip <<< "${item}"
  case "${step_type}" in
    install_theme)
      if [[ "${local_zip}" == "1" ]]; then
        ZIP_PATH="${PLUGIN_STORE}/${slug}.zip"
        if [[ ! -f "${ZIP_PATH}" ]]; then
          echo "ERROR: localZip=true for theme '${slug}' but zip not found at ${ZIP_PATH}"
          exit 1
        fi
        if [[ "${DRY_RUN:-0}" == "1" ]]; then
          echo "[DRY_RUN] wp theme install ${ZIP_PATH} --activate --path=\"${WP_PATH}\""
        else
          wp theme install "${ZIP_PATH}" --activate --path="${WP_PATH}"
        fi
      else
        if [[ "${DRY_RUN:-0}" == "1" ]]; then
          echo "[DRY_RUN] wp theme install ${slug} --activate --path=\"${WP_PATH}\""
        else
          wp theme install "${slug}" --activate --path="${WP_PATH}"
        fi
      fi
      ;;
    install_plugin|conditional_plugin)
      if [[ "${local_zip}" == "1" ]]; then
        ZIP_PATH="${PLUGIN_STORE}/${slug}.zip"
        if [[ ! -f "${ZIP_PATH}" ]]; then
          echo "ERROR: localZip=true for plugin '${slug}' but zip not found at ${ZIP_PATH}"
          exit 1
        fi
        if [[ "${DRY_RUN:-0}" == "1" ]]; then
          echo "[DRY_RUN] wp plugin install ${ZIP_PATH} --activate --path=\"${WP_PATH}\""
        else
          wp plugin install "${ZIP_PATH}" --activate --path="${WP_PATH}"
        fi
      else
        if [[ "${DRY_RUN:-0}" == "1" ]]; then
          echo "[DRY_RUN] wp plugin install ${slug} --activate --path=\"${WP_PATH}\""
        else
          wp plugin install "${slug}" --activate --path="${WP_PATH}"
        fi
      fi
      ;;
    *)
      echo "Skip unsupported step type: ${step_type}"
      ;;
  esac
done

# ── postInstall steps ──────────────────────────────────────────────────────────
# Supports: activate_theme | flush_permalinks | set_option
mapfile -t POST_STEPS < <(node -e "
const fs=require('fs');
const m=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
for(const s of (m.postInstall||[])){
  if(s && s.type){
    const parts=[s.type, s.slug||'', s.key||'', s.value||''];
    console.log(parts.join('|'));
  }
}" "${MANIFEST_PATH}")

for post_item in "${POST_STEPS[@]}"; do
  IFS='|' read -r post_type post_slug post_key post_value <<< "${post_item}"
  case "${post_type}" in
    activate_theme)
      if [[ -n "${post_slug}" ]]; then
        if [[ "${DRY_RUN:-0}" == "1" ]]; then
          echo "[DRY_RUN] wp theme activate ${post_slug} --path=\"${WP_PATH}\""
        else
          wp theme activate "${post_slug}" --path="${WP_PATH}"
        fi
      fi
      ;;
    flush_permalinks)
      if [[ "${DRY_RUN:-0}" == "1" ]]; then
        echo "[DRY_RUN] wp rewrite flush --hard --path=\"${WP_PATH}\""
      else
        wp rewrite flush --hard --path="${WP_PATH}"
      fi
      ;;
    set_option)
      if [[ -n "${post_key}" && -n "${post_value}" ]]; then
        if [[ "${DRY_RUN:-0}" == "1" ]]; then
          echo "[DRY_RUN] wp option update ${post_key} '${post_value}' --path=\"${WP_PATH}\""
        else
          wp option update "${post_key}" "${post_value}" --path="${WP_PATH}"
        fi
      fi
      ;;
    *)
      echo "Skip unsupported postInstall type: ${post_type}"
      ;;
  esac
done

echo "install-from-manifest complete"
