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
  assert.equal(pkg.peerDependencies['dsh-toolbox-ui'], '1.12.0');
  assert.ok(!pkg.files.includes('lib'));
  assert.equal(pkg.exports['./client'], './client.js');
});

test('existing startup timeout survives edits; original validation and redaction restoration are reused', async () => {
  const { prepareEdit } = await load('startup-timeout.js');
  const require = createRequire(process.env.DSH_PROFILE_DIR ? process.env.DSH_PROFILE_DIR + '/package.json' : import.meta.url);
  const upstream = new URL('./lib/', pathToFileURL(require.resolve('dsh-toolbox-ui/package.json')));
  const { normalizeMcpImport } = await import(new URL('mcp-config.js', upstream));
  const { restoreRedactedSpec } = await import(new URL('mcp-projection.js', upstream));
  const { toMcpClientConfig } = await import(new URL('workspace-config.js', upstream));
  const original = { serverName: 'example', transport: 'stdio', command: 'node', args: ['secret'], startupTimeoutMs: 60000, toolCallTimeoutMs: 120000, failOnStartupError: false };
  const next = prepareEdit({ name: 'example', transport: 'stdio', command: 'node', args: ['__DSH_MCP_REDACTED__'], toolCallTimeoutMs: 120000, failOnStartupError: false }, original, { normalizeMcpImport, restoreRedactedSpec, toMcpClientConfig });
  assert.equal(next.startupTimeoutMs, 60000);
  assert.deepEqual(next.args, ['secret']);
  assert.equal(next.toolCallTimeoutMs, 120000);
  assert.throws(() => prepareEdit({ name: 'example', transport: 'stdio', command: 'node', startupTimeoutMs: -1 }, original, { normalizeMcpImport, restoreRedactedSpec, toMcpClientConfig }), /startupTimeoutMs/);
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
  assert.equal(find(enhanced, n => n.type === 'h2').props.children, 'Toolbox Enhanced');
  assert.equal(find(enhanced, n => n.type?.name === 'EntryMenu'), undefined);
});
test('unrecognised upstream UI remains usable instead of being replaced', async () => {
  const { enhancePanel } = await load('client-shell.js');
  const node = h('div', {}, 'new upstream layout');
  assert.equal(enhancePanel(node, React, () => {}, key => key), node);
});
test('original update checker detects a newer community release and caches only the original package', async () => {
  const require = createRequire(process.env.DSH_PROFILE_DIR ? process.env.DSH_PROFILE_DIR + '/package.json' : import.meta.url);
  const base = new URL('./lib/', pathToFileURL(require.resolve('dsh-toolbox-ui/package.json')));
  const { checkForUpdate } = await import(new URL('update-hint.js', base));
  const before = globalThis.fetch, calls = [];
  globalThis.fetch = async url => { calls.push(url); return { ok: true, json: async () => ({ version: '1.13.0' }) }; };
  try {
    const result = await checkForUpdate(Date.now(), true);
    assert.equal(result.current, '1.12.0'); assert.equal(result.latest, '1.13.0'); assert.equal(result.updateAvailable, true);
    assert.equal(calls[0], 'https://registry.npmjs.org/dsh-toolbox-ui/latest');
    assert.deepEqual(await checkForUpdate(), result); assert.equal(calls.length, 1);
  } finally { globalThis.fetch = before; }
});

test('startup timeout decorator uses the native editor, preserves other settings and restores upstream methods', async () => {
  const { installStartupTimeout } = await load('startup-timeout.js');
  const require = createRequire(process.env.DSH_PROFILE_DIR ? process.env.DSH_PROFILE_DIR + '/package.json' : import.meta.url);
  const base = new URL('./lib/', pathToFileURL(require.resolve('dsh-toolbox-ui/package.json')));
  const helpers = Object.assign({}, ...await Promise.all(['mcp-config.js', 'mcp-projection.js', 'workspace-config.js'].map(file => import(new URL(file, base)))));
  const entry = { options: { name: '@deepseek-ai/dsh-mcp-client', id: 'custom-not-assumed', config: { serverName: 'example', transport: 'stdio', command: 'node', args: ['secret'], startupTimeoutMs: 60000, toolCallTimeoutMs: 120000, reconnect: { enabled: true }, customHostSetting: 'keep' } } };
  let edits = 0;
  const service = { update: async () => ({ original: true }), exportGlobalJson: async () => ({ json: JSON.stringify({ mcpServers: { example: { command: 'node' } } }) }), updateHint: async () => 'original update' };
  const original = { ...service };
  const ctx = { loader: { entries: () => [entry] }, configEditor: { entries: () => [entry], edit: async (owner, change) => { assert.equal(owner, entry); entry.options.config = change(entry.options.config); edits++; } } };
  const dispose = installStartupTimeout(service, ctx, helpers);
  assert.equal(service.updateHint, original.updateHint);
  await service.update({ name: 'example', transport: 'stdio', command: 'node', args: ['__DSH_MCP_REDACTED__'] });
  assert.equal(edits, 1); assert.equal(entry.options.config.startupTimeoutMs, 60000); assert.equal(entry.options.config.customHostSetting, 'keep'); assert.deepEqual(entry.options.config.args, ['secret']);
  assert.equal(entry.options.config.toolCallTimeoutMs, undefined, 'ordinary fields removed in the form are not silently retained');
  assert.equal(JSON.parse((await service.exportGlobalJson()).json).mcpServers.example.startupTimeoutMs, 60000);
  assert.deepEqual(await service.update({ name: 'other' }), { original: true });
  dispose(); assert.equal(service.update, original.update); assert.equal(service.exportGlobalJson, original.exportGlobalJson);
});

test('existing safety policy remains byte-for-byte and keeps approval decisions', async () => {
  const { createHash } = await import('node:crypto');
  const source = await readFile(new URL('lib/local-policy.js', root));
  assert.equal(createHash('sha256').update(source).digest('hex'), '741aa8e78006aebc3ddb94dc66eb50de9412a8568e711a609e98a4ce7850077e');
  const { toolDenial, needsSideEffectApproval } = await import(new URL('lib/local-policy.js', root));
  assert.equal(toolDenial('mcp__leo-env__port_audit', 'read-only'), undefined);
  assert.ok(toolDenial('mcp__playwright__browser_snapshot', 'read-only'));
  assert.equal(needsSideEffectApproval('mcp__leo-env__pm2_control', { action: 'list' }), false);
  assert.equal(needsSideEffectApproval('mcp__leo-env__pm2_control', { action: 'restart' }), true);
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
  assert.ok(registrations.some(row => row.options.name === 'sidebar.panellist'));
  dispose();
  assert.equal(footer.component, Footer); assert.equal(overlay.component, Overlay); assert.equal(ctx.layout.selectPanel, originalSelect); assert.equal(listeners.size, 0);
});
