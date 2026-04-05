#!/usr/bin/env bash
set -euo pipefail

# Phase 1 minimal rollback (C2-3 baseline):
# - Replays manifest steps in reverse order.
# - Plugins: wp plugin deactivate <slug> (optional --uninstall when ROLLBACK_DEEP=1).
# - Themes: print manual guidance only (switching default theme is site-specific).
#
# DRY_RUN=1: print commands only.

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

if ! command -v wp >/dev/null 2>&1; then
  echo "wp-cli is required but not found in PATH"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but not found in PATH"
  exit 1
fi

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "[DRY_RUN] rollback preview. No changes will be applied."
fi

TARGET="$(node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(String(m.target||''));" "${MANIFEST_PATH}")"
if [[ "${TARGET}" != "staging-only" ]]; then
  echo "Refuse to continue: manifest target must be staging-only (got '${TARGET}')"
  exit 1
fi

# Steps in reverse order: lines are still type|slug forward; we reverse in node.
mapfile -t STEPS_REV < <(node -e "
const fs=require('fs');
const m=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
const steps=(m.steps||[]).filter(s=>s&&s.type&&s.slug);
for(let i=steps.length-1;i>=0;i--){
  const s=steps[i];
  console.log(s.type+'|'+s.slug);
}
" "${MANIFEST_PATH}")

for item in "${STEPS_REV[@]}"; do
  IFS='|' read -r step_type slug <<< "${item}"
  case "${step_type}" in
    install_plugin|conditional_plugin)
      if [[ "${DRY_RUN:-0}" == "1" ]]; then
        echo "[DRY_RUN] wp plugin deactivate ${slug} --path=\"${WP_PATH}\""
        if [[ "${ROLLBACK_DEEP:-0}" == "1" ]]; then
          echo "[DRY_RUN] wp plugin uninstall ${slug} --deactivate --path=\"${WP_PATH}\""
        fi
      else
        wp plugin deactivate "${slug}" --path="${WP_PATH}" || true
        if [[ "${ROLLBACK_DEEP:-0}" == "1" ]]; then
          wp plugin uninstall "${slug}" --deactivate --path="${WP_PATH}" || true
        fi
      fi
      ;;
    install_theme)
      if [[ "${DRY_RUN:-0}" == "1" ]]; then
        echo "[DRY_RUN] Theme '${slug}' was activated by manifest; restore previous theme manually or from hosting snapshot."
      else
        echo "[WARN] Skipping automatic theme rollback for '${slug}'. Use snapshot or: wp theme list --path=\"${WP_PATH}\""
      fi
      ;;
    *)
      echo "Skip unsupported step type for rollback: ${step_type}"
      ;;
  esac
done

echo "rollback-from-manifest complete"
