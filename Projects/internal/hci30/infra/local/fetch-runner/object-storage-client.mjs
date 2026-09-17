// HCI-30 isolated fetch runner -- object-storage write-path client (ADR-0029
// gate 1 container; HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md Task 5).
// Content-addressed writes to this runner's own dedicated MinIO instance
// (compose.fetch-runner.yml's `object-storage` service, Task 3 provisioning
// -- NOT Trigger.dev's internal MinIO). Zero npm dependencies, same as
// server.mjs (Dockerfile has no package.json/npm install step): AWS SigV4 is
// implemented here directly with node:crypto rather than pulling in an S3
// SDK.
//
// Scope boundary (plan doc Task 5): this module only talks to MinIO. No
// Postgres access, no tenant_id concept, no cross-tenant dedup lookup --
// every write is an unconditional PUT to a content-addressed key. Two
// identical-byte writes converging on the same key is an inherent property
// of content addressing, not a dedup *layer* (ADR-0026 explicitly does not
// authorize building that layer; a lookup-before-write skip path would be
// one, an unconditional PUT is not).
//
// Not wired into server.mjs's request handling -- that is Task 7/8's job
// (fetch + extract, then the sink write path). `getContentAddressedObject`
// exists only to let this module's own architecture test read back what it
// wrote against the real MinIO instance; Task 8's write path never needs it.
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// 20 MiB: generous for a single fetched HTML/text document, small enough to
// bound worst-case per-write storage and request duration on a local
// instance. Override via env for tests that need to exercise the rejection
// path without transferring 20 MiB.
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_REGION = 'us-east-1'; // MinIO ignores region correctness; any fixed value both sides agree on works.

export class ObjectTooLargeError extends Error {
  constructor(actualBytes, maxBytes) {
    super(`payload is ${actualBytes} bytes, exceeds the ${maxBytes}-byte single-write cap -- rejected, not truncated`);
    this.name = 'ObjectTooLargeError';
    this.code = 'OBJECT_TOO_LARGE';
    this.actualBytes = actualBytes;
    this.maxBytes = maxBytes;
  }
}

export class ObjectStorageTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`object storage request did not complete within ${timeoutMs}ms`);
    this.name = 'ObjectStorageTimeoutError';
    this.code = 'OBJECT_STORAGE_TIMEOUT';
  }
}

export function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function loadConfigFromEnv() {
  return {
    endpoint: requireEnv('HCI_FETCH_RUNNER_MINIO_ENDPOINT'),
    bucket: requireEnv('HCI_FETCH_RUNNER_MINIO_BUCKET'),
    accessKeyId: requireEnv('HCI_FETCH_RUNNER_MINIO_ACCESS_KEY'),
    secretAccessKey: requireEnv('HCI_FETCH_RUNNER_MINIO_SECRET_KEY'),
    region: process.env.HCI_FETCH_RUNNER_MINIO_REGION || DEFAULT_REGION,
    maxBytes: Number(process.env.HCI_FETCH_RUNNER_MAX_SNAPSHOT_BYTES || DEFAULT_MAX_BYTES),
    timeoutMs: Number(process.env.HCI_FETCH_RUNNER_MINIO_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  };
}

function getAmzDateParts(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, ''); // -> YYYYMMDDTHHMMSSZ
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function getSignatureKey(secretAccessKey, dateStamp, region, service) {
  const kDate = crypto.createHmac('sha256', `AWS4${secretAccessKey}`).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
  const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
  return crypto.createHmac('sha256', kService).update('aws4_request').digest();
}

// No generic percent-encoder here on purpose: canonicalUri is always
// `/<bucket>/sha256/<64 lowercase hex chars>`, and bucket is a fixed,
// operator-supplied alnum+hyphen name (compose.fetch-runner.yml). Every
// character in that space is already URI-safe per the AWS SigV4 spec, so
// omitting the encoder avoids reimplementing a spec-sensitive routine this
// module has no way to exercise against real AWS/MinIO edge cases. If this
// client ever needs to address arbitrary keys, add proper RFC 3986
// percent-encoding here first.
function signedRequest({ method, endpoint, bucket, key, region, accessKeyId, secretAccessKey, timeoutMs, body, contentType }) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const host = url.host;
    const payload = body || Buffer.alloc(0);
    const payloadHashHex = sha256Hex(payload);
    const { amzDate, dateStamp } = getAmzDateParts();
    const canonicalUri = `/${bucket}/${key}`;

    const headersToSign = { host, 'x-amz-content-sha256': payloadHashHex, 'x-amz-date': amzDate };
    if (contentType) headersToSign['content-type'] = contentType;
    const signedHeaderNames = Object.keys(headersToSign).sort();
    const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${headersToSign[h]}\n`).join('');
    const signedHeadersStr = signedHeaderNames.join(';');
    const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeadersStr, payloadHashHex].join('\n');

    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256Hex(Buffer.from(canonicalRequest, 'utf8')),
    ].join('\n');
    const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, 's3');
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');
    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`;

    const requestHeaders = {
      Host: host,
      'X-Amz-Date': amzDate,
      'X-Amz-Content-Sha256': payloadHashHex,
      Authorization: authorization,
    };
    if (contentType) requestHeaders['Content-Type'] = contentType;
    if (method === 'PUT') requestHeaders['Content-Length'] = String(payload.length);

    const req = http.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        method,
        path: canonicalUri,
        headers: requestHeaders,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(responseBody);
          } else {
            reject(new Error(`object storage request failed: HTTP ${res.statusCode} ${responseBody.toString('utf8').slice(0, 500)}`));
          }
        });
      },
    );

    // Destroying with an Error routes through the 'error' handler below,
    // which is where the reject() actually happens -- a bare req.destroy()
    // with no argument would instead surface as a generic ECONNRESET.
    req.on('timeout', () => req.destroy(new ObjectStorageTimeoutError(timeoutMs)));
    req.on('error', reject);

    req.end(method === 'PUT' ? payload : undefined);
  });
}

// Enforces the size cap before any network I/O: an oversized payload never
// reaches MinIO at all, so there is no partial object to clean up.
export async function putContentAddressedObject(bytes, config) {
  if (!Buffer.isBuffer(bytes)) throw new TypeError('bytes must be a Buffer');
  if (bytes.length > config.maxBytes) throw new ObjectTooLargeError(bytes.length, config.maxBytes);

  const contentHash = sha256Hex(bytes);
  const key = `sha256/${contentHash}`;
  await signedRequest({
    method: 'PUT',
    endpoint: config.endpoint,
    bucket: config.bucket,
    key,
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    timeoutMs: config.timeoutMs,
    body: bytes,
    contentType: 'application/octet-stream',
  });

  // Shape consumed by Task 8's hci.source_snapshots insert:
  // content_hash/snapshot_ref (migrations/0004_wave1_source_provenance_up.sql,
  // both `text NOT NULL CHECK (length(btrim(...)) > 0)`). snapshot_ref is
  // opaque to Postgres by design (0004's header) -- this s3://bucket/key
  // shape is this module's own choice of what goes inside that opaque text,
  // parseable only by code that imports this file (parseSnapshotRef below).
  return { content_hash: contentHash, snapshot_ref: `s3://${config.bucket}/${key}` };
}

// Only this module's own write shape (sha256/<64-hex>) is ever a legitimate
// key -- anything else is rejected before it can become a request path.
// Without this, an arbitrary snapshot_ref (crafted, or from a future
// caller/DB row this module doesn't control) could carry `../` segments
// into canonicalUri below; MinIO's default backend is a POSIX filesystem,
// where that is a known path-traversal vector against S3-compatible stores.
// The write path was already safe (key is always programmatically derived
// from sha256Hex), but nothing enforced the same shape on read. Critic
// review 2026-09-17.
const CONTENT_ADDRESSED_KEY = /^sha256\/[0-9a-f]{64}$/;

function parseSnapshotRef(ref) {
  const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(ref);
  if (!match) throw new Error(`not a recognized snapshot_ref: ${ref}`);
  const [, bucket, key] = match;
  if (!CONTENT_ADDRESSED_KEY.test(key)) throw new Error(`snapshot_ref key is not a content-addressed sha256 key: ${key}`);
  return { bucket, key };
}

// Test-support only (not part of Task 5's write-path contract): lets the
// architecture test prove round-trip byte equality against the real MinIO
// instance without a separate S3 client.
export async function getContentAddressedObject(snapshotRef, config) {
  const { bucket, key } = parseSnapshotRef(snapshotRef);
  if (bucket !== config.bucket) throw new Error(`snapshot_ref bucket '${bucket}' does not match configured bucket '${config.bucket}'`);
  return signedRequest({
    method: 'GET',
    endpoint: config.endpoint,
    bucket: config.bucket,
    key,
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    timeoutMs: config.timeoutMs,
  });
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks)));
    process.stdin.on('error', reject);
  });
}

// CLI driver used by tests/architecture/*.ps1 via `docker compose exec -T
// runner node object-storage-client.mjs <put|get> ...` -- binary bytes go
// through files (stdin for put, --out for get), never through a captured
// PowerShell stdout string, which this repo's own test conventions already
// avoid for exactly this reason (mangled encoding across the PS/native-exe
// boundary; see fetch-runner-network-isolation.test.ps1's stdin-piping
// comments).
async function main() {
  const [, , cmd, ...rest] = process.argv;
  const config = loadConfigFromEnv();

  if (cmd === 'put') {
    const maxBytesArg = rest.find((a) => a.startsWith('--max-bytes='));
    if (maxBytesArg) config.maxBytes = Number(maxBytesArg.split('=')[1]);
    const bytes = await readStdin();
    const result = await putContentAddressedObject(bytes, config);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  if (cmd === 'get') {
    const snapshotRef = rest.find((a) => !a.startsWith('--'));
    const outArg = rest.find((a) => a.startsWith('--out='));
    if (!snapshotRef || !outArg) {
      console.error('usage: object-storage-client.mjs get <snapshot_ref> --out=<path>');
      process.exit(2);
    }
    const fs = await import('node:fs/promises');
    const body = await getContentAddressedObject(snapshotRef, config);
    await fs.writeFile(outArg.split('=')[1], body);
    process.stdout.write(`${JSON.stringify({ bytes: body.length, sha256: sha256Hex(body) })}\n`);
    return;
  }

  console.error('usage: object-storage-client.mjs <put --max-bytes=N | get <snapshot_ref> --out=<path>> (bytes via stdin for put)');
  process.exit(2);
}

// Node's own documented ESM "is this the entry point" idiom (comparing
// argv[1] against a reconstructed file:// string is NOT reliable -- argv[1]
// is not guaranteed absolute the way import.meta.url always is; fileURLToPath
// is the side that needs to move).
const isMainModule = process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  main().catch((err) => {
    if (err && err.code === 'OBJECT_TOO_LARGE') {
      console.error(`REJECTED: ${err.message}`);
      process.exit(3);
    }
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  });
}
