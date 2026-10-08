"""The erasure outbox (docs/platform/STORAGE_SWITCH.md "Erasure across the database and the files"): a case's or a
person's erasure is decided in one transaction that also writes what is left to remove from disk; the files go after
that commit, item by item, and the job row is what finds an unfinished erasure again after a crash.

Rows hold references only -- a blob path and hash, an artifact reference, a run id -- never content. A job row exists
exactly while its physical cleanup is unfinished: the step that finishes the last item deletes it (the items with it)
in the transaction that appends the case's ProjectErased tombstone.
"""

from __future__ import annotations

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE erasure_jobs (
            tenant_id text NOT NULL,
            subject_kind text NOT NULL CHECK (subject_kind IN ('case', 'person')),
            subject_id text NOT NULL,
            erased_by_identity_id text NOT NULL,
            decided_at timestamptz NOT NULL,
            counts_json jsonb NOT NULL,
            PRIMARY KEY (tenant_id, subject_kind, subject_id)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE erasure_items (
            tenant_id text NOT NULL,
            subject_kind text NOT NULL,
            subject_id text NOT NULL,
            item_no integer NOT NULL,
            kind text NOT NULL CHECK (kind IN ('source_blob', 'artifact', 'run_files')),
            target_json jsonb NOT NULL,
            state text NOT NULL CHECK (state IN ('pending', 'removed', 'absent', 'kept', 'unremovable')),
            error text,
            attempts integer NOT NULL DEFAULT 0,
            PRIMARY KEY (tenant_id, subject_kind, subject_id, item_no),
            FOREIGN KEY (tenant_id, subject_kind, subject_id) REFERENCES erasure_jobs (tenant_id, subject_kind, subject_id) ON DELETE CASCADE
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE erasure_items")
    op.execute("DROP TABLE erasure_jobs")
