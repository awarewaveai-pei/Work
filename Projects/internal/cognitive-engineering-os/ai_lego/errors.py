"""Exception hierarchy shared by every ai_lego sub-package.

Messages start with a stable UPPER_SNAKE code wherever a caller (or a test)
needs to match on the failure class rather than on prose -- e.g.
``CAS_TENANT_ACCESS_DENIED``, ``UNKNOWN_DATA_SUBJECT``. Codes are part of the
contract; the prose after them is not.
"""

from __future__ import annotations


class InvariantViolation(RuntimeError):
    """A safety invariant, contract validation, or tenant boundary was violated."""


class SpecRootNotFound(InvariantViolation):
    """The read-only spec root could not be located."""


class SchemaValidationError(InvariantViolation):
    """An emitted record failed validation against a canonical spec schema. ``violations`` = where, without values
    (``SchemaContracts.violations``): the one part of the failure that is safe to store."""

    def __init__(self, message: str, violations: tuple[str, ...] = ()):
        super().__init__(message)
        self.violations = tuple(violations)


class AdapterUnavailable(InvariantViolation):
    """An optional adapter (offline STT, Windows SAPI speech) is not available here.

    Raised instead of silently falling back to a mock: the caller decides
    whether to skip (and must say so visibly) or to fail.
    """
