import { registerHooks, createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const anchor = pathToFileURL(join(process.env.DSH_INSTALL_DIR, 'package.json')).href;
const profile = createRequire(join(process.env.DSH_PROFILE_DIR, 'package.json'));
const toolbox = createRequire(profile.resolve('dsh-toolbox-ui/package.json'));
const extras = Object.fromEntries(['yaml', 'smol-toml', 'zod'].map(name => [name, pathToFileURL(toolbox.resolve(name)).href]));
for (const name of ['dsh-toolbox-ui', 'dsh-toolbox-ui/package.json']) extras[name] = pathToFileURL(profile.resolve(name)).href;
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('@deepseek-ai/')) return next(specifier, { ...context, parentURL: anchor });
  if (extras[specifier]) return { url: extras[specifier], shortCircuit: true };
  return next(specifier, context);
} });
