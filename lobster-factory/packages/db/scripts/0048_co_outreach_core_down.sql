-- Down migration for 0048_co_outreach_core.sql
-- Drops the Cold Outreach Workbench Phase-1 schema. Tables dropped in REVERSE dependency order
-- so foreign keys never block a drop. Idempotent (IF EXISTS throughout).
-- WARNING: this destroys all cold-outreach data (leads / messages / suppression / events).
-- Only run on a confirmed rollback; back up first if any real data exists.

DROP TABLE IF EXISTS public.co_verified_emails;
DROP TABLE IF EXISTS public.co_timeline_events;
DROP TABLE IF EXISTS public.co_sending_events;
DROP TABLE IF EXISTS public.co_sender_accounts;
DROP TABLE IF EXISTS public.co_connector_usage;
DROP TABLE IF EXISTS public.co_connector_limits;
DROP TABLE IF EXISTS public.co_connector_accounts;
DROP TABLE IF EXISTS public.co_suppression_list;
DROP TABLE IF EXISTS public.co_messages;
DROP TABLE IF EXISTS public.co_leads;
DROP TABLE IF EXISTS public.co_lead_inbox;
DROP TABLE IF EXISTS public.co_service_profiles;
