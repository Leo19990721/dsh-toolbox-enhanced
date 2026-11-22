import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const root = new URL('../', import.meta.url);
const load = name => import(new URL('../src/' + name, import.meta.url));

test('companion ships no copied toolbox backend or UI bundle', async () => {
  const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  assert.equal(pkg.name, '@local/dsh-toolbox-enhanced');
  assert.ok(!pkg.files.includes('lib'));
  assert.equal(pkg.exports['./client'], './client.js');
});

test('timeout-bearing edits fail before any write and preserve raw expressions and connection values', async () => {
  const { installStartupTimeout } = await load('startup-timeout.js');
  const raw = { serverName: 'example', transport: 'stdio', command: 'node', args: ['synthetic'], env: { DEMO: { __jsExpr: 'process.env.DEMO' } }, startupTimeoutMs: 60000 };
  const entry = { options: { name: '@deepseek-ai/dsh-mcp-client', config: raw } };
  const before = structuredClone(raw);
  let writes = 0;
  const service = { update: async () => { writes++; } };
  const ctx = { loader: { entries: () => [entry] }, configEditor: { entries: () => [entry], edit: async (_entry, change) => { writes++; Object.assign(raw, change(raw)); } } };
  const dispose = installStartupTimeout(service, ctx);
  try {
    await assert.rejects(service.update({ name: 'example', transport: 'stdio', command: 'changed', env: { DEMO: '__DSH_MCP_REDACTED__' } }), error => error.code === 'TOOLBOX_STARTUP_TIMEOUT_EDIT_UNSUPPORTED' && /原生配置编辑/.test(error.message));
    assert.equal(writes, 0, 'neither upstream persistence nor native override writing runs');
    assert.deepEqual(raw, before, 'raw expression objects never pass through String(raw)');
  } finally { dispose(); }
});

test('a new explicit startup timeout is rejected even without a matching loader row', async () => {
  const { installStartupTimeout } = await load('startup-timeout.js');
  let writes = 0;
  const service = { update: async () => { writes++; } };
  const dispose = installStartupTimeout(service, { loader: { entries: () => [] } });
  try {
    await assert.rejects(service.update({ name: 'new', startupTimeoutMs: 45000 }), { code: 'TOOLBOX_STARTUP_TIMEOUT_EDIT_UNSUPPORTED' });
    assert.equal(writes, 0);
  } finally { dispose(); }
});

const reactRequire = createRequire(process.env.DSH_TEST_REACT_ANCHOR || import.meta.url);
const React = reactRequire('react');
const h = React.createElement;
function tabTree() {
  const ability = h('div', { className: 'dsh-mcp-seg' }, h('button', { 'aria-selected': true }, 'MCP'));
  const head = h('div', { className: 'dsh-mcp-head' }, h('div', { className: 'dsh-mcp-title' }, '扩展中心'), ability, h('div', { className: 'dsh-mcp-head-actions' }, h('button', {}, '添加'), h(function EntryMenu() {}, {})), h('button', {}, '关闭'));
  return h('div', { className: 'dsh-mcp-panel-overlay' }, h('div', { className: 'dsh-mcp-panel', role: 'dialog' }, h('div', { className: 'dsh-mcp-wrap' }, head, h('div', { id: 'live-content' }, 'original body'))));
}
function find(node, predicate) { if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean); if (!node || typeof node !== 'object') return; return predicate(node) ? node : find(node.props?.children, predicate); }
test('native shell retains original controls, content and window geometry without copying components', async () => {
  const { enhancePanel } = await load('client-shell.js');
  const original = tabTree(), body = find(original, n => n.props.id === 'live-content');
  const enhanced = enhancePanel(original, React, () => {}, key => key);
  assert.ok(find(enhanced, n => n.props.className === 'dsh-mcp-native-columns'));
  assert.equal(find(enhanced, n => n.props.id === 'live-content'), body);
  assert.equal(find(enhanced, n => n.props.className === 'dsh-mcp-panel').props.role, 'dialog');
  assert.equal(find(enhanced, n => n.type === 'h2').props.children, 'sidebarLabel');
  assert.equal(find(enhanced, n => n.type?.name === 'EntryMenu'), undefined);
});
test('a recognised overlay with an unfamiliar panel structure remains untouched', async () => {
  const { enhancePanel } = await load('client-shell.js');
  const node = h('div', { className: 'dsh-mcp-panel-overlay' },
    h('div', { className: 'dsh-mcp-panel' }, h('div', { className: 'dsh-mcp-wrap' }, 'new upstream layout')));
  assert.equal(enhancePanel(node, React, () => {}, key => key), node);
});
test('original update checker detects a newer community release and caches only the original package', async () => {
  const require = createRequire(import.meta.url);
  const manifest = process.env.DSH_TEST_TOOLBOX_MANIFEST || require.resolve('dsh-toolbox-ui/package.json');
  const base = pathToFileURL(manifest);
  const { checkForUpdate } = await import(new URL('./lib/update-hint.js', base));
  const { version } = JSON.parse(await readFile(base, 'utf8'));
  const latest = `${Number(version.split('.')[0]) + 1}.0.0`;
  const before = globalThis.fetch, calls = [];
  globalThis.fetch = async url => { calls.push(url); return { ok: true, json: async () => ({ version: latest }) }; };
  try {
    const result = await checkForUpdate(Date.now(), true);
    assert.equal(result.current, version); assert.equal(result.latest, latest); assert.equal(result.updateAvailable, true);
    assert.equal(calls[0], 'https://registry.npmjs.org/dsh-toolbox-ui/latest');
    assert.deepEqual(await checkForUpdate(), result); assert.equal(calls.length, 1);
  } finally { globalThis.fetch = before; }
});

test('ordinary edits retain original arguments and result; timeout export and unload remain reversible', async () => {
  const { installStartupTimeout } = await load('startup-timeout.js');
  const entry = { options: { name: '@deepseek-ai/dsh-mcp-client', id: 'custom-not-assumed', config: { serverName: 'example', startupTimeoutMs: 60000 } } };
  const calls = [], result = { persisted: 'applied', live: 'skipped', liveReason: 'synthetic' };
  const service = { update: async function(...args) { calls.push({ owner: this, args }); return result; }, exportGlobalJson: async () => ({ count: 1, json: JSON.stringify({ mcpServers: { example: { command: 'node' } } }) }), updateHint: async () => 'original update' };
  const original = Object.getOwnPropertyDescriptors(service);
  const dispose = installStartupTimeout(service, { loader: { entries: () => [entry] } });
  assert.equal(service.updateHint, original.updateHint.value);
  const spec = { name: 'ordinary', transport: 'stdio', command: 'node' }, signal = new AbortController().signal;
  assert.equal(await service.update(spec, signal), result, 'do not fabricate success');
  assert.equal(calls[0].owner, service);
  assert.deepEqual(calls[0].args, [spec, signal]);
  const exported = await service.exportGlobalJson();
  assert.equal(exported.count, 1);
  assert.deepEqual(JSON.parse(exported.json).mcpServers.example, { command: 'node', startupTimeoutMs: 60000 });
  dispose();
  assert.deepEqual(Object.getOwnPropertyDescriptors(service), original);
});

test('the timeout adapter leaves unavailable upstream methods alone', async () => {
  const { installStartupTimeout } = await load('startup-timeout.js');
  const service = { update: null, updateHint: async () => 'original update' };
  const before = Object.getOwnPropertyDescriptors(service);
  const dispose = installStartupTimeout(service, {});
  assert.deepEqual(Object.getOwnPropertyDescriptors(service), before);
  dispose();
  assert.deepEqual(Object.getOwnPropertyDescriptors(service), before);
});

test('local safety policy allows workspace-write Playwright with approval while blocking read-only Playwright', async () => {
  const { toolDenial, needsSideEffectApproval, sideEffectApprovalReason } = await import(new URL('lib/local-policy.js', root));
  assert.ok(toolDenial('mcp__playwright__browser_snapshot', 'read-only'));
  assert.equal(toolDenial('mcp__playwright__browser_snapshot', 'workspace-write'), undefined);
  assert.equal(needsSideEffectApproval('mcp__playwright__browser_snapshot', {}, 'workspace-write'), true);
  assert.ok(sideEffectApprovalReason('mcp__playwright__browser_snapshot', {}, 'workspace-write'));
  assert.equal(needsSideEffectApproval('mcp__playwright__browser_snapshot', {}, 'danger-full-access'), false);
  assert.equal(toolDenial('mcp__knowledge__future_tool', 'workspace-write'), undefined);
  assert.equal(toolDenial('mcp__custom__anything', 'read-only'), undefined);
});

test('slot decoration restores original registrations exactly and keeps upstream update RPC', async () => {
  const { installClient } = await load('client-shell.js');
  const registrations = [], effects = [], listeners = new Map();
  function Footer() {} function Overlay() {}
  const footer = { options: { id: 'mcp-manager' }, component: Footer }, overlay = { options: { id: 'mcp-fab' }, component: Overlay };
  const entries = { 'sidebar.footer.action': [footer], 'shell.overlay': [overlay] };
  const originalSelect = () => 'forwarded';
  const ctx = { slots: { entries: key => entries[key] || [], inject: (_key, run) => run(), subscribe: (key, fn) => { listeners.set(key, fn); return () => listeners.delete(key); }, register: (options, component) => { registrations.push({ options, component }); return () => {}; } }, layout: { selectPanel: originalSelect }, effect: fn => { const dispose = fn(); effects.push(dispose); return dispose; } };
  const dispose = installClient(ctx, React, '', key => key);
  assert.notEqual(footer.component, Footer); assert.notEqual(overlay.component, Overlay);
  assert.equal(registrations.find(row => row.options.name === 'sidebar.panellist')?.options.label(), 'sidebarLabel');
  dispose();
  assert.equal(footer.component, Footer); assert.equal(overlay.component, Overlay); assert.equal(ctx.layout.selectPanel, originalSelect); assert.equal(listeners.size, 0);
});
