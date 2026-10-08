"""Exception hierarchy shared by every ai_lego sub-package.

Messages start with a stable UPPER_SNAKE code wherever a caller (or a test)
needs to match on the failure class rather than on prose -- e.g.
``CAS_TENANT_ACCESS_DENIED``, ``UNKNOWN_DATA_SUBJECT``. Codes are part of the
contract; the prose after them is not.
"""

from __future__ import annotations


class InvariantViolation(RuntimeError):
    """A safety invariant, contract validation, or tenant boundary was violated."""


CASE_GONE = ("CASE_ERASED", "SOURCE_PROJECT_NOT_FOUND")   # the case was erased while the request ran: a 404, like asking for it now


def case_gone(error: BaseException) -> bool:
    return str(error).startswith(CASE_GONE)


# A group erased or never there, and a person who is not (or no longer) a member: one 404, so a group's existence is never
# disclosed to someone outside it (STEP34_SHARED_RULES.md G2). GROUP_CLOSED is not here: a member sees the group is closed.
GROUP_GONE = ("GROUP_ERASED", "GROUP_NOT_FOUND")


def group_gone(error: BaseException) -> bool:
    return str(error).startswith(GROUP_GONE)


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
