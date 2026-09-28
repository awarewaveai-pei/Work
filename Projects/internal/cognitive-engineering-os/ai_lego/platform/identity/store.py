"""SQLite-backed Tenant/Workspace/Identity store + password auth + session tokens.

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
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Iterator

from ai_lego.core.domain.identity import identity_record
from ai_lego.core.domain.workspace import workspace_record
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
_SCHEMA = """
CREATE TABLE IF NOT EXISTS tenant (
    tenant_id TEXT PRIMARY KEY,
    legal_name TEXT NOT NULL,
    status TEXT NOT NULL,
    home_jurisdiction TEXT NOT NULL,
    data_residency_region TEXT NOT NULL,
    encryption_root_key_ref TEXT NOT NULL,
    created_at TEXT NOT NULL,
    deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS workspace (
    workspace_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenant(tenant_id),
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(tenant_id, name)
);
CREATE TABLE IF NOT EXISTS identity (
    identity_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenant(tenant_id),
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(tenant_id, email)
);
CREATE TABLE IF NOT EXISTS identity_credential (
    identity_id TEXT PRIMARY KEY REFERENCES identity(identity_id),
    password_hash BLOB NOT NULL,
    password_salt BLOB NOT NULL,
    iterations INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS session (
    session_token TEXT PRIMARY KEY,
    identity_id TEXT NOT NULL REFERENCES identity(identity_id),
    tenant_id TEXT NOT NULL REFERENCES tenant(tenant_id),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS password_reset_token (
    reset_id TEXT PRIMARY KEY,
    identity_id TEXT NOT NULL REFERENCES identity(identity_id),
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT
);
CREATE TABLE IF NOT EXISTS handoff_code (
    code_hash TEXT PRIMARY KEY,
    identity_id TEXT NOT NULL REFERENCES identity(identity_id),
    tenant_id TEXT NOT NULL REFERENCES tenant(tenant_id),
    redirect_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT
);
CREATE TABLE IF NOT EXISTS collect_grant (
    grant_ref TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenant(tenant_id),
    project_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    collector_identity_id TEXT NOT NULL REFERENCES identity(identity_id),
    scope TEXT NOT NULL DEFAULT 'source.ingest',
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    token_hash TEXT UNIQUE,
    exchanged_at TEXT,
    closed_at TEXT
);
CREATE TABLE IF NOT EXISTS entitlement_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    capability_id TEXT NOT NULL,
    granted INTEGER NOT NULL,
    checked_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    identity_id TEXT NOT NULL,
    purpose TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    used_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'settled',
    run_id TEXT
);
"""

# Columns an older file gains on open (ADD COLUMN only): a row written before reservations existed is a settled one.
_MIGRATION_COLUMNS = {"ai_usage": [("status", "TEXT NOT NULL DEFAULT 'settled'"), ("run_id", "TEXT")]}


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _hash_password(password: str, salt: bytes, iterations: int = PBKDF2_ITERATIONS) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)


class IdentityStore:
    """One SQLite file per deployment. Phase 1 is single-tenant, but the schema itself does
    not assume that (matches specs/domain/workspace.schema.yaml's own N-per-tenant design)."""

    def __init__(self, db_path: Path | str):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(_SCHEMA)
            for table, columns in _MIGRATION_COLUMNS.items():
                existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
                for column, column_type in columns:
                    if column not in existing:
                        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}")

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    # -- Tenant -----------------------------------------------------------------

    def create_tenant(
        self,
        tenant_id: str,
        legal_name: str,
        home_jurisdiction: str,
        data_residency_region: str,
        encryption_root_key_ref: str,
    ) -> dict[str, Any]:
        record = {
            "tenant_id": tenant_id,
            "legal_name": legal_name,
            "status": "active",
            "home_jurisdiction": home_jurisdiction,
            "data_residency_region": data_residency_region,
            "encryption_root_key_ref": encryption_root_key_ref,
            "created_at": _now_iso(),
            "deleted_at": None,
        }
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO tenant (tenant_id, legal_name, status, home_jurisdiction, data_residency_region, encryption_root_key_ref, created_at, deleted_at) VALUES (?,?,?,?,?,?,?,?)",
                (record["tenant_id"], record["legal_name"], record["status"], record["home_jurisdiction"], record["data_residency_region"], record["encryption_root_key_ref"], record["created_at"], record["deleted_at"]),
            )
        return record

    def get_tenant(self, tenant_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM tenant WHERE tenant_id = ?", (tenant_id,)).fetchone()
        return dict(row) if row else None

    # -- Workspace ----------------------------------------------------------------

    def create_workspace(self, workspace_id: str, tenant_id: str, name: str) -> dict[str, Any]:
        if self.get_tenant(tenant_id) is None:
            raise InvariantViolation(f"WORKSPACE_DANGLING_TENANT_REF: tenant_id {tenant_id!r} does not resolve to a declared tenant")
        record = workspace_record(workspace_id, tenant_id, name, "active", _now_iso())
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO workspace (workspace_id, tenant_id, name, status, created_at) VALUES (?,?,?,?,?)",
                (record["workspace_id"], record["tenant_id"], record["name"], record["status"], record["created_at"]),
            )
        return record

    def list_workspaces(self, tenant_id: str) -> list[dict[str, Any]]:
        # `created_at` has second-granularity (`_now_iso` truncates microseconds); two workspaces created
        # within the same second would tie there. `rowid` (SQLite's implicit column; `workspace` has no
        # `WITHOUT ROWID` clause) is a true, gap-free insertion-order tiebreak -- unlike ordering by
        # `workspace_id` (a random UUID), which would silently scramble same-second insertion order.
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM workspace WHERE tenant_id = ? ORDER BY created_at, rowid", (tenant_id,)).fetchall()
        return [dict(row) for row in rows]

    def get_workspace(self, tenant_id: str, workspace_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM workspace WHERE tenant_id = ? AND workspace_id = ?", (tenant_id, workspace_id)).fetchone()
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
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO identity (identity_id, tenant_id, email, display_name, status, created_at) VALUES (?,?,?,?,?,?)",
                (record["identity_id"], record["tenant_id"], record["email"], record["display_name"], record["status"], record["created_at"]),
            )
            conn.execute(
                "INSERT INTO identity_credential (identity_id, password_hash, password_salt, iterations) VALUES (?,?,?,?)",
                (record["identity_id"], password_hash, salt, PBKDF2_ITERATIONS),
            )
        return record

    def get_identity(self, identity_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT identity_id, tenant_id, email, display_name, status, created_at FROM identity WHERE identity_id = ?", (identity_id,)).fetchone()
        return dict(row) if row else None

    def _find_identity_by_email(self, tenant_id: str, email: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT identity_id, tenant_id, email, display_name, status, created_at FROM identity WHERE tenant_id = ? AND email = ?", (tenant_id, email.lower())).fetchone()
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
        with self._connect() as conn:
            cred = conn.execute("SELECT password_hash, password_salt, iterations FROM identity_credential WHERE identity_id = ?", (identity["identity_id"],)).fetchone()
        if cred is None:
            _hash_password(password, _DUMMY_SALT, PBKDF2_ITERATIONS)
            return None
        candidate = _hash_password(password, cred["password_salt"], cred["iterations"])
        if not hmac.compare_digest(candidate, cred["password_hash"]):
            return None
        return self._issue_session(identity["identity_id"], identity["tenant_id"])

    def _issue_session(self, identity_id: str, tenant_id: str) -> str:
        token = secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc)
        expires = now + SESSION_TTL
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO session (session_token, identity_id, tenant_id, created_at, expires_at) VALUES (?,?,?,?,?)",
                (token, identity_id, tenant_id, now.replace(microsecond=0).isoformat().replace("+00:00", "Z"), expires.replace(microsecond=0).isoformat().replace("+00:00", "Z")),
            )
        return token

    def resolve_session(self, session_token: str) -> dict[str, Any] | None:
        """Returns ``{"identity_id", "tenant_id"}`` if the token is valid and unexpired, else
        ``None``. Does NOT extend the session on read (no sliding expiry -- a fixed TTL is
        simpler to reason about and matches ENTITLEMENT_STANDARD.md's own "no cache treated as
        authoritative during invalidation gap" spirit for session state)."""
        with self._connect() as conn:
            row = conn.execute("SELECT identity_id, tenant_id, expires_at FROM session WHERE session_token = ?", (session_token,)).fetchone()
        if row is None:
            return None
        expires_at = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) >= expires_at:
            self.revoke_session(session_token)
            return None
        return {"identity_id": row["identity_id"], "tenant_id": row["tenant_id"]}

    def revoke_session(self, session_token: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM session WHERE session_token = ?", (session_token,))

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
        now = datetime.now(timezone.utc).replace(microsecond=0)
        expires = now + HANDOFF_CODE_TTL
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO handoff_code (code_hash, identity_id, tenant_id, redirect_path, created_at, expires_at, consumed_at) VALUES (?,?,?,?,?,?,NULL)",
                (
                    hashlib.sha256(raw_code.encode("utf-8")).hexdigest(),
                    identity_id,
                    tenant_id,
                    redirect_path,
                    now.isoformat().replace("+00:00", "Z"),
                    expires.isoformat().replace("+00:00", "Z"),
                ),
            )
        return raw_code

    def redeem_handoff_code(self, raw_code: str) -> dict[str, Any] | None:
        """One-shot: a code already consumed (double redemption -- e.g. a browser prefetch, or a
        reload of the redirect response) or expired resolves to None exactly like a code that never
        existed, same as consume_password_reset_token's own failure shape above."""
        code_hash = hashlib.sha256(raw_code.encode("utf-8")).hexdigest()
        now = datetime.now(timezone.utc).replace(microsecond=0)
        with self._connect() as conn:
            row = conn.execute(
                "SELECT identity_id, tenant_id, redirect_path, expires_at FROM handoff_code WHERE code_hash = ? AND consumed_at IS NULL",
                (code_hash,),
            ).fetchone()
            if row is None:
                return None
            expires_at = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
            marked = conn.execute(
                "UPDATE handoff_code SET consumed_at = ? WHERE code_hash = ? AND consumed_at IS NULL",
                (now.isoformat().replace("+00:00", "Z"), code_hash),
            ).rowcount
            if marked != 1 or now >= expires_at:
                return None
        return {"identity_id": row["identity_id"], "tenant_id": row["tenant_id"], "redirect_path": row["redirect_path"]}

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
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO collect_grant (grant_ref, tenant_id, project_id, run_id, collector_identity_id, created_at, expires_at) VALUES (?,?,?,?,?,?,?)",
                (grant_ref, tenant_id, project_id, run_id, collector_identity_id, _now_iso(), expires_at),
            )
        return grant_ref

    def exchange_collect_grant(self, grant_ref: str) -> dict[str, str]:
        """One-shot. Raises GRANT_NOT_FOUND / GRANT_ALREADY_EXCHANGED / GRANT_EXPIRED (a closed grant counts as
        expired: COS already failed that run, a late Trigger start must not revive it)."""
        now = datetime.now(timezone.utc).replace(microsecond=0)
        with self._connect() as conn:
            row = conn.execute(
                "SELECT tenant_id, project_id, run_id, expires_at, exchanged_at, closed_at FROM collect_grant WHERE grant_ref = ?",
                (grant_ref,),
            ).fetchone()
            if row is None:
                raise InvariantViolation("GRANT_NOT_FOUND")
            if row["exchanged_at"] is not None:
                raise InvariantViolation("GRANT_ALREADY_EXCHANGED")
            if row["closed_at"] is not None or now >= datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00")):
                raise InvariantViolation("GRANT_EXPIRED")
            token = secrets.token_urlsafe(32)
            marked = conn.execute(
                "UPDATE collect_grant SET token_hash = ?, exchanged_at = ? WHERE grant_ref = ? AND exchanged_at IS NULL AND closed_at IS NULL",
                (hashlib.sha256(token.encode("utf-8")).hexdigest(), now.isoformat().replace("+00:00", "Z"), grant_ref),
            ).rowcount
            if marked != 1:
                raise InvariantViolation("GRANT_ALREADY_EXCHANGED")
        return {"grant_token": token, "tenant_id": row["tenant_id"], "project_id": row["project_id"], "run_id": row["run_id"], "expires_at": row["expires_at"]}

    def resolve_collect_grant(self, raw_token: str) -> dict[str, str] | None:
        if not isinstance(raw_token, str) or not raw_token:
            return None
        now = datetime.now(timezone.utc).replace(microsecond=0)
        with self._connect() as conn:
            row = conn.execute(
                "SELECT grant_ref, tenant_id, project_id, run_id, collector_identity_id, expires_at FROM collect_grant WHERE token_hash = ? AND closed_at IS NULL",
                (hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),),
            ).fetchone()
        if row is None or now >= datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00")):
            return None
        return {key: row[key] for key in ("grant_ref", "tenant_id", "project_id", "run_id", "collector_identity_id")}

    def close_collect_grant(self, grant_ref: str) -> None:
        with self._connect() as conn:
            conn.execute("UPDATE collect_grant SET closed_at = ? WHERE grant_ref = ? AND closed_at IS NULL", (_now_iso(), grant_ref))

    def close_collect_grants_for_project(self, tenant_id: str, project_id: str) -> int:
        with self._connect() as conn:
            return conn.execute(
                "UPDATE collect_grant SET closed_at = ? WHERE tenant_id = ? AND project_id = ? AND closed_at IS NULL",
                (_now_iso(), tenant_id, project_id),
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
        now = datetime.now(timezone.utc).replace(microsecond=0)
        expires = now + PASSWORD_RESET_TTL
        record = {
            "reset_id": str(secrets.token_hex(16)),
            "identity_id": identity["identity_id"],
            "token_hash": hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
            "created_at": now.isoformat().replace("+00:00", "Z"),
            "expires_at": expires.isoformat().replace("+00:00", "Z"),
        }
        with self._connect() as conn:
            conn.execute(
                "UPDATE password_reset_token SET consumed_at = ? WHERE identity_id = ? AND consumed_at IS NULL",
                (record["created_at"], record["identity_id"]),
            )
            conn.execute(
                "INSERT INTO password_reset_token (reset_id, identity_id, token_hash, created_at, expires_at, consumed_at) VALUES (?,?,?,?,?,NULL)",
                (record["reset_id"], record["identity_id"], record["token_hash"], record["created_at"], record["expires_at"]),
            )
        return {"reset_id": record["reset_id"], "token": raw_token, "expires_at": record["expires_at"]}

    def consume_password_reset_token(self, raw_token: str, new_password: str) -> bool:
        """Atomically consume a valid token, replace the password, and revoke all sessions."""
        if len(new_password) < 12:
            raise InvariantViolation(f"IDENTITY_WEAK_PASSWORD: password must be at least 12 characters, got {len(new_password)}")
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        now = datetime.now(timezone.utc).replace(microsecond=0)
        now_iso = now.isoformat().replace("+00:00", "Z")
        with self._connect() as conn:
            row = conn.execute(
                "SELECT reset_id, identity_id, expires_at FROM password_reset_token WHERE token_hash = ? AND consumed_at IS NULL",
                (token_hash,),
            ).fetchone()
            if row is None:
                return False
            expires_at = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
            if now >= expires_at:
                conn.execute("UPDATE password_reset_token SET consumed_at = ? WHERE reset_id = ? AND consumed_at IS NULL", (now_iso, row["reset_id"]))
                return False
            identity = conn.execute("SELECT status FROM identity WHERE identity_id = ?", (row["identity_id"],)).fetchone()
            if identity is None or identity["status"] != "active":
                return False
            salt = secrets.token_bytes(16)
            password_hash = _hash_password(new_password, salt)
            updated = conn.execute(
                "UPDATE password_reset_token SET consumed_at = ? WHERE reset_id = ? AND consumed_at IS NULL",
                (now_iso, row["reset_id"]),
            ).rowcount
            if updated != 1:
                return False
            conn.execute(
                "UPDATE identity_credential SET password_hash = ?, password_salt = ?, iterations = ? WHERE identity_id = ?",
                (password_hash, salt, PBKDF2_ITERATIONS, row["identity_id"]),
            )
            conn.execute("DELETE FROM session WHERE identity_id = ?", (row["identity_id"],))
        return True

    # -- Entitlement audit (see ai_lego/platform/entitlement/check.py) --------------

    def record_entitlement_check(self, tenant_id: str, capability_id: str, granted: bool) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO entitlement_audit (tenant_id, capability_id, granted, checked_at) VALUES (?,?,?,?)",
                (tenant_id, capability_id, int(granted), _now_iso()),
            )

    # -- AI gateway usage: one row per paid call, written BEFORE the call as a reservation ------------------------
    # A row is 'reserved' (its worst case) from before the call until settle_ai_usage writes what it cost. Budget
    # readers sum every row, so a call in flight, one whose process died and one whose settle failed all keep
    # counting their worst case (never 0). The check and the reservation are one IMMEDIATE transaction, so no other
    # thread or process can pass the same check in between.

    def reserve_ai_usage(self, tenant_id: str, identity_id: str, purpose: str, model: str, input_tokens: int, output_tokens: int,
                         *, since: str, fits: Callable[[int], bool], run_id: str | None = None) -> tuple[int | None, int]:
        """(row id, tokens used since ``since`` before it) -- id None when ``fits(used)`` refuses; nothing is written then."""
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            used = int(conn.execute("SELECT COALESCE(SUM(input_tokens + output_tokens), 0) FROM ai_usage WHERE tenant_id = ? AND used_at >= ?", (tenant_id, since)).fetchone()[0])
            if not fits(used):
                return None, used
            cursor = conn.execute(
                "INSERT INTO ai_usage (tenant_id, identity_id, purpose, model, input_tokens, output_tokens, used_at, status, run_id) VALUES (?,?,?,?,?,?,?,'reserved',?)",
                (tenant_id, identity_id, purpose, model, int(input_tokens), int(output_tokens), _now_iso(), run_id),
            )
            return int(cursor.lastrowid), used

    def settle_ai_usage(self, usage_id: int, model: str, input_tokens: int, output_tokens: int) -> None:
        """What the reserved call cost (a failed call: 0, or its worst case when its cost could not be read)."""
        with self._connect() as conn:
            updated = conn.execute(
                "UPDATE ai_usage SET status = 'settled', model = ?, input_tokens = ?, output_tokens = ? WHERE id = ? AND status = 'reserved'",
                (model, int(input_tokens), int(output_tokens), int(usage_id)),
            ).rowcount
        if updated != 1:
            raise InvariantViolation(f"AI_USAGE_NOT_RESERVED: row {usage_id}")

    def ai_usage_recent(self, tenant_id: str, purpose: str, limit: int = 5) -> list[dict[str, int]]:
        """The tenant's latest settled RUNS for one purpose (``interpret:<method_id>``), newest first, each the sum of its
        calls (a retry is part of the run): what a run of that tool has cost lately, for the estimate before the next."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, MAX(id) AS last_id, model "   # SQLite: a bare column comes from the MAX(id) row
                "FROM ai_usage WHERE tenant_id = ? AND purpose = ? AND status = 'settled' "
                "GROUP BY COALESCE(run_id, 'call:' || id) ORDER BY last_id DESC LIMIT ?",
                (tenant_id, purpose, max(1, int(limit))),
            ).fetchall()
        return [{"input_tokens": int(row["input_tokens"]), "output_tokens": int(row["output_tokens"]), "model": str(row["model"])} for row in rows]

    def ai_usage_totals(self, tenant_id: str, since: str | None = None) -> dict[str, int]:
        """Every row (reserved ones at their worst case) and, apart, what is still reserved. ``since``: an ISO8601
        ``YYYY-MM-DDTHH:MM:SSZ`` lower bound (inclusive), matching ``_now_iso``'s fixed-width format so a plain TEXT
        comparison in SQLite is correct -- no date parsing needed."""
        query = ("SELECT COUNT(*) AS calls, COALESCE(SUM(input_tokens),0) AS input_tokens, COALESCE(SUM(output_tokens),0) AS output_tokens, "
                 "COALESCE(SUM(CASE WHEN status = 'reserved' THEN input_tokens + output_tokens ELSE 0 END),0) AS reserved FROM ai_usage WHERE tenant_id = ?")
        params: list[str] = [tenant_id]
        if since is not None:
            query += " AND used_at >= ?"
            params.append(since)
        with self._connect() as conn:
            row = conn.execute(query, params).fetchone()
        return {"calls": int(row["calls"]), "input_tokens": int(row["input_tokens"]), "output_tokens": int(row["output_tokens"]), "reserved": int(row["reserved"])}
