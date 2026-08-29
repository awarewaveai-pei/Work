# Neutral placeholder for brand subdomains reserved but not yet serving content.
# Shared by any vhost that has no real backend yet (docs/trust today; reused by
# whichever subdomain needs it next — no per-subdomain duplication).
# Live at: ks-aw-01 /etc/nginx/snippets/coming-soon.conf
location / {
    default_type text/html;
    add_header X-Robots-Tag "noindex" always;
    return 200 '<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Aware Wave</title></head><body style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;margin:12vh auto;text-align:center;color:#333"><h1>Aware Wave</h1><p>This page is not yet available.</p></body></html>';
}
