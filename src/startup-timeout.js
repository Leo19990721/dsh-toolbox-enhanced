// Keep the one local MCP field unsupported by toolbox-ui 1.12.0. Everything
// else is validated/restored by the original toolbox before the native editor.
export function prepareEdit(spec, raw, { normalizeMcpImport, restoreRedactedSpec, toMcpClientConfig }) {
  const name = String(spec?.name || '').trim();
  const current = { ...raw, name: raw.serverName };
  const restored = restoreRedactedSpec(spec, current);
  const timeout = restored.startupTimeoutMs ?? raw.startupTimeoutMs;
  if (timeout !== undefined && (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 2147483647)) throw new Error('startupTimeoutMs 必须是 1 到 2147483647 之间的整数');
  delete restored.startupTimeoutMs;
  const result = normalizeMcpImport({ mcpServers: { [name]: restored } });
  if (result.servers.length !== 1) throw new Error('MCP 编辑必须指定一个服务器');
  const normalized = result.servers[0];
  const next = toMcpClientConfig(normalized);
  // Keep the original expression strings in persisted configuration. The native
  // loader evaluates them when reconnecting, exactly as for ordinary edits.
  for (const key of Object.keys(next)) {
    if (normalized[key] !== undefined) next[key] = normalized[key];
    if (next[key] === undefined) delete next[key];
  }
  if (timeout !== undefined) next.startupTimeoutMs = timeout;
  const defer = result.servers[0].defer ?? raw.defer;
  if (defer !== undefined) next.defer = defer;
  return next;
}

export function installStartupTimeout(service, ctx, helpers) {
  const saved = new Map();
  const decorate = (name, wrapper) => {
    if (typeof service[name] !== 'function') return;
    const own = Object.getOwnPropertyDescriptor(service, name);
    const original = service[name];
    const next = wrapper(original);
    service[name] = next;
    saved.set(name, { own, next });
  };
  const entries = () => [...ctx.loader.entries()].filter(entry => entry.options.name === '@deepseek-ai/dsh-mcp-client');
  decorate('update', original => async function(spec) {
    const managed = new Set(ctx.configEditor.entries());
    const entry = entries().find(row => row.options.config?.serverName === spec?.name && managed.has(row));
    // Use original management for all other cases. No filesystem patch editing.
    if (!entry || entry.options.config.startupTimeoutMs === undefined && spec?.startupTimeoutMs === undefined) return original.call(this, spec);
    await ctx.configEditor.edit(entry, current => {
      const next = prepareEdit(spec, current, helpers);
      const retained = { ...current };
      for (const key of helpers.MANAGED_CONFIG_FIELDS) delete retained[key];
      return { ...retained, ...next };
    });
    return { persisted: 'applied', live: 'applied', diagnostics: [], note: '已通过 DSH 配置编辑器保存，启动超时保持生效。' };
  });
  decorate('exportGlobalJson', original => async function(...args) {
    const result = await original.apply(this, args);
    if (typeof result.json !== 'string') return result;
    const document = JSON.parse(result.json);
    for (const entry of entries()) {
      const { serverName, startupTimeoutMs } = entry.options.config || {};
      if (startupTimeoutMs !== undefined && Object.hasOwn(document.mcpServers || {}, serverName)) document.mcpServers[serverName].startupTimeoutMs = startupTimeoutMs;
    }
    return { ...result, json: JSON.stringify(document, null, 2) + '\n' };
  });
  return () => { for (const [name, { own, next }] of saved) if (service[name] === next) { if (own) Object.defineProperty(service, name, own); else delete service[name]; } };
}
