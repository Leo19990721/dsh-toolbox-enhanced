export const sourceAllowlists = {
  'leo-env': ['port_audit','url_audit','url_check','url_nginx_template','url_ssh','url_ssh_restore','port_status','pm2_control','dashboard_check','pm2_logs'],
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
    if (mode === 'read-only' && name.startsWith('mcp__playwright__')) return '浏览器 MCP 在只读模式下不可用；请切到「工作区读写」或「完全权限」。';
  }
  return undefined;
}
export function needsSideEffectApproval(name, args = {}, mode = 'danger-full-access') {
  if (mode === 'workspace-write' && name.startsWith('mcp__playwright__')) return true;
  const prefix = 'mcp__leo-env__';
  if (!name.startsWith(prefix) || !sensitive.has(name.slice(prefix.length))) return false;
  // The original server supports these read-only PM2 queries.
  if (name === prefix + 'pm2_control' && ['list','jlist'].includes(args.action)) return false;
  return true;
}
export function sideEffectApprovalReason(name, args = {}, mode = 'danger-full-access') {
  if (!needsSideEffectApproval(name, args, mode)) return undefined;
  if (name.startsWith('mcp__playwright__')) return '此操作会通过浏览器 MCP 访问或操作网页，请确认后继续。';
  return '此工具会改变 PM2 服务或 nginx 配置；请确认本次具体对象和操作。';
}
