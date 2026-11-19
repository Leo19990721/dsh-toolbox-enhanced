// The supported toolbox-ui releases only read their insert rows, while the native editor writes
// overrides. Never mix those persistence paths or normalize raw !!js values.
export function installStartupTimeout(service, ctx) {
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
  decorate('update', original => async function(spec, ...args) {
    const name = String(spec?.name || '').trim();
    const hasTimeout = spec?.startupTimeoutMs !== undefined || entries().some(entry => entry.options.config?.serverName === name && entry.options.config.startupTimeoutMs !== undefined);
    if (hasTimeout) {
      const error = new Error('该 MCP 含 startupTimeoutMs，不能在工具箱中安全编辑。请改用 DSH 原生配置编辑；本次未保存任何修改。');
      error.code = 'TOOLBOX_STARTUP_TIMEOUT_EDIT_UNSUPPORTED';
      throw error;
    }
    return original.call(this, spec, ...args);
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
