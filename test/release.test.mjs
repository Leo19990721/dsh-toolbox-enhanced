import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { interpolate } from '@deepseek-ai/cordis-plugin-loader';
const require = createRequire(import.meta.url);
const toolbox = createRequire(require.resolve('dsh-toolbox-ui/package.json'));
const { parseDocument } = toolbox('yaml');
const root = new URL('../', import.meta.url);

test('portable bundle resolves its skill root through DSH instead of a computer-specific path', async () => {
  const patch = await readFile(new URL('cordis.patch.yml', root), 'utf8');
  assert.doesNotMatch(patch, /[CE]:[\\/]|Users[\\/]|Leo/);
  const document = parseDocument(patch, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: expression => ({ __jsExpr: expression }) }] });
  assert.equal(document.errors.length, 0);
  const provider = document.toJS()[0].insert[0];
  assert.equal(provider.config.providerName, 'native-toolbox-user');
  assert.equal(provider.config.includeDefaultRoots, false);
  for (const home of ['Z:/Other User/DSH', '/srv/dsh-test']) {
    const config = interpolate({ dshHomePath: (...parts) => [home, ...parts].join('/') }, provider.config);
    assert.deepEqual(config.customSkillDirs, [home + '/skills/user']);
  }
});

test('release metadata names this enhancement and records tested DSH compatibility', async () => {
  const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  assert.equal(pkg.name, '@local/dsh-toolbox-enhanced', 'preserve installed identity');
  assert.match(pkg.repository.url, /github\.com\/Leo19990721\/dsh-toolbox-enhanced/);
  assert.equal(pkg.engines.dsh, '0.2.2-rc.3');
  assert.equal(pkg.peerDependencies['dsh-toolbox-ui'], '1.12.0');
  for (const file of ['README.md', 'NOTICE', 'host.js', 'scripts/pack.ps1']) assert.doesNotMatch(await readFile(new URL(file, root), 'utf8'), /[CE]:[\\/](?:Users|Personal|AI)/);
});

test('packed release contains only redistributable runtime files and no account or workspace data', { skip: !process.env.RELEASE_TGZ && 'run against the packed release with RELEASE_TGZ' }, async () => {
  const { gunzipSync } = await import('node:zlib');
  const tar = gunzipSync(await readFile(process.env.RELEASE_TGZ));
  const names = [];
  for (let at = 0; at + 512 <= tar.length;) {
    const name = tar.subarray(at, at + 100).toString().replace(/\0.*$/s, '');
    if (!name) break;
    const size = parseInt(tar.subarray(at + 124, at + 136).toString().replace(/\0.*$/s, '').trim(), 8) || 0;
    const body = tar.subarray(at + 512, at + 512 + size).toString();
    names.push(name);
    assert.doesNotMatch(name, /(?:node_modules|\.git|accounts|credentials|sessions|\.env)(?:\/|$)/);
    assert.doesNotMatch(body, /[CE]:[\\/](?:Users|Personal|AI)|01a1d0eb-00b2/);
    at += 512 + Math.ceil(size / 512) * 512;
  }
  assert.ok(names.includes('package/LICENSE'));
  assert.ok(names.includes('package/NOTICE'));
  assert.ok(!names.some(name => name.startsWith('package/lib/') && name !== 'package/lib/local-policy.js'));
});
