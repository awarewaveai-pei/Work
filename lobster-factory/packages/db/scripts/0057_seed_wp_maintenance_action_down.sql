-- Down for 0057_seed_wp_maintenance_action.sql.
-- Soft-disable, NOT delete: ops_action_runs.action_id references this row with
-- ON DELETE RESTRICT (0011), so a hard DELETE fails once any run exists — and
-- the audit trail must not be destroyed anyway. Disabling hides the action from
-- future use while keeping history intact.

update ops_action_catalog
set enabled = false,
    updated_at = now()
where action_key = 'ops.maintenance.wp-plugin-update';
