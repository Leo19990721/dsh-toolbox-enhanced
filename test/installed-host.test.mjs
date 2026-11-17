import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('installed Cordis activates original toolbox plus companion with one service owner and unchanged update RPC', async () => {
  const resolve = createRequire(join(process.env.DSH_INSTALL_DIR, 'package.json'));
  const profile = createRequire(join(process.env.DSH_PROFILE_DIR, 'package.json'));
  const { Context } = resolve('@deepseek-ai/cordis');
  const { default: Tools } = await import(pathToFileURL(resolve.resolve('@deepseek-ai/dsh-tools')));
  const { default: SystemPrompt } = await import(pathToFileURL(resolve.resolve('@deepseek-ai/dsh-system-prompt')));
  const { default: Original } = await import(pathToFileURL(profile.resolve('dsh-toolbox-ui')));
  const enhanced = await import('../host.js');
  const ctx = new Context(), states = [];
  let phase = 'setup';
  try {
    const setup = ctx.plugin({ apply(scope) {
      scope.provide('loader', { entries: () => [], import: spec => import(pathToFileURL(resolve.resolve(spec))) });
      scope.provide('configEditor', { entries: () => [] });
      scope.provide('profileContext', { dir: process.env.DSH_PROFILE_DIR });
      scope.provide('sandboxPolicy', { resolve: () => ({ mode: 'danger-full-access' }) });
    } });
    await setup.inertia; states.push(setup);
    phase = 'system prompt';
    const system = ctx.plugin(SystemPrompt); await system.inertia; states.push(system);
    phase = 'tools';
    const tools = ctx.plugin(Tools); await tools.inertia; states.push(tools);
    phase = 'original toolbox';
    const original = ctx.plugin(Original, { toolLoading: { mode: 'all-resident' } }); await original.inertia; states.push(original);
    assert.equal(original.state, 2, 'community toolbox active');
    const service = ctx.get('toolboxMcp')[Symbol.for('cordis.original')], update = service.updateHint, before = service.update;
    assert.equal(typeof service.exportGlobalJson, 'function');
    phase = 'companion';
    const companion = ctx.plugin(enhanced); await companion.inertia; states.push(companion);
    // ctx.inject starts a child fiber and imports the three small original helpers.
    phase = 'companion child fibers';
    await Promise.all([...ctx.registry.values()].flatMap(runtime => [...runtime.fibers].map(fiber => fiber.await())));
    assert.equal(companion.state, 2, 'companion active');
    assert.equal(ctx.get('toolboxMcp')[Symbol.for('cordis.original')], service, 'single original service owner');
    assert.equal(service.updateHint, update, 'original update checker untouched');
    assert.notEqual(service.update, before, 'timeout adapter activated');
    await companion.dispose();
    assert.equal(service.update, before, 'companion unload restores exact original method');
    assert.equal(service.updateHint, update);
  } catch (error) { console.error('Integration phase:', phase, error.stack); throw new Error(phase + ': ' + error.message, { cause: error }); }
  finally {
    for (const fiber of states.reverse()) await fiber.dispose();
  }
});

test('installed browser SlotCore decorates original entries and restores them without changing navigation', async () => {
  const resolve = createRequire(join(process.env.DSH_INSTALL_DIR, 'package.json'));
  const frontend = dirname(resolve.resolve('@deepseek-ai/dsh-web-frontend/package.json'));
  const html = await readFile(join(frontend, 'dist/index.html'), 'utf8');
  const entry = html.match(/src="\.\/assets\/(index-[^"]+\.js)"/)[1];
  const source = await readFile(join(frontend, 'dist/assets', entry), 'utf8');
  const start = source.indexOf('function MN('), end = source.indexOf('const RN=Object.freeze', start);
  assert.ok(start >= 0 && end > start, 'installed 0.2.2-rc.3 registry boundary');
  const SlotCore = vm.runInNewContext(source.slice(start, end) + '; AN', { queueMicrotask });
  const core = new SlotCore(), disposers = [];
  disposers.push(core.register({ name: 'root', children: {
    'sidebar.footer.action': { kind: 'list', scope: 'root' },
    'sidebar.panellist': { kind: 'list', scope: 'root' },
    'shell.overlay': { kind: 'list', scope: 'root' }
  } }, function Root() {}));
  function Footer() {} function Overlay() {}
  disposers.push(core.register({ name: 'sidebar.footer.action', id: 'mcp-manager' }, Footer));
  disposers.push(core.register({ name: 'shell.overlay', id: 'mcp-fab' }, Overlay));
  const footer = core.entries('sidebar.footer.action')[0], overlay = core.entries('shell.overlay')[0];
  const { installClient } = await import('../src/client-shell.js');
  const React = createRequire(process.env.DSH_TEST_REACT_ANCHOR || import.meta.url)('react');
  const layout = { selectPanel(id) { return id; } }, original = layout.selectPanel;
  const ctx = { slots: { entries: name => core.entries(name), subscribe: (name, fn) => core.subscribe(name, fn), register: (...args) => core.register(...args), inject: (_name, run) => run() }, layout };
  const restore = installClient(ctx, React, '', key => key);
  try {
    assert.notEqual(footer.component, Footer);
    assert.notEqual(overlay.component, Overlay);
    assert.equal(core.entries('sidebar.panellist').filter(row => row.options.id === 'local-toolbox').length, 1);
    assert.equal(layout.selectPanel('plugins'), 'plugins');
  } finally {
    restore();
    assert.equal(footer.component, Footer);
    assert.equal(overlay.component, Overlay);
    assert.equal(layout.selectPanel, original);
    assert.equal(core.entries('sidebar.panellist').length, 0);
    for (const dispose of disposers.reverse()) dispose();
  }
});
