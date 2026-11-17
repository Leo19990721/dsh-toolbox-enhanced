import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { toolDenial, needsSideEffectApproval } from './lib/local-policy.js';
import { installStartupTimeout } from './src/startup-timeout.js';
export const name = 'toolbox-enhanced';
export const inject = ['tools', 'sandboxPolicy', 'loader', 'configEditor'];
export function apply(ctx) {
  ctx.tools.guard(exec => toolDenial(exec.name, ctx.sandboxPolicy.resolve({ session: exec.agent?.session }).mode, exec.arguments ?? {}));
  ctx.on('tools/pre-execute', async (exec, next) => {
    const denial = toolDenial(exec.name, ctx.sandboxPolicy.resolve({ session: exec.agent?.session }).mode, exec.arguments ?? {});
    if (denial) return { kind: 'deny', reason: denial };
    if (needsSideEffectApproval(exec.name, exec.arguments ?? {})) return { kind: 'ask', reason: '此工具会改变 PM2 服务或 nginx 配置；请确认本次具体对象和操作。' };
    return next();
  });
  // Original bundle alone owns toolboxMcp/skillsManager and its update RPC.
  ctx.inject(['toolboxMcp', 'loader', 'configEditor', 'profileContext'], async scope => {
    let step = 'resolve upstream';
    try {
      const require = createRequire(join(scope.get('profileContext').dir, 'package.json'));
      const base = new URL('./lib/', pathToFileURL(require.resolve('dsh-toolbox-ui/package.json')));
      step = 'import helpers';
      const [{ normalizeMcpImport, MANAGED_CONFIG_FIELDS }, { restoreRedactedSpec }, { toMcpClientConfig }] = await Promise.all(['mcp-config.js', 'mcp-projection.js', 'workspace-config.js'].map(file => import(new URL(file, base))));
      step = 'decorate service';
      const service = scope.get('toolboxMcp')[Symbol.for('cordis.original')];
      scope.effect(() => installStartupTimeout(service, scope, { normalizeMcpImport, MANAGED_CONFIG_FIELDS, restoreRedactedSpec, toMcpClientConfig }), 'toolbox-enhanced: preserve startup timeout');
    } catch (error) { throw new Error(step + ': ' + error.message, { cause: error }); }
  });
}
