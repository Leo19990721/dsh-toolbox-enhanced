import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const source = (await readFile(new URL('src/client-shell.js', root), 'utf8')).replaceAll('export function ', 'function ');
// Limit our styles to the decorated original panel. Unload restores the original
// components and removes this React-owned style node.
const css = (await readFile(new URL('native-shell.css', root), 'utf8')).replace(/(^|\n)([ \t]*)(\.dsh-mcp[^\{]+\{)/g, (_match, start, space, selector) => start + space + selector.split(',').map(part => part.trim().startsWith('.dsh-mcp-panel-overlay') ? part.trim().replace('.dsh-mcp-panel-overlay', '.dsh-mcp-panel-overlay.dsh-toolbox-enhanced') : '.dsh-toolbox-enhanced ' + part.trim()).join(', ') );
const artifact = `window.__ModuleLoader__.load({\n  id: '@local/dsh-toolbox-enhanced',\n  factory(require) {\n    const React = require('react');\n${source}\n    return { inject: ['slots', 'layout', 'locale'], apply(ctx) {\n      const locale = ctx.get('locale');\n      ctx.effect(() => locale.register('toolboxEnhanced', { zh: { title: '工具箱增强', navigation: '工具箱导航', close: '关闭' }, en: { title: 'Toolbox Enhanced', navigation: 'Toolbox navigation', close: 'Close' } }));\n      return installClient(ctx, React, ${JSON.stringify(css)}, locale.bind('toolboxEnhanced'));\n    } };\n  }\n});\n`;
await writeFile(new URL('client.js', root), artifact);
console.log('Built standalone Toolbox Enhanced decorator; upstream client stays unchanged.');
