"use strict";

const COOKIE_NAME = "__Host-vw-organization";
const HEADER_NAME = "x-vw-org";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readOrganizationCookie(header) {
  const values = String(header || "").split(";").map(part => part.trim())
    .filter(part => part.startsWith(COOKIE_NAME + "="));
  if (!values.length) return null;
  // Duplicate/path-shadowed cookies must never silently select another tenant.
  if (values.length !== 1) return "invalid";
  try { return decodeURIComponent(values[0].slice(COOKIE_NAME.length + 1)).toLowerCase(); }
  catch { return "invalid"; }
}

module.exports = { COOKIE_NAME, HEADER_NAME, UUID_RE, readOrganizationCookie };
