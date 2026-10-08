// npm audit of shipped dependencies that fails on any high or critical advisory
// not listed in scripts/audit-allowlist.json (advisories with no fix yet).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const FAIL_ON = new Set(['high', 'critical']);
const allowed = JSON.parse(readFileSync(new URL('./audit-allowlist.json', import.meta.url), 'utf8')).advisories;

let output;
try {
  output = execFileSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (error) {
  // npm audit exits non-zero when it finds anything; the report is still on stdout.
  output = error.stdout;
  if (!output) throw error;
}
const report = JSON.parse(output);
if (report.error) throw new Error(`npm audit failed: ${JSON.stringify(report.error)}`);

const advisories = new Map();
for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via) {
    if (typeof via === 'object') advisories.set(via.url.split('/').pop(), via);
  }
}

const blocking = [...advisories].filter(([id, a]) => FAIL_ON.has(a.severity) && !(id in allowed));
const allowedSeen = [...advisories.keys()].filter((id) => id in allowed);
const stale = Object.keys(allowed).filter((id) => !advisories.has(id));

for (const id of allowedSeen) console.log(`allowed  ${id}  ${allowed[id]}`);
for (const id of stale) console.log(`note     ${id} is no longer reported: remove it from scripts/audit-allowlist.json`);
for (const [id, a] of blocking) console.log(`BLOCKING ${id}  ${a.severity}  ${a.name}: ${a.title}`);
console.log(`${advisories.size} advisories, ${blocking.length} blocking (high or critical, not allowed)`);
process.exit(blocking.length > 0 ? 1 : 0);
