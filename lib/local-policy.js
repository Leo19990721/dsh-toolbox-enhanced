export const sourceAllowlists = {};
/** Pure and fail-closed policy, used identically for Native and PTC execution. */
export function toolDenial(name, mode, _args = {}) {
  if (mode === 'read-only' && name.startsWith('mcp__playwright__')) {
    return '浏览器 MCP 在只读模式下不可用；请切到「工作区读写」或「完全权限」。';
  }
  return undefined;
}
export function needsSideEffectApproval(name, _args = {}, mode = 'danger-full-access') {
  return mode === 'workspace-write' && name.startsWith('mcp__playwright__');
}
export function sideEffectApprovalReason(name, args = {}, mode = 'danger-full-access') {
  if (!needsSideEffectApproval(name, args, mode)) return undefined;
  return '此操作会通过浏览器 MCP 访问或操作网页，请确认后继续。';
}
