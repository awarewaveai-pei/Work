// One transaction on one pooled connection, scoped to a tenant role. Used for
// multi-statement writes that must be atomic (evidence promotion).
// SET LOCAL ROLE, not SET ROLE: the role ends with the transaction, so a pooled
// connection is never released still carrying a tenant role. If ROLLBACK itself
// fails, the connection state is unknown, so it is destroyed (release(true))
// and never re-pooled. `role` must come from server.mjs's TENANT_ROLES
// allowlist, because it is interpolated into SQL (SET cannot take a bind parameter).
export async function withTenantTransaction(pool, role, fn) {
  const client = await pool.connect();
  let destroy = false;
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    const result = await fn((sql, params) => client.query(sql, params));
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => { destroy = true; });
    throw err;
  } finally {
    client.release(destroy);
  }
}
