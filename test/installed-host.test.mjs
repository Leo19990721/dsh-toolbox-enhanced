import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { compileFunction } from 'node:vm';

const require = createRequire(import.meta.url);
const resolve = createRequire(join(process.env.DSH_INSTALL_DIR, 'package.json'));
const upstreamManifest = process.env.DSH_TEST_TOOLBOX_MANIFEST || require.resolve('dsh-toolbox-ui/package.json');
const upstream = JSON.parse(await readFile(upstreamManifest, 'utf8'));
const upstreamRoot = pathToFileURL(upstreamManifest);
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(upstream.name, 'dsh-toolbox-ui');
assert.ok(['1.12.0', '1.12.1'].includes(upstream.version), 'test a supported published toolbox version');

test('installed DSH version gate admits the minimum and newer versions without exemptions', async () => {
  const { evaluatePluginCompatibility, getDshRuntimeVersion } = await import('@deepseek-ai/dsh-app-boot');
  const installed = JSON.parse(await readFile(join(process.env.DSH_INSTALL_DIR, 'package.json'), 'utf8'));
  assert.equal(getDshRuntimeVersion(), installed.version);
  assert.equal(evaluatePluginCompatibility(manifest), undefined, `installed DSH ${installed.version}`);
  assert.equal(evaluatePluginCompatibility(upstream), undefined, `upstream ${upstream.version} on DSH ${installed.version}`);
  for (const version of [
    '0.2.2-rc.3', '0.2.2-rc.5', '0.2.2', '0.2.9-rc.1', '0.2.9',
    '0.3.0-0', '0.3.0-rc.1', '0.3.0', '0.4.0-beta.1', '1.0.0', '2.0.0-rc.1',
  ]) {
    assert.equal(evaluatePluginCompatibility(manifest, {}, version), undefined, version);
  }
  for (const version of ['0.2.1', '0.2.2-rc.2']) {
    assert.deepEqual(evaluatePluginCompatibility(manifest, {}, version), {
      name: manifest.name, version: manifest.version, runtimeVersion: version,
      requirements: { 'engines.dsh': '>=0.2.2-rc.3' }, exempted: false,
    }, version);
  }
  const upstreamIssue = evaluatePluginCompatibility(upstream, {}, '0.3.0');
  assert.deepEqual(upstreamIssue?.requirements, { 'engines.dsh': '>=0.2.1-rc.5 <0.3.0' });
  assert.equal(upstreamIssue?.exempted, false, `upstream ${upstream.version} retains its own requirement`);
});

test(`installed Host runs original toolbox ${upstream.version} and the companion on an isolated fixture`, { timeout: 15_000 }, async () => {
  const { Context } = await import('@deepseek-ai/cordis');
  const { Loader } = await import('@deepseek-ai/cordis-plugin-loader');
  const { default: Tools } = await import('@deepseek-ai/dsh-tools');
  const { default: SystemPrompt } = await import('@deepseek-ai/dsh-system-prompt');
  const { default: SessionProjection } = await import('@deepseek-ai/dsh-session-projection');
  const { default: SandboxPolicy } = await import('@deepseek-ai/dsh-sandbox-policy');
  const { scopeTarget } = await import('@deepseek-ai/dsh-scope');
  const { default: Original } = await import(new URL(upstream.exports['.'], upstreamRoot));
  const enhanced = await import('../host.js');
  const ctx = new Context(), states = [];
  const work = await mkdtemp(join(tmpdir(), 'dsh-toolbox-host-test-'));
  const patch = join(work, 'cordis.patch.yml');
  const raw = {
    serverName: 'fixture-timeout', transport: 'stdio', command: 'fixture-never-executed',
    env: { DEMO: { __jsExpr: 'process.env.DEMO' } }, startupTimeoutMs: 60000,
  };
  const before = `- insert:
    - id: timeout-fixture
      name: '@deepseek-ai/dsh-mcp-client'
      disabled: true
      config:
        serverName: fixture-timeout
        transport: stdio
        command: fixture-never-executed
        env:
          DEMO: !!js 'process.env.DEMO'
        startupTimeoutMs: 60000
    - id: ordinary-fixture
      name: '@deepseek-ai/dsh-mcp-client'
      disabled: true
      config:
        serverName: fixture-ordinary
        transport: stdio
        command: fixture-never-executed
`;
  async function mount(plugin, config) {
    const fiber = ctx.plugin(plugin, config);
    states.push(fiber);
    await fiber.inertia;
    assert.equal(fiber.state, 2, `active: ${plugin.name || plugin.default?.name || '<anonymous>'}`);
    return fiber;
  }
  try {
    await writeFile(patch, before, { flag: 'wx' });
    await mount(Loader);
    // These real Loader entries stay disabled: no MCP process, connection or profile boot.
    await ctx.loader.root.update([
      { id: 'include', name: 'cordis:include', disabled: true, config: { path: join(work, 'fixture-base.yml') } },
      { id: 'timeout-fixture', name: '@deepseek-ai/dsh-mcp-client', disabled: true, config: raw },
      { id: 'ordinary-fixture', name: '@deepseek-ai/dsh-mcp-client', disabled: true, config: { serverName: 'fixture-ordinary', transport: 'stdio', command: 'fixture-never-executed' } },
    ]);
    await mount(SystemPrompt);
    await mount(SessionProjection);
    await mount(SandboxPolicy, { mode: 'danger-full-access', workspaceRoot: work });
    await mount(Tools);
    await mount(Original, { toolLoading: { mode: 'all-resident' } });
    const service = ctx.get('toolboxMcp')[Symbol.for('cordis.original')];
    const { update: originalUpdate, exportGlobalJson: originalExport, updateHint: originalUpdateHint } = service;
    const companion = await mount(enhanced);
    await Promise.all([...ctx.registry.values()].flatMap(registration => [...registration.fibers].map(fiber => fiber.await())));
    assert.equal(ctx.get('toolboxMcp')[Symbol.for('cordis.original')], service, 'one original service owner');
    assert.equal(service.updateHint, originalUpdateHint, 'original update checker untouched');
    assert.notEqual(service.update, originalUpdate, 'timeout adapter activated');
    assert.notEqual(service.exportGlobalJson, originalExport, 'timeout export adapter activated');
    await assert.rejects(service.update({ name: 'fixture-timeout', transport: 'stdio', command: 'never-save' }), { code: 'TOOLBOX_STARTUP_TIMEOUT_EDIT_UNSUPPORTED' });
    assert.equal(await readFile(patch, 'utf8'), before, 'rejection leaves the fixture bytes unchanged');
    assert.deepEqual(ctx.loader.resolve('timeout-fixture').options.config.env, raw.env, 'raw expressions preserved');
    const exported = JSON.parse((await service.exportGlobalJson()).json);
    assert.equal(exported.mcpServers['fixture-timeout'].startupTimeoutMs, 60000);
    assert.equal(exported.mcpServers['fixture-ordinary'].startupTimeoutMs, undefined);
    const saved = await service.update({ name: 'fixture-ordinary', transport: 'stdio', command: 'fixture-never-executed', args: ['saved-in-fixture'], disabled: true });
    assert.equal(saved.persisted, 'applied', 'ordinary edit still uses the original toolbox');
    assert.match(await readFile(patch, 'utf8'), /saved-in-fixture/);
    const decision = (name, args) => ctx.waterfall(scopeTarget(ctx.tools, undefined), 'tools/pre-execute', { name, arguments: args }, async () => ({ kind: 'allow' }));
    assert.equal((await decision('mcp__leo-env__pm2_control', { action: 'restart' })).kind, 'ask');
    assert.equal((await decision('mcp__leo-env__pm2_control', { action: 'list' })).kind, 'allow');
    assert.ok(ctx.tools.checkGuards({ name: 'mcp__leo-env__fixture-unlisted', arguments: {} }));
    await companion.dispose();
    assert.equal(service.update, originalUpdate, 'unload restores exact original update');
    assert.equal(service.exportGlobalJson, originalExport, 'unload restores exact original export');
    assert.equal(service.updateHint, originalUpdateHint);
    assert.equal((await decision('mcp__leo-env__pm2_control', { action: 'restart' })).kind, 'allow');
    assert.equal(ctx.tools.checkGuards({ name: 'mcp__leo-env__fixture-unlisted', arguments: {} }), undefined);
  } finally {
    try { for (const fiber of states.reverse()) await fiber.dispose(); }
    finally { await rm(work, { recursive: true, force: true }); }
  }
});

// The pure SlotCore module is embedded in the installed frontend. Select by its
// stable export names, rather than by minified function or asset identifiers.
async function installedSlotCore() {
  const frontend = dirname(resolve.resolve('@deepseek-ai/dsh-web-frontend/package.json'));
  const html = await readFile(join(frontend, 'dist', 'index.html'), 'utf8');
  const entry = html.match(/src="\.\/assets\/(index-[^"/]+\.js)"/)?.[1];
  assert.ok(entry, 'installed frontend asset');
  const source = await readFile(join(frontend, 'dist', 'assets', entry), 'utf8');
  const exported = /\bconst [\w$]+=Object\.freeze\(Object\.defineProperty\(\{__proto__:null,SlotCore:([\w$]+),SlotOwnershipError:[\w$]+,StaleAuthorizationError:[\w$]+,resolveSlotLabel:[\w$]+,standardHookPropName:([\w$]+)\}/.exec(source);
  assert.ok(exported, 'installed frontend pure SlotCore export');
  const [, klass, hook] = exported;
  const start = source.lastIndexOf(`function ${hook}(`, exported.index);
  assert.ok(start >= 0, 'installed frontend pure SlotCore module start');
  return compileFunction(`${source.slice(start, exported.index)};return ${klass}`, ['queueMicrotask'])(queueMicrotask);
}

async function registeredFactory(url, id, React) {
  // Read the factory declared by the shipped module, without loading a browser or supplying DOM objects.
  const source = await readFile(url, 'utf8');
  const prefix = /^window\.__ModuleLoader__\.load\(/.exec(source);
  assert.ok(prefix, `client factory wrapper: ${id}`);
  const registration = compileFunction(`return (${source.slice(prefix[0].length).trimEnd().replace(/\);$/, '')});`, [])();
  assert.equal(registration?.id, id);
  return registration.factory(name => {
    assert.equal(name, 'react');
    return React;
  });
}

test(`installed frontend SlotCore decorates actual toolbox ${upstream.version} registrations and restores them`, async () => {
  const Core = await installedSlotCore();
  const React = require('react');
  const original = await registeredFactory(new URL(upstream.exports['./client'], upstreamRoot), upstream.name, React);
  const companion = await registeredFactory(new URL('../client.js', import.meta.url), manifest.name, React);
  const core = new Core();
  const disposeRoot = core.register({ name: 'root', children: {
    'sidebar.footer.action': { kind: 'list', scope: 'root' },
    'sidebar.panellist': { kind: 'list', scope: 'root' },
    'shell.overlay': { kind: 'list', scope: 'root' },
  } }, () => null);
  const effects = [], mounts = [];
  const slots = {
    entries: name => core.entries(name),
    subscribe: (name, fn) => core.subscribe(name, fn),
    register: (...args) => core.register(...args),
    inject(name, run) { assert.ok(core.spec(name), `declared slot: ${name}`); return run(); },
  };
  const selectPanel = id => id;
  const layout = { selectPanel };
  const locale = { register: () => () => {}, bind: () => key => key };
  const upstreamContext = {
    slots, get: () => undefined,
    remote: { async $mount(contract) { mounts.push(contract); return () => mounts.pop(); } },
  };
  const restoreOriginal = await original.apply(upstreamContext);
  try {
    const [footer] = core.entries('sidebar.footer.action');
    const [overlay] = core.entries('shell.overlay');
    assert.equal(footer.options.id, 'mcp-manager');
    assert.equal(overlay.options.id, 'mcp-fab');
    assert.ok(mounts[0].descriptors.some(row => row.namespace === 'toolboxMcp'));
    const originals = [footer.component, overlay.component];
    const removeEnhanced = companion.apply({ slots, layout, get: () => locale, effect: run => effects.push(run()) });
    try {
      assert.notEqual(footer.component, originals[0]);
      assert.notEqual(overlay.component, originals[1]);
      assert.equal(core.entries('sidebar.panellist').filter(entry => entry.options.id === 'local-toolbox').length, 1);
      assert.equal(core.entries('shell.overlay').filter(entry => entry.options.id === `${manifest.name}/style`).length, 1);
      assert.equal(layout.selectPanel('plugins'), 'plugins');
      assert.equal(mounts.length, 1, 'the companion does not mount a second upstream RPC');
    } finally { removeEnhanced(); }
    assert.equal(footer.component, originals[0]);
    assert.equal(overlay.component, originals[1]);
    assert.equal(layout.selectPanel, selectPanel);
    assert.equal(core.entries('sidebar.panellist').length, 0);
    assert.equal(core.entries('shell.overlay').length, 1);
  } finally {
    for (const dispose of effects.reverse()) dispose();
    await restoreOriginal();
    disposeRoot();
  }
});
