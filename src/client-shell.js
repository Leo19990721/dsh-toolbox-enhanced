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
export function enhancePanel(tree, React, close, t, focusRef) {
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
    const titlebar = h('header', { className: 'dsh-mcp-native-titlebar' }, h('h2', null, 'Toolbox Enhanced'),
      h('button', { type: 'button', className: 'dsh-mcp-native-close', onClick: close, 'aria-label': t('close'), title: t('close') }, '×'));
    const content = React.cloneElement(wrap, {}, titlebar, h('div', { className: 'dsh-mcp-native-columns' }, navigation, body));
    const originalRef = dialog.ref;
    const ref = value => { if (typeof originalRef === 'function') originalRef(value); else if (originalRef) originalRef.current = value; if (focusRef) focusRef.current = value; };
    return React.cloneElement(node, { className: node.props.className + ' dsh-toolbox-enhanced' }, React.cloneElement(dialog, { ref, 'aria-label': 'Toolbox Enhanced', 'data-native-toolbox-dialog': '', onKeyDown: event => modalKey(event, close) }, content));
  });
}
export function modalKey(event, close) {
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
export function installClient(ctx, React, css, t) {
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
