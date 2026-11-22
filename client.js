window.__ModuleLoader__.load({
  id: '@local/dsh-toolbox-enhanced',
  factory(require) {
    const React = require('react');
// Adapt the original toolbox's registered React output; no component source,
// DOM scan, duplicated backend, RPC descriptors or update checker is shipped.
const PACKAGE = '@local/dsh-toolbox-enhanced';
const PANEL = 'local-toolbox';
const list = children => Array.isArray(children) ? children.flat() : children === undefined ? [] : [children];
const hasClass = (node, name) => typeof node?.props?.className === 'string' && node.props.className.split(/\s+/).includes(name);
function mapTree(node, React, change) {
  if (Array.isArray(node)) return node.map(child => mapTree(child, React, change));
  if (!React.isValidElement(node)) return node;
  const changed = change(node);
  if (changed !== node) return changed;
  if (node.props.children === undefined) return node;
  const children = mapTree(node.props.children, React, change);
  const before = node.props.children;
  const same = children === before || Array.isArray(before) && Array.isArray(children) && before.length === children.length && before.every((child, index) => child === children[index]);
  return same ? node : React.cloneElement(node, {}, children);
}
function enhancePanel(tree, React, close, t, focusRef) {
  const h = React.createElement;
  return mapTree(tree, React, node => {
    if (!hasClass(node, 'dsh-mcp-panel-overlay')) return node;
    const dialog = list(node.props.children).find(child => hasClass(child, 'dsh-mcp-panel'));
    const wrap = list(dialog?.props.children).find(child => hasClass(child, 'dsh-mcp-wrap'));
    const children = list(wrap?.props.children), head = children.find(child => hasClass(child, 'dsh-mcp-head'));
    const header = list(head?.props.children);
    const nav = header.find(child => hasClass(child, 'dsh-mcp-seg'));
    const actions = header.find(child => hasClass(child, 'dsh-mcp-head-actions'));
    if (!dialog || !wrap || !nav || !actions) return node;
    const cleanActions = React.cloneElement(actions, {}, ...list(actions.props.children).filter(child => child?.type?.name !== 'EntryMenu'));
    const body = h('section', { className: 'dsh-mcp-native-content' },
      h('div', { className: 'dsh-mcp-head' }, cleanActions), ...children.filter(child => child !== head));
    const navigation = h('nav', { className: 'dsh-mcp-native-nav', role: 'tablist', 'aria-label': t('navigation') },
      ...list(nav.props.children).map((button, index) => !React.isValidElement(button) ? button : React.cloneElement(button, { key: button.key ?? index, className: 'dsh-mcp-native-nav-item' + (button.props['aria-selected'] ? ' sel' : '') })));
    const titlebar = h('header', { className: 'dsh-mcp-native-titlebar' }, h('h2', null, t('sidebarLabel')),
      h('button', { type: 'button', className: 'dsh-mcp-native-close', onClick: close, 'aria-label': t('close'), title: t('close') }, '×'));
    const content = React.cloneElement(wrap, {}, titlebar, h('div', { className: 'dsh-mcp-native-columns' }, navigation, body));
    const originalRef = dialog.ref;
    const ref = value => { if (typeof originalRef === 'function') originalRef(value); else if (originalRef) originalRef.current = value; if (focusRef) focusRef.current = value; };
    return React.cloneElement(node, { className: node.props.className + ' dsh-toolbox-enhanced' }, React.cloneElement(dialog, { ref, 'aria-label': t('sidebarLabel'), 'data-native-toolbox-dialog': '', onKeyDown: event => modalKey(event, close) }, content));
  });
}
function modalKey(event, close) {
  const panel = event.currentTarget;
  if (event.target?.closest?.('[role="dialog"]') !== panel) return;
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
  if (event.key !== 'Tab') return;
  const items = [...panel.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(item => item.getClientRects().length && !item.closest('[hidden],[inert]'));
  const first = items[0], last = items.at(-1);
  if (!first) { event.preventDefault(); panel.focus(); }
  else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
}
function installClient(ctx, React, css, t) {
  const h = React.createElement, restores = new Map(), disposers = [], panelTypes = new WeakMap();
  let open, disposed = false;
  const adaptTab = Native => {
    if (!panelTypes.has(Native)) panelTypes.set(Native, function EnhancedTab(props) {
      const focus = React.useRef(null);
      React.useEffect(() => {
        const previous = typeof document === 'undefined' ? undefined : document.activeElement;
        focus.current?.focus({ preventScroll: true });
        return () => { if (previous?.isConnected) previous.focus?.({ preventScroll: true }); };
      }, []);
      return enhancePanel(Native(props), React, props.onClose, t, focus);
    });
    return panelTypes.get(Native);
  };
  function watch(name, decorate) {
    const reconcile = () => {
      for (const entry of ctx.slots.entries(name)) {
        if (restores.has(entry)) continue;
        const Native = entry.component;
        if (typeof Native !== 'function') continue;
        const Wrapper = decorate(entry, Native);
        if (Wrapper) { restores.set(entry, { Native, Wrapper }); entry.component = Wrapper; }
      }
    };
    disposers.push(ctx.slots.inject(name, () => { reconcile(); return ctx.slots.subscribe(name, reconcile); }));
  }
  watch('sidebar.footer.action', (entry, Native) => entry.options.id === 'mcp-manager' ? function HiddenOriginalFooter(props) {
    const tree = Native(props);
    if (typeof tree?.props?.onClick === 'function') { open = tree.props.onClick; return null; }
    return tree;
  } : undefined);
  watch('shell.overlay', (entry, Native) => entry.options.id === 'mcp-fab' ? function EnhancedOverlay(props) {
    return mapTree(Native(props), React, node => {
      if (hasClass(node, 'dsh-mcp-fab') && typeof node.props.onClick === 'function') { open = node.props.onClick; return null; }
      if (typeof node.type === 'function' && node.props.floating === true && typeof node.props.onClose === 'function') return h(adaptTab(node.type), { ...node.props, key: node.key });
      return node;
    });
  } : undefined);
  function Icon() { return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true }, ...[[2,2],[9,2],[2,9],[9,9]].map(([x,y]) => h('rect', { key: x + ':' + y, x, y, width: 5, height: 5, rx: 1, stroke: 'currentColor', strokeWidth: 1.4 }))); }
  const originalSelect = ctx.layout.selectPanel;
  const select = function(id, ...args) { if (id === PANEL && open) { open(); return; } return originalSelect.call(this, id, ...args); };
  ctx.layout.selectPanel = select;
  disposers.push(() => { if (ctx.layout.selectPanel === select) ctx.layout.selectPanel = originalSelect; });
  disposers.push(ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 1, label: () => t('sidebarLabel') }, Icon)));
  disposers.push(ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: PACKAGE + '/style' }, () => h('style', { 'data-plugin': PACKAGE }, css))));
  return () => {
    if (disposed) return; disposed = true;
    for (const dispose of disposers.reverse()) dispose?.();
    for (const [entry, { Native, Wrapper }] of restores) if (entry.component === Wrapper) entry.component = Native;
    restores.clear(); open = undefined;
  };
}

    return { inject: ['slots', 'layout', 'locale'], apply(ctx) {
      const locale = ctx.get('locale');
      ctx.effect(() => locale.register('toolboxEnhanced', { zh: { sidebarLabel: '工具箱', navigation: '工具箱导航', close: '关闭' }, en: { sidebarLabel: 'Toolbox', navigation: 'Toolbox navigation', close: 'Close' } }));
      return installClient(ctx, React, "/* Local settings-style shell. All colors and radii follow the installed DSH theme. */\n.dsh-mcp-panel-overlay.dsh-toolbox-enhanced {\n  box-sizing: border-box;\n  background: transparent;\n  isolation: isolate;\n}\n.dsh-mcp-panel-overlay.dsh-toolbox-enhanced::before {\n  content: \"\";\n  position: absolute;\n  inset: var(--dsh-frame-chrome-top, 0px) 0 0;\n  z-index: -1;\n  background: var(--dsw-alias-bg-mask-1);\n  backdrop-filter: var(--dsw-mask-blur, none);\n}\n.dsh-toolbox-enhanced .dsh-mcp-panel {\n  background: var(--dsw-alias-bg-layer-2);\n  border-radius: var(--dsw-radius-panel);\n  box-shadow: var(--dsw-elevation-prominent);\n}\n.dsh-toolbox-enhanced .dsh-mcp-panel .dsh-mcp-wrap { padding: 0; gap: 0; font-size: 14px; }\n.dsh-toolbox-enhanced .dsh-mcp-native-titlebar {\n  flex: none; height: 64px; display: flex; align-items: center; justify-content: space-between;\n  gap: 16px; padding: 16px 20px 8px 24px; box-sizing: border-box;\n}\n.dsh-toolbox-enhanced .dsh-mcp-native-titlebar h2 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }\n.dsh-toolbox-enhanced .dsh-mcp-native-close {\n  display: inline-flex; align-items: center; justify-content: center; flex: none;\n  width: 28px; height: 28px; padding: 0; border: 0; border-radius: var(--dsw-radius-sm);\n  background: transparent; color: inherit; cursor: pointer;\n}\n.dsh-toolbox-enhanced .dsh-mcp-native-close:hover { background: var(--dsw-alias-interactive-bg-hover); }\n.dsh-toolbox-enhanced .dsh-mcp-native-columns { display: grid; grid-template-columns: 172px minmax(0, 1fr); flex: 1; min-height: 0; }\n.dsh-toolbox-enhanced .dsh-mcp-native-nav { display: flex; flex-direction: column; gap: 4px; min-height: 0; overflow-y: auto; padding: 4px 12px 24px; }\n.dsh-toolbox-enhanced .dsh-mcp-native-nav-item {\n  display: flex; align-items: center; gap: 8px; min-height: 40px; flex: none; padding: 9px 12px;\n  border: 0; border-radius: var(--dsw-radius-md); background: transparent; text-align: left;\n  font: inherit; font-size: 14px; line-height: 22px; color: inherit; cursor: pointer;\n}\n.dsh-toolbox-enhanced .dsh-mcp-native-nav-item:hover { background: var(--dsw-alias-interactive-bg-hover); }\n.dsh-toolbox-enhanced .dsh-mcp-native-nav-item.sel { background: var(--dsw-specific-sidebar-nav-item-active); }\n.dsh-toolbox-enhanced .dsh-mcp-native-nav-item svg { flex: none; }\n.dsh-toolbox-enhanced .dsh-mcp-native-count { margin-left: auto; color: var(--dsw-alias-label-tertiary); font-size: 11px; font-variant-numeric: tabular-nums; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content {\n  min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 12px;\n  padding: 4px 24px 24px 8px; overflow: hidden;\n}\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-head { display: flex; flex-wrap: wrap; gap: 10px; min-height: 32px; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-title { font-size: 14px; font-weight: 500; flex: 1; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-title::before { display: none; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-head-actions { margin-left: auto; gap: 6px; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-sub { height: auto; min-height: 32px; grid-template-columns: auto minmax(0, 1fr); gap: 8px; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-runtime { grid-column: 1 / -1; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-btn { height: 32px; padding: 0 10px; font-size: 13px; border-radius: var(--dsw-radius-sm); font-weight: 400; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-btn.icon { width: 28px; height: 28px; padding: 0; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-btn.primary { font-weight: 500; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-seg { padding: 0; gap: 12px; background: transparent; border-radius: 0; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-seg .dsh-mcp-btn { height: 32px; padding: 0 0 6px; border: 0; border-bottom: 2px solid transparent; border-radius: 0; color: var(--dsw-alias-label-secondary); }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-seg .dsh-mcp-btn.sel { background: transparent; border-bottom-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary); font-weight: 500; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-body { gap: 16px; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-side, .dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-ws-body { width: 208px; min-width: 176px; flex: none; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-side { border: 0; border-right: 1px solid var(--dsw-alias-border-l2); border-radius: 0; padding: 0 12px 0 0; background: transparent; gap: 10px; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-side.embedded { width: auto; min-width: 0; flex: 1; padding: 0; border: 0; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-item { padding: 9px 8px; gap: 8px; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-item.sel { background: var(--dsw-specific-sidebar-nav-item-active); }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-item.sel::before { display: none; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-dot { width: 6px; height: 6px; box-shadow: none; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-item-name { font-size: 13px; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-item-sub { font-size: 11px; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-toggle { transform: scale(.86); transform-origin: right center; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-filters { gap: 5px; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-filters select { font-size: 11px; padding-left: 6px; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-defer-all { height: 26px; font-size: 11px; padding: 0 7px; background: transparent; color: var(--dsw-alias-label-secondary); border-color: var(--dsw-alias-border-l2); font-weight: 400; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-detail { border: 0; padding: 0; border-radius: 0; background: transparent; gap: 12px; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-d-head { flex-wrap: wrap; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-d-title { flex-basis: 100%; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-d-name { font-size: 15px; font-weight: 500; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-d-meta { gap: 5px; margin-top: 5px; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-d-actions { gap: 6px; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-badge { font-size: 10px; padding: 0 6px; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-badge.t-stdio, .dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-badge.t-http { border-color: var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-secondary); }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-detail>.dsh-mcp-tabs { gap: 16px; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-card { border: 0; padding: 0; border-radius: 0; background: transparent; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-d-body>.dsh-mcp-card { padding-bottom: 16px; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-card h4 { margin: 0 0 10px; font-size: 12px; font-weight: 500; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-card h4::after { display: none; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-kv { grid-template-columns: 84px minmax(0,1fr); gap: 8px 12px; font-size: 13px; line-height: 1.55; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-search input { height: 30px; font-size: 12px; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-market-view { gap: 12px; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-tool-list { grid-template-columns: minmax(0,1fr); }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-tool-title { font-size: 15px; font-weight: 500; }\n.dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-tool-params-grid { gap: 8px; }\n.dsh-toolbox-enhanced .dsh-mcp-native-nav-item:focus-visible, .dsh-toolbox-enhanced .dsh-mcp-native-close:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }\n@media (max-width: 900px) {\n  .dsh-toolbox-enhanced .dsh-mcp-native-columns { grid-template-columns: 144px minmax(0,1fr); }\n  .dsh-toolbox-enhanced .dsh-mcp-native-nav { padding-inline: 8px; }\n  .dsh-toolbox-enhanced .dsh-mcp-native-content { padding-right: 16px; }\n  .dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-body { flex-direction: column; overflow: auto; }\n  .dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-side, .dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-ws-body { width: auto; min-width: 0; max-height: none; border-right: 0; padding: 0; }\n  .dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-side:not(.embedded) .dsh-mcp-list { max-height: 160px; }\n  .dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-detail { flex: none; min-height: 240px; overflow: visible; }\n  .dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-d-body { overflow: visible; }\n}\n@media (max-width: 600px) {\n  .dsh-toolbox-enhanced .dsh-mcp-panel .dsh-mcp-wrap { padding: 0; }\n  .dsh-toolbox-enhanced .dsh-mcp-native-titlebar { height: 56px; padding: 12px 16px 8px; }\n  .dsh-toolbox-enhanced .dsh-mcp-native-columns { grid-template-columns: minmax(0,1fr); grid-template-rows: auto minmax(0,1fr); }\n  .dsh-toolbox-enhanced .dsh-mcp-native-nav { flex-direction: row; padding: 0 12px 8px; overflow-x: auto; }\n  .dsh-toolbox-enhanced .dsh-mcp-native-nav-item { min-height: 36px; padding: 6px 12px; }\n  .dsh-toolbox-enhanced .dsh-mcp-native-content { padding: 8px 16px 16px; }\n  .dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-head { align-items: center; }\n  .dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-head-actions { flex-wrap: wrap; }\n  .dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-sub { grid-template-columns: minmax(0,1fr); }\n  .dsh-toolbox-enhanced .dsh-mcp-native-content .dsh-mcp-sub-scope { overflow: hidden; }\n}\n", locale.bind('toolboxEnhanced'));
    } };
  }
});
