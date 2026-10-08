"""Tenant/Workspace/Identity store on PostgreSQL (docs/platform/STORAGE_SWITCH.md W3) + password auth + session tokens.

Phase 1 (self-use) scope -- see ``Projects/internal/cognitive-engineering-os/docs/
COGNITIVE_OS_DEPLOYMENT_BLUEPRINT.md``. Real persistence (not an in-memory mock), real
password hashing (PBKDF2-HMAC-SHA256, stdlib only -- no new crypto dependency), real
server-side session tokens (opaque, ``secrets.token_urlsafe``, never a self-rolled JWT).

Design decisions disclosed here rather than left implicit:

1. **Credential material never touches the domain record.** ``identity_record()``
   (``ai_lego/core/domain/identity.py``) is the FACT shape; the password hash lives in its own
   ``identity_credential`` table, joined only inside this module -- an Identity dict returned to
   a caller can never accidentally carry a hash.
2. **Sessions are server-side, not stateless JWT.** A session row can be revoked instantly
   (delete the row) -- a self-issued JWT cannot be revoked before its own expiry without a
   separate denylist, which is just a session table by another name. Simpler to have one real
   table.
3. **PBKDF2 iteration count (600_000)** matches OWASP's 2023+ PBKDF2-HMAC-SHA256 guidance --
   this is deliberately expensive per hash (~100ms), which is the point (slows offline
   brute-force), not a performance bug.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
from typing import Any, Callable

import psycopg

from ai_lego.core.domain.identity import identity_record
from ai_lego.core.domain.workspace import workspace_record
from ai_lego.data import db
from ai_lego.data.db import Databases
from ai_lego.errors import InvariantViolation

PBKDF2_ITERATIONS = 600_000
SESSION_TTL = timedelta(hours=12)
PASSWORD_RESET_TTL = timedelta(hours=1)
# Deliberately short (agency-os AGENTS.md R0 "minimum blast radius"): a handoff code exists only to
# survive one server-to-server mint call immediately followed by one browser redirect (sub-second in
# practice). 60s leaves headroom for a slow network hop without giving a leaked code (referrer header,
# proxy log, browser history) a meaningfully usable window -- unlike PASSWORD_RESET_TTL, which must
# survive a human reading an email.
HANDOFF_CODE_TTL = timedelta(seconds=60)
# The identity every collected Source is written as, one per tenant (bootstrap_service_identity --tenant-id).
COLLECTOR_EMAIL = "research-collector@cognitive-os.local"
# Fixed (not secret, not per-identity) salt used ONLY to give the "no such identity"/"no such
# credential row" authenticate() failure paths a real PBKDF2 hash of equal cost to the genuine
# "wrong password" path -- closes the timing side-channel a critic pass found 2026-09-12 (see
# authenticate()'s own docstring). Never used to hash or verify a real stored credential.
_DUMMY_SALT = hashlib.sha256(b"cognitive-os-phase1-timing-equalization-dummy-salt-not-secret").digest()[:16]


def _now_iso() -> str:
    return db.iso(db.now())


def _hash_password(password: str, salt: bytes, iterations: int = PBKDF2_ITERATIONS) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)


def _instant(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


class IdentityStore:
    """Tenants, workspaces, identities, credentials, sessions and the one-shot codes and grants, each tenant's rows in its
    own region (tenant.data_residency_region); the tenant directory maps tenant -> region (``Databases.for_tenant``).
    Phase 1 is single-tenant, but the schema itself does not assume that (matches specs/domain/workspace.schema.yaml's
    own N-per-tenant design)."""

    def __init__(self, databases: Databases):
        self._db = databases

    def _each_region(self) -> tuple[str, ...]:
        """A credential that names no tenant (a session token, a handoff code, a reset token, a grant reference or token,
        an identity id) is looked up region by region: the random value, or its hash, is in at most one."""
        return self._db.regions()

    # -- Tenant -----------------------------------------------------------------

    def create_tenant(
        self,
        tenant_id: str,
        legal_name: str,
        home_jurisdiction: str,
        data_residency_region: str,
        encryption_root_key_ref: str,
    ) -> dict[str, Any]:
        """Publish the directory last, so a failed create never routes to a missing tenant. Two regions cannot commit
        atomically: if the directory commit fails after the home commit, retrying the same request adopts the matching
        home row instead of stranding it. A conflicting orphan is refused. No second region is live before D7."""
        region = self._db.require_region(data_residency_region)
        record = {
            "tenant_id": tenant_id,
            "legal_name": legal_name,
            "status": "active",
            "home_jurisdiction": home_jurisdiction,
            "data_residency_region": region,
            "encryption_root_key_ref": encryption_root_key_ref,
            "created_at": _now_iso(),
            "deleted_at": None,
        }
        insert = (
            "INSERT INTO tenant (tenant_id, legal_name, status, home_jurisdiction, data_residency_region, encryption_root_key_ref, created_at, deleted_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
            (record["tenant_id"], record["legal_name"], record["status"], record["home_jurisdiction"], record["data_residency_region"], record["encryption_root_key_ref"], record["created_at"], record["deleted_at"]),
        )
        with self._db.transaction(self._db.directory_region) as directory:
            self._db.add_to_directory(directory, tenant_id, region)
            if region == self._db.directory_region:
                directory.execute(*insert)
            else:
                with self._db.transaction(region) as home:
                    created = home.execute(insert[0] + " ON CONFLICT (tenant_id) DO NOTHING RETURNING tenant_id", insert[1]).fetchone()
                    if created is None:
                        existing = home.execute("SELECT * FROM tenant WHERE tenant_id = %s", (tenant_id,)).fetchone()
                        if existing is None or any(existing[key] != record[key] for key in record if key != "created_at"):
                            raise InvariantViolation(f"TENANT_CREATE_ORPHAN_CONFLICT: tenant {tenant_id!r} already exists with different values")
                        record["created_at"] = existing["created_at"]
        return record

    def get_tenant(self, tenant_id: str) -> dict[str, Any] | None:
        if self._db.region_of(tenant_id) is None:
            return None
        with self._db.for_tenant(tenant_id) as conn:
            row = conn.execute("SELECT * FROM tenant WHERE tenant_id = %s", (tenant_id,)).fetchone()
        return dict(row) if row else None

    # -- Workspace ----------------------------------------------------------------

    def create_workspace(self, workspace_id: str, tenant_id: str, name: str) -> dict[str, Any]:
        if self.get_tenant(tenant_id) is None:
            raise InvariantViolation(f"WORKSPACE_DANGLING_TENANT_REF: tenant_id {tenant_id!r} does not resolve to a declared tenant")
        record = workspace_record(workspace_id, tenant_id, name, "active", _now_iso())
        with self._db.for_tenant(tenant_id) as conn:
            conn.execute(
                "INSERT INTO workspace (workspace_id, tenant_id, name, status, created_at) VALUES (%s,%s,%s,%s,%s)",
                (record["workspace_id"], record["tenant_id"], record["name"], record["status"], record["created_at"]),
            )
        return record

    def list_workspaces(self, tenant_id: str) -> list[dict[str, Any]]:
        # Two workspaces made close together can share a created_at (a clock ticks coarser than the inserts on some hosts);
        # write_order (migration 0003, what SQLite's rowid was here) is the true insertion order, unlike the random
        # workspace_id. It stays out of the returned record.
        if self._db.region_of(tenant_id) is None:
            return []   # a tenant the directory does not hold has no workspaces (not an error)
        with self._db.for_tenant(tenant_id) as conn:
            rows = conn.execute("SELECT workspace_id, tenant_id, name, status, created_at FROM workspace WHERE tenant_id = %s ORDER BY created_at, write_order", (tenant_id,)).fetchall()
        return [dict(row) for row in rows]

    def get_workspace(self, tenant_id: str, workspace_id: str) -> dict[str, Any] | None:
        if self._db.region_of(tenant_id) is None:
            return None
        with self._db.for_tenant(tenant_id) as conn:
            row = conn.execute("SELECT workspace_id, tenant_id, name, status, created_at FROM workspace WHERE tenant_id = %s AND workspace_id = %s", (tenant_id, workspace_id)).fetchone()
        return dict(row) if row else None

    # -- Identity + credentials -----------------------------------------------------

    def create_identity(self, identity_id: str, tenant_id: str, email: str, display_name: str, password: str) -> dict[str, Any]:
        if self.get_tenant(tenant_id) is None:
            raise InvariantViolation(f"IDENTITY_DANGLING_TENANT_REF: tenant_id {tenant_id!r} does not resolve to a declared tenant")
        if len(password) < 12:
            raise InvariantViolation(f"IDENTITY_WEAK_PASSWORD: password must be at least 12 characters, got {len(password)}")
        record = identity_record(identity_id, tenant_id, email, display_name, "active", _now_iso())
        salt = secrets.token_bytes(16)
        password_hash = _hash_password(password, salt)
        with self._db.for_tenant(tenant_id) as conn:
            conn.execute(
                "INSERT INTO identity (identity_id, tenant_id, email, display_name, status, created_at) VALUES (%s,%s,%s,%s,%s,%s)",
                (record["identity_id"], record["tenant_id"], record["email"], record["display_name"], record["status"], record["created_at"]),
            )
            conn.execute(
                "INSERT INTO identity_credential (identity_id, password_hash, password_salt, iterations) VALUES (%s,%s,%s,%s)",
                (record["identity_id"], password_hash, salt, PBKDF2_ITERATIONS),
            )
        return record

    def get_identity(self, identity_id: str) -> dict[str, Any] | None:
        for region in self._each_region():
            with self._db.transaction(region) as conn:
                row = conn.execute("SELECT identity_id, tenant_id, email, display_name, status, created_at FROM identity WHERE identity_id = %s", (identity_id,)).fetchone()
            if row is not None:
                return dict(row)
        return None

    def delete_identity(self, tenant_id: str, identity_id: str) -> bool:
        """GOVERN 刪除帳號, the identity's part (the caller erased the person's cases and records first). One transaction:
        every session, reset token, handoff code and the credential go; the row stays as the one tombstone, status
        'deleted', with no email and no name (the address is free to register again); the AI-usage rows stay for the
        tenant's budget but no longer name the person. False: no such live identity in this tenant."""
        if self._db.region_of(tenant_id) is None:
            return False
        with self._db.for_tenant(tenant_id) as conn:
            return self.delete_identity_on(conn, tenant_id, identity_id)

    @staticmethod
    def delete_identity_on(conn: psycopg.Connection, tenant_id: str, identity_id: str) -> bool:
        """``delete_identity`` on a transaction the caller opened (the account erasure's decision: ai_lego/platform/erasure.py)."""
        row = conn.execute("SELECT status FROM identity WHERE identity_id = %s AND tenant_id = %s", (identity_id, tenant_id)).fetchone()
        if row is None or row["status"] == "deleted":
            return False
        for table in ("session", "password_reset_token", "handoff_code", "identity_credential"):
            conn.execute(f"DELETE FROM {table} WHERE identity_id = %s", (identity_id,))
        conn.execute("UPDATE ai_usage SET identity_id = 'deleted' WHERE tenant_id = %s AND identity_id = %s", (tenant_id, identity_id))
        conn.execute("UPDATE identity SET email = %s, display_name = %s, status = 'deleted' WHERE identity_id = %s", (f"deleted-{identity_id}@erased.invalid", "（已刪除）", identity_id))
        return True

    def _find_identity_by_email(self, tenant_id: str, email: str) -> dict[str, Any] | None:
        if self._db.region_of(tenant_id) is None:
            return None
        with self._db.for_tenant(tenant_id) as conn:
            row = conn.execute("SELECT identity_id, tenant_id, email, display_name, status, created_at FROM identity WHERE tenant_id = %s AND email = %s", (tenant_id, email.lower())).fetchone()
        return dict(row) if row else None

    # -- Authentication -------------------------------------------------------------

    def authenticate(self, tenant_id: str, email: str, password: str) -> str | None:
        """Returns a new session token on success, ``None`` on any failure (wrong email,
        wrong password, suspended/deleted identity) -- deliberately undifferentiated in BOTH
        return value and TIMING so a caller cannot enumerate valid emails via a faster/slower
        response for 'email not found' vs 'wrong password'.

        The timing half is not free: a critic pass (2026-09-12) measured a real ~182ms gap
        between the two paths (a bare dict-miss return vs. a full PBKDF2-HMAC-SHA256 hash) --
        a 730x difference, trivially distinguishable over a network. Every failure path below
        now performs exactly one real PBKDF2 hash at the real iteration count before returning
        ``None``, using a fixed dummy salt when there is no real credential row to hash against
        -- see ``test_authenticate_timing.py`` for the regression test that measures this rather
        than merely asserting the code shape.
        """
        identity = self._find_identity_by_email(tenant_id, email)
        if identity is None or identity["status"] != "active":
            _hash_password(password, _DUMMY_SALT, PBKDF2_ITERATIONS)
            return None
        with self._db.for_tenant(tenant_id) as conn:
            cred = conn.execute("SELECT password_hash, password_salt, iterations FROM identity_credential WHERE identity_id = %s", (identity["identity_id"],)).fetchone()
        if cred is None:
            _hash_password(password, _DUMMY_SALT, PBKDF2_ITERATIONS)
            return None
        candidate = _hash_password(password, bytes(cred["password_salt"]), cred["iterations"])
        if not hmac.compare_digest(candidate, bytes(cred["password_hash"])):
            return None
        return self._issue_session(identity["identity_id"], identity["tenant_id"])

    def _issue_session(self, identity_id: str, tenant_id: str) -> str:
        token = secrets.token_urlsafe(32)
        now = db.now()
        with self._db.for_tenant(tenant_id) as conn:
            conn.execute(
                "INSERT INTO session (session_token, identity_id, tenant_id, created_at, expires_at) VALUES (%s,%s,%s,%s,%s)",
                (token, identity_id, tenant_id, now, now + SESSION_TTL),
            )
        return token

    def resolve_session(self, session_token: str) -> dict[str, Any] | None:
        """Returns ``{"identity_id", "tenant_id"}`` if the token is valid and unexpired, else
        ``None``. Does NOT extend the session on read (no sliding expiry -- a fixed TTL is
        simpler to reason about and matches ENTITLEMENT_STANDARD.md's own "no cache treated as
        authoritative during invalidation gap" spirit for session state)."""
        for region in self._each_region():
            with self._db.transaction(region) as conn:
                row = conn.execute("SELECT identity_id, tenant_id, expires_at FROM session WHERE session_token = %s", (session_token,)).fetchone()
            if row is not None:
                break
        else:
            return None
        if db.now() >= _instant(row["expires_at"]):
            self.revoke_session(session_token)
            return None
        return {"identity_id": row["identity_id"], "tenant_id": row["tenant_id"]}

    def revoke_session(self, session_token: str) -> None:
        for region in self._each_region():
            with self._db.transaction(region) as conn:
                if conn.execute("DELETE FROM session WHERE session_token = %s", (session_token,)).rowcount:
                    return

    def issue_session_for_identity(self, identity_id: str, tenant_id: str) -> str:
        """Mint a session for an identity the CALLER has already authenticated by some other means
        (today: redeem_handoff_code below). Skips password verification entirely -- callers must
        never expose this to anything that has not independently established the caller really is
        identity_id first, since unlike authenticate() there is no credential check here at all."""
        return self._issue_session(identity_id, tenant_id)

    # -- Cross-origin handoff codes (single-use, short-TTL) ------------------------
    #
    # Problem this solves: next-admin's /ops/collect bridge writes into Cognitive OS as a SEPARATE
    # service identity (bootstrap_service_identity.py), on purpose -- so an automated write is never
    # attributable to, or credentialed as, the human operator. But that means the operator's own
    # browser session against THIS dashboard (a different identity/tenant) can never see what the
    # service identity just created: GET /projects is tenant-scoped (see list_projects/_project_or_404
    # above), so the operator's ?project=<id> deep link 404s even though the Project genuinely exists
    # (operator report 2026-09-18, confirmed via direct API call: project existed, 0 sources, and
    # separately invisible to the operator's own tenant regardless of source count).
    #
    # Fix shape, deliberately NOT "merge the two identities" (that would undo the original
    # least-privilege separation) and NOT "give next-admin's redirect a Set-Cookie for this domain"
    # (a response FROM app.aware-wave.com cannot set a cookie scoped to cognitive.aware-wave.com
    # without broadening Domain= to the shared parent, which then collides with this dashboard's own
    # host-only login cookie of the same name -- fragile, order-dependent behaviour, not a 30-year
    # design). Instead: the standard OAuth-authorization-code shape. next-admin (already holding a
    # valid service-tenant session server-side) calls issue_handoff_code FOR ITS OWN identity_id/
    # tenant_id (see main.py's require_session-gated mint endpoint -- a caller can only ever mint a
    # code for the session it already holds, never an arbitrary target, so this cannot become a
    # privilege-escalation primitive). The code then travels to the browser via an ordinary 302
    # Location header (no secret in a Set-Cookie, no password in a URL) and is redeemed exactly once,
    # from cognitive.aware-wave.com's own origin, which sets its OWN normal host-only session cookie --
    # identical in shape to a real login, because redeem_handoff_code's caller mints one via
    # issue_session_for_identity above.

    def issue_handoff_code(self, identity_id: str, tenant_id: str, redirect_path: str) -> str:
        """Raw code exists only in the return value and the caller's redirect Location header --
        only its hash is persisted, matching issue_password_reset_token's own rationale above."""
        raw_code = secrets.token_urlsafe(32)
        now = db.now()
        with self._db.for_tenant(tenant_id) as conn:
            conn.execute(
                "INSERT INTO handoff_code (code_hash, identity_id, tenant_id, redirect_path, created_at, expires_at, consumed_at) VALUES (%s,%s,%s,%s,%s,%s,NULL)",
                (hashlib.sha256(raw_code.encode("utf-8")).hexdigest(), identity_id, tenant_id, redirect_path, now, now + HANDOFF_CODE_TTL),
            )
        return raw_code

    def redeem_handoff_code(self, raw_code: str) -> dict[str, Any] | None:
        """One-shot: a code already consumed (double redemption -- e.g. a browser prefetch, or a
        reload of the redirect response) or expired resolves to None exactly like a code that never
        existed, same as consume_password_reset_token's own failure shape above."""
        code_hash = hashlib.sha256(raw_code.encode("utf-8")).hexdigest()
        now = db.now()
        for region in self._each_region():
            with self._db.transaction(region) as conn:
                row = conn.execute(
                    "SELECT identity_id, tenant_id, redirect_path, expires_at FROM handoff_code WHERE code_hash = %s AND consumed_at IS NULL",
                    (code_hash,),
                ).fetchone()
                if row is None:
                    continue
                marked = conn.execute("UPDATE handoff_code SET consumed_at = %s WHERE code_hash = %s AND consumed_at IS NULL", (now, code_hash)).rowcount
                if marked != 1 or now >= _instant(row["expires_at"]):
                    return None
            return {"identity_id": row["identity_id"], "tenant_id": row["tenant_id"], "redirect_path": row["redirect_path"]}
        return None

    # -- Research collection grants (plan §3.4 C3) -----------------------------------
    #
    # One grant per collection run. The REFERENCE travels (COS -> next-admin -> Trigger payload); the TOKEN is minted
    # only when next-admin exchanges the reference, exactly once, and only its sha256 is kept -- the handoff-code shape
    # above, so the token never sits in Trigger's run history. A grant is closed when its run completes or its Project
    # is erased; a closed, expired or unexchanged grant resolves to nothing.

    def find_collector_identity(self, tenant_id: str) -> dict[str, Any] | None:
        return self._find_identity_by_email(tenant_id, COLLECTOR_EMAIL)

    def issue_collect_grant(self, tenant_id: str, project_id: str, run_id: str, collector_identity_id: str, expires_at: str) -> str:
        """``expires_at`` = the run's own ``deadline_at`` (core/domain/collection_run.py): one deadline, stored where
        each side checks it, never computed twice."""
        grant_ref = secrets.token_urlsafe(16)
        with self._db.for_tenant(tenant_id) as conn:
            conn.execute(
                "INSERT INTO collect_grant (grant_ref, tenant_id, project_id, run_id, collector_identity_id, created_at, expires_at) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (grant_ref, tenant_id, project_id, run_id, collector_identity_id, db.now(), expires_at),
            )
        return grant_ref

    def exchange_collect_grant(self, grant_ref: str) -> dict[str, str]:
        """One-shot. Raises GRANT_NOT_FOUND / GRANT_ALREADY_EXCHANGED / GRANT_EXPIRED (a closed grant counts as
        expired: COS already failed that run, a late Trigger start must not revive it)."""
        now = db.now()
        for region in self._each_region():
            with self._db.transaction(region) as conn:
                row = conn.execute(
                    "SELECT tenant_id, project_id, run_id, expires_at, exchanged_at, closed_at FROM collect_grant WHERE grant_ref = %s",
                    (grant_ref,),
                ).fetchone()
                if row is None:
                    continue
                if row["exchanged_at"] is not None:
                    raise InvariantViolation("GRANT_ALREADY_EXCHANGED")
                if row["closed_at"] is not None or now >= _instant(row["expires_at"]):
                    raise InvariantViolation("GRANT_EXPIRED")
                token = secrets.token_urlsafe(32)
                marked = conn.execute(
                    "UPDATE collect_grant SET token_hash = %s, exchanged_at = %s WHERE grant_ref = %s AND exchanged_at IS NULL AND closed_at IS NULL",
                    (hashlib.sha256(token.encode("utf-8")).hexdigest(), now, grant_ref),
                ).rowcount
                if marked != 1:
                    raise InvariantViolation("GRANT_ALREADY_EXCHANGED")
            return {"grant_token": token, "tenant_id": row["tenant_id"], "project_id": row["project_id"], "run_id": row["run_id"], "expires_at": row["expires_at"]}
        raise InvariantViolation("GRANT_NOT_FOUND")

    def resolve_collect_grant(self, raw_token: str) -> dict[str, str] | None:
        if not isinstance(raw_token, str) or not raw_token:
            return None
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        for region in self._each_region():
            with self._db.transaction(region) as conn:
                row = conn.execute(
                    "SELECT grant_ref, tenant_id, project_id, run_id, collector_identity_id, expires_at FROM collect_grant WHERE token_hash = %s AND closed_at IS NULL",
                    (token_hash,),
                ).fetchone()
            if row is not None:
                break
        else:
            return None
        if db.now() >= _instant(row["expires_at"]):
            return None
        return {key: row[key] for key in ("grant_ref", "tenant_id", "project_id", "run_id", "collector_identity_id")}

    def close_collect_grant(self, grant_ref: str) -> None:
        for region in self._each_region():
            with self._db.transaction(region) as conn:
                if conn.execute("UPDATE collect_grant SET closed_at = %s WHERE grant_ref = %s AND closed_at IS NULL", (db.now(), grant_ref)).rowcount:
                    return

    def close_collect_grants_for_project(self, tenant_id: str, project_id: str) -> int:
        with self._db.for_tenant(tenant_id) as conn:
            return self.close_collect_grants_on(conn, tenant_id, project_id)

    @staticmethod
    def close_collect_grants_on(conn: psycopg.Connection, tenant_id: str, project_id: str) -> int:
        """On a transaction the caller opened: a case's erasure closes its grants in its own decision transaction, so a
        failed erasure leaves them open and a committed one leaves none (ai_lego/platform/erasure.py)."""
        return conn.execute(
            "UPDATE collect_grant SET closed_at = %s WHERE tenant_id = %s AND project_id = %s AND closed_at IS NULL",
            (db.now(), tenant_id, project_id),
        ).rowcount

    # -- Password reset -----------------------------------------------------------

    def issue_password_reset_token(self, tenant_id: str, email: str) -> dict[str, str] | None:
        """Create a single-use reset token for an active identity.

        The returned raw token is an internal delivery payload. Only its SHA-256 digest is
        persisted, and all earlier unconsumed tokens for the identity are invalidated. Callers
        must hand the raw value to an explicitly configured delivery adapter; never log it or
        place it in a journal/artifact.
        """
        identity = self._find_identity_by_email(tenant_id, email)
        if identity is None or identity["status"] != "active":
            return None
        raw_token = secrets.token_urlsafe(32)
        now = db.now()
        record = {
            "reset_id": str(secrets.token_hex(16)),
            "identity_id": identity["identity_id"],
            "token_hash": hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
            "created_at": db.iso(now),
            "expires_at": db.iso(now + PASSWORD_RESET_TTL),
        }
        with self._db.for_tenant(tenant_id) as conn:
            conn.execute(
                "UPDATE password_reset_token SET consumed_at = %s WHERE identity_id = %s AND consumed_at IS NULL",
                (record["created_at"], record["identity_id"]),
            )
            conn.execute(
                "INSERT INTO password_reset_token (reset_id, identity_id, token_hash, created_at, expires_at, consumed_at) VALUES (%s,%s,%s,%s,%s,NULL)",
                (record["reset_id"], record["identity_id"], record["token_hash"], record["created_at"], record["expires_at"]),
            )
        return {"reset_id": record["reset_id"], "token": raw_token, "expires_at": record["expires_at"]}

    def consume_password_reset_token(self, raw_token: str, new_password: str) -> bool:
        """Atomically consume a valid token, replace the password, and revoke all sessions."""
        if len(new_password) < 12:
            raise InvariantViolation(f"IDENTITY_WEAK_PASSWORD: password must be at least 12 characters, got {len(new_password)}")
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        now = db.now()
        for region in self._each_region():
            with self._db.transaction(region) as conn:
                row = conn.execute(
                    "SELECT reset_id, identity_id, expires_at FROM password_reset_token WHERE token_hash = %s AND consumed_at IS NULL",
                    (token_hash,),
                ).fetchone()
                if row is None:
                    continue
                if now >= _instant(row["expires_at"]):
                    conn.execute("UPDATE password_reset_token SET consumed_at = %s WHERE reset_id = %s AND consumed_at IS NULL", (now, row["reset_id"]))
                    return False
                identity = conn.execute("SELECT status FROM identity WHERE identity_id = %s", (row["identity_id"],)).fetchone()
                if identity is None or identity["status"] != "active":
                    return False
                salt = secrets.token_bytes(16)
                password_hash = _hash_password(new_password, salt)
                updated = conn.execute(
                    "UPDATE password_reset_token SET consumed_at = %s WHERE reset_id = %s AND consumed_at IS NULL",
                    (now, row["reset_id"]),
                ).rowcount
                if updated != 1:
                    return False
                conn.execute(
                    "UPDATE identity_credential SET password_hash = %s, password_salt = %s, iterations = %s WHERE identity_id = %s",
                    (password_hash, salt, PBKDF2_ITERATIONS, row["identity_id"]),
                )
                conn.execute("DELETE FROM session WHERE identity_id = %s", (row["identity_id"],))
            return True
        return False

    # -- Entitlement audit (see ai_lego/platform/entitlement/check.py) --------------

    def record_entitlement_check(self, tenant_id: str, capability_id: str, granted: bool) -> None:
        # A tenant the directory does not hold has no region: its (denied) check is audited in the directory's region --
        # an id that names no tenant, nothing personal. Every known tenant's check goes to its own region.
        with self._db.transaction(self._db.region_of(tenant_id) or self._db.directory_region) as conn:
            conn.execute(
                "INSERT INTO entitlement_audit (tenant_id, capability_id, granted, checked_at) VALUES (%s,%s,%s,%s)",
                (tenant_id, capability_id, int(granted), db.now()),
            )

    # -- AI gateway usage: one row per paid call, written BEFORE the call as a reservation ------------------------
    # A row is 'reserved' (its worst case) from before the call until settle_ai_usage writes what it cost. Budget
    # readers sum every row, so a call in flight, one whose process died and one whose settle failed all keep
    # counting their worst case (never 0). The check and the reservation are one transaction under the tenant's
    # ai-usage lock (it replaced SQLite's BEGIN IMMEDIATE), so no other thread or process can pass the same check in
    # between. A row's id is numbered per region: it is always named with its tenant.

    def reserve_ai_usage(self, tenant_id: str, identity_id: str, purpose: str, model: str, input_tokens: int, output_tokens: int,
                         *, since: str, fits: Callable[[int], bool], run_id: str | None = None) -> tuple[int | None, int]:
        """(row id, tokens used since ``since`` before it) -- id None when ``fits(used)`` refuses; nothing is written then."""
        with self._db.for_tenant(tenant_id) as conn:
            db.advisory_xact_lock(conn, "ai-usage", tenant_id)
            used = int(conn.execute("SELECT COALESCE(SUM(input_tokens + output_tokens), 0) FROM ai_usage WHERE tenant_id = %s AND used_at >= %s", (tenant_id, since)).fetchone()[0])
            if not fits(used):
                return None, used
            row = conn.execute(
                "INSERT INTO ai_usage (tenant_id, identity_id, purpose, model, input_tokens, output_tokens, used_at, status, run_id) VALUES (%s,%s,%s,%s,%s,%s,%s,'reserved',%s) RETURNING id",
                (tenant_id, identity_id, purpose, model, int(input_tokens), int(output_tokens), db.now(), run_id),
            ).fetchone()
            return int(row[0]), used

    def settle_ai_usage(self, tenant_id: str, usage_id: int, model: str, input_tokens: int, output_tokens: int) -> None:
        """What the reserved call cost (a failed call: 0, or its worst case when its cost could not be read)."""
        with self._db.for_tenant(tenant_id) as conn:
            updated = conn.execute(
                "UPDATE ai_usage SET status = 'settled', model = %s, input_tokens = %s, output_tokens = %s WHERE tenant_id = %s AND id = %s AND status = 'reserved'",
                (model, int(input_tokens), int(output_tokens), tenant_id, int(usage_id)),
            ).rowcount
        if updated != 1:
            raise InvariantViolation(f"AI_USAGE_NOT_RESERVED: row {usage_id}")

    def ai_usage_recent(self, tenant_id: str, purpose: str, limit: int = 5) -> list[dict[str, int]]:
        """The tenant's latest settled RUNS for one purpose (``interpret:<method_id>``), newest first, each the sum of its
        calls (a retry is part of the run): what a run of that tool has cost lately, for the estimate before the next."""
        with self._db.for_tenant(tenant_id) as conn:
            rows = conn.execute(
                "SELECT SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, MAX(id) AS last_id, "
                "(array_agg(model ORDER BY id DESC))[1] AS model "   # the model of the run's latest call
                "FROM ai_usage WHERE tenant_id = %s AND purpose = %s AND status = 'settled' "
                "GROUP BY COALESCE(run_id, 'call:' || id) ORDER BY last_id DESC LIMIT %s",
                (tenant_id, purpose, max(1, int(limit))),
            ).fetchall()
        return [{"input_tokens": int(row["input_tokens"]), "output_tokens": int(row["output_tokens"]), "model": str(row["model"])} for row in rows]

    def ai_usage_totals(self, tenant_id: str, since: str | None = None) -> dict[str, int]:
        """Every row (reserved ones at their worst case) and, apart, what is still reserved. ``since``: an ISO-8601
        lower bound with its offset (inclusive), compared as a time by the database."""
        query = ("SELECT COUNT(*) AS calls, COALESCE(SUM(input_tokens),0) AS input_tokens, COALESCE(SUM(output_tokens),0) AS output_tokens, "
                 "COALESCE(SUM(CASE WHEN status = 'reserved' THEN input_tokens + output_tokens ELSE 0 END),0) AS reserved FROM ai_usage WHERE tenant_id = %s")
        params: list[str] = [tenant_id]
        if since is not None:
            query += " AND used_at >= %s"
            params.append(since)
        with self._db.for_tenant(tenant_id) as conn:
            row = conn.execute(query, params).fetchone()
        return {"calls": int(row["calls"]), "input_tokens": int(row["input_tokens"]), "output_tokens": int(row["output_tokens"]), "reserved": int(row["reserved"])}
