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
from typing import Any, Iterator

from ai_lego.core.domain.identity import identity_record
from ai_lego.core.domain.workspace import workspace_record
from ai_lego.errors import InvariantViolation

PBKDF2_ITERATIONS = 600_000
SESSION_TTL = timedelta(hours=12)
PASSWORD_RESET_TTL = timedelta(hours=1)
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
    used_at TEXT NOT NULL
);
"""


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

    # -- AI gateway usage (Phase 2 credit metering reads this; Phase 1 only records) -----------

    def record_ai_usage(self, tenant_id: str, identity_id: str, purpose: str, model: str, input_tokens: int, output_tokens: int) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO ai_usage (tenant_id, identity_id, purpose, model, input_tokens, output_tokens, used_at) VALUES (?,?,?,?,?,?,?)",
                (tenant_id, identity_id, purpose, model, int(input_tokens), int(output_tokens), _now_iso()),
            )

    def ai_usage_totals(self, tenant_id: str) -> dict[str, int]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS calls, COALESCE(SUM(input_tokens),0) AS input_tokens, COALESCE(SUM(output_tokens),0) AS output_tokens FROM ai_usage WHERE tenant_id = ?",
                (tenant_id,),
            ).fetchone()
        return {"calls": int(row["calls"]), "input_tokens": int(row["input_tokens"]), "output_tokens": int(row["output_tokens"])}
