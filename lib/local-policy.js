export const sourceAllowlists = {
  'leo-env': ['port_audit','url_audit','url_check','url_nginx_template','url_ssh','url_ssh_restore','port_status','pm2_control','dashboard_check','pm2_logs'],
  knowledge: ['knowledge_search','knowledge_read','knowledge_related','knowledge_status'],
};
const privilegedLeo = new Set(['url_ssh','url_ssh_restore','pm2_control']);
const sensitive = new Set(['url_ssh','url_ssh_restore','pm2_control']);
/** Pure and fail-closed policy, used identically for Native and PTC execution. */
export function toolDenial(name, mode, args = {}) {
  for (const [server, raw] of Object.entries(sourceAllowlists)) {
    const prefix = `mcp__${server}__`;
    if (name.startsWith(prefix) && !raw.includes(name.slice(prefix.length))) return `工具未列入 DSH 工具白名单：${name}`;
  }
  if (mode !== 'danger-full-access') {
    if (name.startsWith('mcp__leo-env__') && privilegedLeo.has(name.slice('mcp__leo-env__'.length))) return '系统服务变更仅在 Full access 下允许。';
    if (name.startsWith('mcp__playwright__')) return '浏览器 MCP 仅在 Full access 下允许；浏览器观察工具也可能启动进程或保存文件。';
  }
  return undefined;
}
export function needsSideEffectApproval(name, args = {}) {
  const prefix = 'mcp__leo-env__';
  if (!name.startsWith(prefix) || !sensitive.has(name.slice(prefix.length))) return false;
  // The original server supports these read-only PM2 queries.
  if (name === prefix + 'pm2_control' && ['list','jlist'].includes(args.action)) return false;
  return true;
}
