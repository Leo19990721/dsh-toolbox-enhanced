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
  assert.equal(pkg.engines.dsh, '>=0.2.2-rc.3');
  assert.equal(pkg.peerDependencies['dsh-toolbox-ui'], '>=1.12.0 <=1.12.1');
  assert.equal(pkg.private, true, 'release the .tgz through GitHub, not npm');
  for (const file of ['README.md', 'NOTICE', 'host.js', 'scripts/pack.ps1']) assert.doesNotMatch(await readFile(new URL(file, root), 'utf8'), /[CE]:[\\/](?:Users|Personal|AI)/);
});

test('packed release contains only redistributable runtime files and no account or workspace data', { skip: !process.env.RELEASE_TGZ && 'run against the packed release with RELEASE_TGZ' }, async () => {
  const { gunzipSync } = await import('node:zlib');
  const tar = gunzipSync(await readFile(process.env.RELEASE_TGZ));
  const expected = [
    'LICENSE', 'NOTICE', 'README.md', 'client.js', 'cordis.patch.yml', 'host.js', 'icon.svg',
    'lib/local-policy.js', 'locale/en.json', 'locale/zh.json', 'package.json', 'src/client-shell.js', 'src/startup-timeout.js',
  ].map(name => `package/${name}`).sort();
  const names = [];
  for (let at = 0; at + 512 <= tar.length;) {
    const name = tar.subarray(at, at + 100).toString().replace(/\0.*$/s, '');
    if (!name) break;
    assert.ok(expected.includes(name), `unexpected packed path: ${name}`);
    assert.ok([0, 48].includes(tar[at + 156]), `expected regular file: ${name}`);
    const size = parseInt(tar.subarray(at + 124, at + 136).toString().replace(/\0.*$/s, '').trim(), 8);
    assert.ok(Number.isSafeInteger(size) && size >= 0 && at + 512 + size <= tar.length);
    const body = tar.subarray(at + 512, at + 512 + size);
    const isPrivateContent = /[A-Z]:[\\/](?:Users|Personal|AI|个人|公司)\b|(?:^|\n)\s*(?:api[_-]?key|access[_-]?token|password|client[_-]?secret)\s*[:=]\s*["']?[^\n"']{10,}|-----BEGIN (?:\w+ )*PRIVATE KEY-----/i;
    assert.equal(isPrivateContent.test(body.toString('utf8')), false, `possible private content in ${name}`);
    if (name === 'package/package.json') {
      const packed = JSON.parse(body);
      const source = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
      for (const key of ['name', 'version', 'private', 'engines', 'peerDependencies', 'dsh', 'exports', 'license']) assert.deepEqual(packed[key], source[key], key);
      assert.ok(!['preinstall', 'install', 'postinstall', 'prepare'].some(key => packed.scripts?.[key] !== undefined));
    } else {
      assert.deepEqual(body, await readFile(new URL(name.slice('package/'.length), root)), `archive bytes: ${name}`);
    }
    names.push(name);
    at += 512 + Math.ceil(size / 512) * 512;
  }
  assert.deepEqual(names.sort(), expected, 'exact public runtime file list');
});
