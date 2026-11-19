import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

if (!process.env.DSH_INSTALL_DIR) throw new Error('Set DSH_INSTALL_DIR to the installed DSH CLI package.');
const manifest = join(process.env.DSH_INSTALL_DIR, 'package.json');
if (JSON.parse(readFileSync(manifest, 'utf8')).name !== '@deepseek-ai/dsh') throw new Error('DSH_INSTALL_DIR does not point to the DSH CLI package.');
const anchor = pathToFileURL(manifest).href;
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('@deepseek-ai/')) return next(specifier, { ...context, parentURL: anchor });
  return next(specifier, context);
} });
