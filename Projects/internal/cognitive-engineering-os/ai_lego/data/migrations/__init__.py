"""Alembic's script directory for the engine's PostgreSQL schema (docs/platform/STORAGE_SWITCH.md D2). Run through
``ai_lego.data.db.migrate``; there is no alembic.ini. This and versions/ are packages only so a non-editable install
ships them (setuptools packs package directories only); Alembic itself skips every __init__.py."""
