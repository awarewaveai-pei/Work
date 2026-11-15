// Every status report (*-LATEST.md/.json/.txt under agency-os/reports) is written through scripts/lib/repo-text.ps1
// Write-RepoTextFile: LF, BOM state preserved. Raw Set-Content / Out-File / WriteAllText writers emitted CRLF into an
// `eol=lf` tree, and git then reported those files modified on size alone (2026-11-15: 166 such "phantoms" in D:\Work,
// one of them in every upstream change set, kept the checkout 126 commits behind). The helper has existed since
// 2026-10-03 for exactly this; the invariant is that no script bypasses it for a report path.
// Run: node --test tests/hooks/repo-text-writers.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './helpers.mjs';

const SCRIPTS = path.join(REPO_ROOT, 'scripts');
// every way PowerShell / .NET puts bytes into a file with its own newline convention, plus a `>` redirect
// (a `>`/`>>` redirect to a $path variable: preceded by whitespace or `)`, so `->` in a message and `2>$null` /
// `2>&1` stream redirects are not writes)
const RAW_WRITER = /\b(Set-Content|Out-File|Add-Content|Export-Csv|Export-Clixml|Tee-Object|WriteAllText|WriteAllLines|WriteAllBytes|AppendAllText|AppendAllLines|StreamWriter)\b|[\s)]>>?\s*["']?\$(?!null\b)/i;
// a report path: a *-LATEST file, or anything built from the conventional report directories (dated siblings included)
const REPORT = /-LATEST\.(md|json|txt)\b|\$(reportDir|statusDir|reportsDir)\b/i;

function ps1Files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : ps1Files(full);
    // scripts/test-*.ps1 are test harnesses writing fixtures (e.g. a deliberately broken *-LATEST.json) into temp dirs
    return e.name.endsWith('.ps1') && !/^test-/.test(e.name) ? [full] : [];
  });
}

const files = ps1Files(SCRIPTS);
const rel = (f) => path.relative(REPO_ROOT, f).replace(/\\/g, '/');

test('scans the scripts tree', () => {
  assert.ok(files.length > 50, `only ${files.length} .ps1 files found`);
});

test('no *-LATEST report is written with a raw writer (literal path, or a variable assigned from one)', () => {
  const bad = [];
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
    // `$latestPath = Join-Path $dir "x-LATEST.md"` ... `WriteAllText($latestPath, ...)`: the writer line itself names no report
    // ... and `$oracleDir = Join-Path $root 'agency-os\reports\oracle'` ... `$artifact = Join-Path $oracleDir ...`: a path
    // variable is one assigned from a report marker or from another path variable, followed to a fixpoint
    const vars = new Set();
    for (let grew = true; grew;) {
      grew = false;
      for (const line of lines) {
        const m = /^\s*\$(\w+)\s*=(.*)$/.exec(line);
        if (!m || vars.has(m[1])) continue;
        const rhs = m[2];
        // propagate only through a path construction (Join-Path $v ... / "$v\..."), not through any string that mentions
        // the variable (a header or message built from a path is not a path)
        const fromVar = [...vars].some((v) => new RegExp(`Join-Path\\s+\\$${v}\\b|^\\s*["']?\\$${v}[\\\\/]`, 'i').test(rhs));
        if (REPORT.test(rhs) || /agency-os[\\/]reports|reports[\\/](oracle|status|governance)/i.test(rhs) || fromVar) { vars.add(m[1]); grew = true; }
      }
    }
    const viaVar = vars.size ? new RegExp(`\\$(${[...vars].join('|')})\\b`, 'i') : null;   // PowerShell variable names are case-insensitive
    lines.forEach((line, i) => {
      if (/^\s*#/.test(line) || !RAW_WRITER.test(line)) return;
      if (REPORT.test(line) || (viaVar && viaVar.test(line))) bad.push(`${rel(f)}:${i + 1}: ${line.trim().slice(0, 110)}`);
    });
  }
  assert.deepEqual(bad, [], 'use Write-RepoTextFile (scripts/lib/repo-text.ps1)');
});

test('every script that calls Write-RepoTextFile loads repo-text.ps1 (directly or through _detector-contract.ps1)', () => {
  const bad = [];
  for (const f of files) {
    if (rel(f) === 'scripts/lib/repo-text.ps1') continue;
    const text = fs.readFileSync(f, 'utf8');
    if (!/^[^#\r\n]*\bWrite-RepoTextFile\s+-Path\b/m.test(text)) continue;   // a call, not a comment or message naming it
    // a real dot-source line, not a comment that names the file
    if (!/^\s*\.\s+\(?[^#\r\n]*(repo-text|_detector-contract)\.ps1/m.test(text)) bad.push(rel(f));
  }
  assert.deepEqual(bad, []);
});
