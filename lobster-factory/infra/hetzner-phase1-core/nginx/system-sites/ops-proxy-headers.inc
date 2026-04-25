# Ops control-plane hardening headers
# Install path (system nginx): /etc/nginx/snippets/ops-proxy-headers.inc
#
# Required:
# 1) Replace __OPS_PROXY_SHARED_SECRET__ with the same value as app env OPS_PROXY_SHARED_SECRET.
# 2) Set x-ops-claims-role from a trusted auth source only (SSO/auth_request/Lua/etc.).
#    Keep it empty if not available. In claims_only mode, writes will be rejected.

# Prevent inbound spoofed values from clients.
proxy_set_header x-ops-proxy-auth "";
proxy_set_header x-ops-claims-role "";
proxy_set_header x-user-role "";
proxy_set_header x-clerk-role "";

# Trusted-proxy marker for next-admin middleware.
proxy_set_header x-ops-proxy-auth "__OPS_PROXY_SHARED_SECRET__";

# Optional claim role from trusted auth layer (example placeholder).
# proxy_set_header x-ops-claims-role $ops_claims_role;
