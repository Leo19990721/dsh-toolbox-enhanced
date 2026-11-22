import { toolDenial, sideEffectApprovalReason } from './lib/local-policy.js';
import { installStartupTimeout } from './src/startup-timeout.js';
export const name = 'toolbox-enhanced';
export const inject = ['tools', 'sandboxPolicy'];
export function apply(ctx) {
  ctx.tools.guard(exec => toolDenial(exec.name, ctx.sandboxPolicy.resolve({ session: exec.agent?.session }).mode, exec.arguments ?? {}));
  ctx.on('tools/pre-execute', async (exec, next) => {
    const mode = ctx.sandboxPolicy.resolve({ session: exec.agent?.session }).mode;
    const denial = toolDenial(exec.name, mode, exec.arguments ?? {});
    if (denial) return { kind: 'deny', reason: denial };
    const reason = sideEffectApprovalReason(exec.name, exec.arguments ?? {}, mode);
    if (reason) return { kind: 'ask', reason };
    return next();
  });
  // Original bundle alone owns toolboxMcp/skillsManager and its update RPC.
  ctx.inject(['toolboxMcp', 'loader'], scope => {
    const service = scope.get('toolboxMcp')[Symbol.for('cordis.original')];
    scope.effect(() => installStartupTimeout(service, scope), 'toolbox-enhanced: protect startup timeout');
  });
}
