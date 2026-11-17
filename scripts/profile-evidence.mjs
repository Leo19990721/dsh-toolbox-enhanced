// Optional local migration evidence: hashes/counts only, never secret values.
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
if (!process.env.DSH_PROFILE_DIR) throw new Error('Run inside a DSH profile');
const profile = createRequire(join(process.env.DSH_PROFILE_DIR, 'package.json'));
const toolbox = createRequire(profile.resolve('dsh-toolbox-ui/package.json'));
const { parseDocument } = toolbox('yaml');
const hash = data => createHash('sha256').update(data).digest('hex');
const output = process.argv[2];
if (!output) throw new Error('Pass an evidence JSON path');
const doc = parseDocument(await readFile(join(process.env.DSH_PROFILE_DIR, 'cordis.patch.yml'), 'utf8'), { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => ({ __jsExpr: value }) }] });
if (doc.errors.length) throw doc.errors[0];
const patch = doc.toJS(), rows = patch.flatMap(row => row.insert || []);
const mcps = rows.filter(row => row.name === '@deepseek-ai/dsh-mcp-client').map(row => ({ id: row.id, name: row.config.serverName, configHash: hash(JSON.stringify(row.config)), enabled: !row.disabled })).sort((a,b) => a.name.localeCompare(b.name));
const skills = [];
async function visit(dir, relative = '') { for (const entry of await readdir(dir, { withFileTypes: true })) { const file = join(dir, entry.name), name = relative + '/' + entry.name; if (entry.isDirectory()) await visit(file, name); else if (entry.isFile()) skills.push([name, hash(await readFile(file))]); } }
await visit(join(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'), 'skills/user'));
skills.sort(([a],[b]) => a.localeCompare(b));
const value = { time: new Date().toISOString(), mcps, skills: { fileCount: skills.length, treeHash: hash(JSON.stringify(skills)) }, policyHash: hash(await readFile(new URL('../lib/local-policy.js', import.meta.url))), remoteConfigHash: hash(JSON.stringify(patch.find(row => row.id === 'ds-harness-remote'))), toolboxOriginalConfig: patch.find(row => row.id === 'mcp-manager-ui')?.config };
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(value, null, 2) + '\n');
console.log(JSON.stringify(value, null, 2));
if (process.argv[3]) {
  const before = JSON.parse(await readFile(process.argv[3], 'utf8'));
  for (const key of ['mcps', 'skills', 'policyHash', 'remoteConfigHash', 'toolboxOriginalConfig']) if (JSON.stringify(before[key]) !== JSON.stringify(value[key])) throw new Error('Preserved state changed: ' + key);
  console.log('PASS preserved MCP configurations, skill files, policy and Remote configuration.');
}
