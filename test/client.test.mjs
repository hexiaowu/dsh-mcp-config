import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import vm from 'node:vm'

/**
 * Load the browser bundle without a DOM. This verifies the module-loader shape,
 * dictionary parity, and the slot registrations the page depends on; it does
 * not render React components.
 */
async function loadClient() {
  const code = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  let registration
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(value) {
          registration = value
        },
      },
    },
    globalThis: {},
    document: {
      body: {},
      addEventListener() {},
      removeEventListener() {},
    },
    setTimeout: (callback, ms, ...args) => globalThis.setTimeout(callback, ms, ...args),
    clearTimeout: (timer) => globalThis.clearTimeout(timer),
  }
  vm.runInNewContext(code, sandbox, { filename: 'client.js' })
  assert.ok(registration, 'client.js registered a module factory')
  assert.equal(registration.id, '@hexiaowu/dsh-mcp-config')

  const React = {
    createElement(type, props, ...children) {
      return { type, props, children }
    },
    Fragment: Symbol('Fragment'),
    useState(initial) {
      return [typeof initial === 'function' ? initial() : initial, () => {}]
    },
    useEffect() {},
    useRef(value) {
      return { current: value ?? null }
    },
    useId() {},
    useSyncExternalStore(_subscribe, getSnapshot) {
      return getSnapshot()
    },
  }
  const ReactDOM = {
    createPortal(node) {
      return node
    },
  }
  const module = registration.factory((name) => {
    if (name === 'react') return React
    if (name === 'react-dom') return ReactDOM
    throw new Error(`unexpected require(${JSON.stringify(name)})`)
  })
  return module
}

function fakeApplyContext() {
  const dictionaries = new Map()
  const slots = []
  const effects = []
  const ctx = {
    on() {
      return () => {}
    },
    locale: {
      register(namespace, value) {
        dictionaries.set(namespace, value)
        return () => {}
      },
      bind(namespace) {
        return (key) => {
          const value = dictionaries.get(namespace)
          if (!value) return key
          for (const language of ['zh', 'en']) {
            const dictionary = value[language]
            if (dictionary && typeof dictionary[key] === 'string') return dictionary[key]
          }
          return key
        }
      },
    },
    slots: {
      inject(slot, callback) {
        callback()
      },
      register(options, component) {
        slots.push({ options, component })
        return () => {}
      },
    },
    effect(fn) {
      const disposer = fn()
      effects.push(disposer)
      return disposer
    },
    connection: {
      rpc: {
        call() {
          throw new Error('not called during registration')
        },
      },
    },
  }
  return { ctx, dictionaries, slots, effects }
}

test('client module exposes the expected services', async () => {
  const module = await loadClient()
  assert.deepEqual(Array.from(module.inject), ['slots', 'locale', 'connection'])
  assert.equal(typeof module.apply, 'function')
})

test('client locale dictionaries have identical keys', async () => {
  const module = await loadClient()
  const { ctx, dictionaries } = fakeApplyContext()
  module.apply(ctx)
  const value = dictionaries.get('mcp-config')
  assert.ok(value)
  const zh = Object.keys(value.zh).sort()
  const en = Object.keys(value.en).sort()
  assert.deepEqual(en, zh)
  for (const key of ['nav', 'title', 'dsh.title', 'external.title', 'import.action', 'form.newTitle', 'error.duplicate-name']) {
    assert.ok(zh.includes(key), `missing key ${key}`)
  }
})

test('client registers the settings section and its icon', async () => {
  const module = await loadClient()
  const { ctx, slots } = fakeApplyContext()
  module.apply(ctx)
  const section = slots.find((slot) => slot.options.name === 'settings.section')
  assert.ok(section)
  assert.equal(section.options.id, 'mcp-config')
  assert.equal(section.options.order, 18)
  assert.equal(typeof section.component, 'function')
  const icon = slots.find((slot) => slot.options.name === 'settings.section.icon')
  assert.ok(icon)
  assert.equal(icon.options.id, 'mcp-config')
  assert.equal(typeof icon.component, 'function')
})

test('the page renders its empty state without throwing', async () => {
  const module = await loadClient()
  const { ctx, slots, dictionaries } = fakeApplyContext()
  module.apply(ctx)
  const section = slots.find((slot) => slot.options.name === 'settings.section')
  const snapshot = {
    status: 'ready',
    data: {
      managed: [],
      profileRows: [],
      groups: [],
      configErrors: [],
      diagnostics: {
        canWrite: true,
        mcpModule: { ok: true, error: '' },
        checkedFiles: 3,
        scanFailure: '',
      },
    },
    error: '',
    refreshing: false,
    pending: [],
    editor: null,
    confirm: null,
    toast: null,
  }
  const controller = {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    ensureLoaded: () => {},
    rescan: () => {},
    openEditor: () => {},
    dismissToast: () => {},
  }
  const dictionary = dictionaries.get('mcp-config')
  const t = (key) => (dictionary.zh && dictionary.zh[key]) || key
  const tree = section.component({ controller, t })
  assert.ok(tree)
  assert.equal(tree.type, 'div')
})

test('the page calls the Host through the /api RPC bridge', async () => {
  const module = await loadClient()
  const { ctx, slots } = fakeApplyContext()
  const calls = []
  ctx.connection.rpc.call = async (channel, endpoint, payload) => {
    calls.push({ channel, endpoint, payload })
    return {
      ok: true,
      value: {
        managed: [],
        profileRows: [],
        groups: [],
        configErrors: [],
        diagnostics: {
          canWrite: true,
          mcpModule: { ok: true, error: '' },
          checkedFiles: 0,
          scanFailure: '',
          generatedAt: Date.now(),
        },
      },
    }
  }
  module.apply(ctx)
  const section = slots.find((slot) => slot.options.name === 'settings.section')
  const props = section.options.inject()
  props.controller.ensureLoaded()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].channel, '/api')
  assert.equal(calls[0].endpoint, 'mcp-config.rpc')
  assert.equal(calls[0].payload.endpoint, 'rescan')
  assert.deepEqual(Object.keys(calls[0].payload.data), [])

  // Re-entering the page does not scan again.
  props.controller.ensureLoaded()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(calls.length, 1)

  // The manual button does.
  await props.controller.rescan()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(calls.length, 2)
  assert.equal(calls[1].payload.endpoint, 'rescan')
})

test('view components render with representative data', async () => {
  const module = await loadClient()
  const { ctx, dictionaries } = fakeApplyContext()
  module.apply(ctx)
  const dictionary = dictionaries.get('mcp-config')
  const t = (key) => (dictionary.zh && dictionary.zh[key]) || key
  const snapshot = {
    status: 'ready',
    data: {
      managed: [],
      profileRows: [],
      groups: [],
      configErrors: [],
      diagnostics: { canWrite: true, mcpModule: { ok: true, error: '' }, checkedFiles: 1, scanFailure: '', generatedAt: Date.now() },
    },
    error: '',
    refreshing: false,
    pending: [],
    editor: null,
    confirm: null,
    toast: null,
  }
  const controller = {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    ensureLoaded: () => {},
    rescan: () => {},
    openEditor: () => {},
    closeEditor: () => {},
    openConfirm: () => {},
    closeConfirm: () => {},
    setEnabled: () => {},
    remove: () => {},
    importSource: () => {},
    dismissToast: () => {},
    errorText: (error) => String(error && error.message ? error.message : error),
    saveEditor: async () => {},
  }
  const server = {
    id: 'id-1',
    name: 'context7',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp'],
    env: { TOKEN: 'secret' },
    cwd: '',
    url: '',
    headers: {},
    toolCallTimeoutMs: 60000,
    failOnStartupError: false,
    disabled: false,
    origin: 'Claude Code · .claude.json',
    summary: 'npx -y @upstash/context7-mcp',
    toolCount: 2,
    mountError: '',
    status: 'enabled',
  }
  const external = {
    key: 'claude-code::/tmp/.claude.json::global::context7',
    name: 'context7',
    transport: 'stdio',
    summary: 'npx -y @upstash/context7-mcp',
    enabled: true,
    unsupported: '',
    warnings: ['placeholder:${input:token}', 'env_vars-missing:TOKEN'],
    imported: false,
    nameTaken: false,
    suggestedName: 'context7',
    renamed: false,
  }
  const components = module.__components
  const managed = components.ManagedRow({ server, controller, t })
  assert.ok(managed)
  const profile = components.ProfileRow({ row: { id: 'p1', name: 'profileSrv', transport: 'streamable-http', summary: 'https://x/mcp', enabled: true, error: '' }, t })
  assert.ok(profile)
  const source = components.SourceRow({ server: external, controller, t })
  assert.ok(source)
  const group = components.SourceGroup({ group: { id: 'g1', label: 'Claude Code', path: '/tmp/.claude.json', servers: [external] }, controller, t, open: true })
  assert.ok(group)
  const editor = components.ServerDialog({ controller, t, mode: 'new', initial: { name: '', transport: 'stdio', command: '', args: '', env: '', cwd: '', url: '', headers: '', timeout: '60000', failOnStartup: false, disabled: false } })
  assert.ok(editor)
  assert.equal(editor.type, 'form')
  const toast = components.Toast({ controller, t, toast: { message: 'ok', tone: 'success' } })
  assert.ok(toast)
})

function walkElements(node, visit) {
  if (Array.isArray(node)) {
    for (const child of node) walkElements(child, visit)
    return
  }
  if (!node || typeof node !== 'object') return
  visit(node)
  if (Array.isArray(node.children)) walkElements(node.children, visit)
}

test('the create/edit form is a floating dialog without a backdrop', async () => {
  const module = await loadClient()
  const { ctx, dictionaries } = fakeApplyContext()
  module.apply(ctx)
  const dictionary = dictionaries.get('mcp-config')
  const t = (key) => (dictionary.zh && dictionary.zh[key]) || key
  const server = {
    id: 'id-1',
    name: 'context7',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp'],
    env: {},
    cwd: '',
    url: '',
    headers: {},
    toolCallTimeoutMs: 60000,
    failOnStartupError: false,
    disabled: false,
    origin: '',
    summary: 'npx -y @upstash/context7-mcp',
    toolCount: 1,
    mountError: '',
    status: 'enabled',
  }
  const snapshot = {
    status: 'ready',
    data: {
      managed: [server],
      profileRows: [],
      groups: [],
      configErrors: [],
      diagnostics: { canWrite: true, mcpModule: { ok: true, error: '' }, checkedFiles: 1, scanFailure: '', generatedAt: Date.now() },
    },
    error: '',
    refreshing: false,
    pending: [],
    editor: { mode: 'edit', draft: { id: 'id-1', name: 'context7', transport: 'stdio', command: 'npx', args: '', env: '', cwd: '', url: '', headers: '', timeout: '60000', failOnStartup: false, disabled: false } },
    confirm: null,
    toast: null,
  }
  const controller = {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    ensureLoaded: () => {},
    rescan: () => {},
    openEditor: () => {},
    closeEditor: () => {},
    openConfirm: () => {},
    closeConfirm: () => {},
    setEnabled: () => {},
    remove: () => {},
    importSource: () => {},
    dismissToast: () => {},
    errorText: (error) => String(error),
    saveEditor: async () => {},
  }
  const tree = module.__components.Page({ controller, t })
  let hasEditor = false
  let hasOverlay = false
  walkElements(tree, (element) => {
    if (element.type === module.__components.ServerDialog) hasEditor = true
    if (element.props && String(element.props.className || '').includes('mcpcfg-overlay')) hasOverlay = true
  })
  assert.equal(hasEditor, true)
  assert.equal(hasOverlay, false)
})

test('delete confirmation is a floating dialog without a backdrop', async () => {
  const module = await loadClient()
  const { ctx, dictionaries } = fakeApplyContext()
  module.apply(ctx)
  const dictionary = dictionaries.get('mcp-config')
  const t = (key) => (dictionary.zh && dictionary.zh[key]) || key
  const server = {
    id: 'id-1',
    name: 'context7',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp'],
    env: {},
    cwd: '',
    url: '',
    headers: {},
    toolCallTimeoutMs: 60000,
    failOnStartupError: false,
    disabled: false,
    origin: '',
    summary: 'npx -y @upstash/context7-mcp',
    toolCount: 1,
    mountError: '',
    status: 'enabled',
  }
  const snapshot = {
    status: 'ready',
    data: {
      managed: [server],
      profileRows: [],
      groups: [],
      configErrors: [],
      diagnostics: { canWrite: true, mcpModule: { ok: true, error: '' }, checkedFiles: 1, scanFailure: '', generatedAt: Date.now() },
    },
    error: '',
    refreshing: false,
    pending: [],
    editor: null,
    confirm: server,
    toast: null,
  }
  const controller = {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    ensureLoaded: () => {},
    rescan: () => {},
    openEditor: () => {},
    closeEditor: () => {},
    openConfirm: () => {},
    closeConfirm: () => {},
    setEnabled: () => {},
    remove: () => {},
    importSource: () => {},
    dismissToast: () => {},
    errorText: (error) => String(error),
    saveEditor: async () => {},
  }
  const dialog = module.__components.ConfirmDialog({ controller, t, server })
  assert.ok(dialog)
  const className = String(dialog.props.className)
  assert.match(className, /mcpcfg-dialog/)
  assert.match(className, /mcpcfg-dialog-confirm/)
  assert.ok(!className.includes('mcpcfg-overlay'))

  const tree = module.__components.Page({ controller, t })
  let hasConfirmDialog = false
  let hasOverlay = false
  walkElements(tree, (element) => {
    if (element.type === module.__components.ConfirmDialog) hasConfirmDialog = true
    if (element.props && String(element.props.className || '').includes('mcpcfg-overlay')) hasOverlay = true
  })
  assert.equal(hasConfirmDialog, true)
  assert.equal(hasOverlay, false)
})

test('external source groups are collapsed by default', async () => {
  const module = await loadClient()
  const { ctx, dictionaries } = fakeApplyContext()
  module.apply(ctx)
  const dictionary = dictionaries.get('mcp-config')
  const t = (key) => (dictionary.zh && dictionary.zh[key]) || key
  const group = {
    id: 'zcode::default',
    label: 'ZCode',
    path: '/tmp/.zcode/cli/config.json',
    servers: [{
      key: 'zcode::/tmp/.zcode/cli/config.json::::bj-test',
      name: 'bj-test',
      transport: 'stdio',
      summary: 'npx -y @sakura0v0/any-db-mcp',
      enabled: true,
      unsupported: '',
      warnings: [],
      envCount: 6,
      headerCount: 0,
      imported: false,
      nameTaken: false,
      suggestedName: 'bj-test',
      renamed: false,
    }],
    error: '',
  }
  const snapshot = {
    status: 'ready',
    data: {
      managed: [],
      profileRows: [],
      groups: [group],
      configErrors: [],
      diagnostics: { canWrite: true, mcpModule: { ok: true, error: '' }, checkedFiles: 1, scanFailure: '', generatedAt: Date.now() },
    },
    error: '',
    refreshing: false,
    pending: [],
    editor: null,
    confirm: null,
    toast: null,
  }
  const controller = {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    importSource: () => {},
    errorText: (error) => String(error),
  }
  const tree = module.__components.SourceGroup({ group, controller, t })
  let hasBody = false
  let expanded
  walkElements(tree, (element) => {
    if (element.props && String(element.props.className || '').includes('mcpcfg-group-body')) hasBody = true
    if (element.props && element.props['aria-expanded'] !== undefined) expanded = element.props['aria-expanded']
  })
  assert.equal(hasBody, false)
  assert.equal(expanded, 'false')
})

test('the last scan time uses yyyy-MM-dd HH:mm:ss', async () => {
  const module = await loadClient()
  const { ctx, dictionaries } = fakeApplyContext()
  module.apply(ctx)
  const dictionary = dictionaries.get('mcp-config')
  const t = (key) => (dictionary.zh && dictionary.zh[key]) || key
  const scannedAt = new Date(2026, 10, 15, 19, 30, 5).getTime()
  const snapshot = {
    status: 'ready',
    data: {
      managed: [],
      profileRows: [],
      groups: [],
      configErrors: [],
      diagnostics: {
        canWrite: true,
        mcpModule: { ok: true, error: '' },
        checkedFiles: 3,
        scannedAt,
        scanFailure: '',
        generatedAt: scannedAt,
      },
    },
    error: '',
    refreshing: false,
    pending: [],
    editor: null,
    confirm: null,
    toast: null,
  }
  const controller = {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    ensureLoaded: () => {},
    rescan: () => {},
    openEditor: () => {},
    closeEditor: () => {},
    openConfirm: () => {},
    closeConfirm: () => {},
    setEnabled: () => {},
    remove: () => {},
    importSource: () => {},
    dismissToast: () => {},
    errorText: (error) => String(error),
    saveEditor: async () => {},
  }
  const tree = module.__components.Page({ controller, t })
  const strings = []
  const collect = (node) => {
    if (typeof node === 'string') {
      strings.push(node)
      return
    }
    if (Array.isArray(node)) {
      for (const item of node) collect(item)
      return
    }
    if (node && typeof node === 'object' && Array.isArray(node.children)) collect(node.children)
  }
  collect(tree)
  assert.ok(strings.some((value) => value.includes('2026-11-15 19:30:05')), JSON.stringify(strings))
})

test('closing the settings page clears transient dialogs', async () => {
  const module = await loadClient()
  const { ctx, slots } = fakeApplyContext()
  module.apply(ctx)
  const section = slots.find((slot) => slot.options.name === 'settings.section')
  const { controller } = section.options.inject()

  controller.openEditor(null)
  assert.ok(controller.getSnapshot().editor)
  controller.closeTransient()
  assert.equal(controller.getSnapshot().editor, null)

  controller.openConfirm({ id: 'x', name: 'x', summary: '' })
  assert.ok(controller.getSnapshot().confirm)
  controller.closeTransient()
  assert.equal(controller.getSnapshot().confirm, null)
})

/**
 * Invoke nested function components so the tree contains host elements only.
 * `walkElements` cannot see inside `h(Switch, ...)`: the fake React keeps the
 * component itself instead of calling it.
 */
function renderTree(node) {
  if (Array.isArray(node)) return node.map(renderTree).filter((child) => child != null && child !== false)
  if (node == null || typeof node !== 'object') return node
  if (typeof node.type === 'function') return renderTree(node.type(node.props || {}))
  const children = Array.isArray(node.children) ? node.children.map(renderTree) : node.children
  return { ...node, children }
}

/** Find every element matching a predicate, in render order. */
function findAll(node, predicate) {
  node = renderTree(node)
  const found = []
  walkElements(node, (element) => {
    if (element && element.props && predicate(element)) found.push(element)
  })
  return found
}

function readySnapshot(data) {
  return {
    status: 'ready',
    data: {
      managed: [],
      profileRows: [],
      groups: [],
      configErrors: [],
      diagnostics: { canWrite: true, mcpModule: { ok: true, error: '' }, checkedFiles: 1, scanFailure: '', generatedAt: Date.now() },
      ...data,
    },
    error: '',
    refreshing: false,
    pending: [],
    editor: null,
    confirm: null,
    toast: null,
  }
}

function managedServer(overrides) {
  return {
    id: 'id-1',
    name: 'context7',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp'],
    env: {},
    cwd: '',
    url: '',
    headers: {},
    toolCallTimeoutMs: 60000,
    failOnStartupError: false,
    disabled: false,
    origin: '',
    summary: 'npx -y @upstash/context7-mcp',
    toolCount: 1,
    mountError: '',
    status: 'enabled',
    ...overrides,
  }
}

test('the list toggle is one switch whose on and off states share the same shape', async () => {
  const module = await loadClient()
  const { ctx, dictionaries } = fakeApplyContext()
  module.apply(ctx)
  const dictionary = dictionaries.get('mcp-config')
  const t = (key) => (dictionary.zh && dictionary.zh[key]) || key
  const server = managedServer()
  const toggles = []
  const controller = {
    getSnapshot: () => readySnapshot({ managed: [server] }),
    setEnabled: (value) => toggles.push(value),
  }

  const enabled = findAll(module.__components.ManagedRow({ server: managedServer(), controller, t }), (element) => element.props.role === 'switch')
  assert.equal(enabled.length, 1, 'exactly one switch per managed server')
  const [on] = enabled
  assert.equal(on.type, 'button')
  assert.equal(on.props.type, 'button', 'the switch must never submit a form')
  assert.equal(on.props.className, 'mcpcfg-switch')
  assert.equal(on.props['aria-checked'], 'true')
  assert.equal(on.props['aria-label'], '停用')
  assert.equal(on.props.title, '停用')
  const thumb = on.children[0]
  assert.equal(thumb.props.className, 'mcpcfg-switch-thumb', 'the knob is a real element, not a ::after pseudo element')
  on.props.onClick()
  assert.deepEqual(toggles, [server], 'clicking hands the server to the controller')

  const disabled = findAll(module.__components.ManagedRow({ server: managedServer({ disabled: true, status: 'disabled' }), controller, t }), (element) => element.props.role === 'switch')
  assert.equal(disabled.length, 1)
  assert.equal(disabled[0].props['aria-checked'], 'false')
  assert.equal(disabled[0].props['aria-label'], '启用')
  assert.equal(disabled[0].props.className, 'mcpcfg-switch', 'off state keeps the identical class, only aria-checked changes')
})

test('a read-only profile disables the toggle instead of restyling it', async () => {
  const module = await loadClient()
  const { ctx, dictionaries } = fakeApplyContext()
  module.apply(ctx)
  const dictionary = dictionaries.get('mcp-config')
  const t = (key) => (dictionary.zh && dictionary.zh[key]) || key
  const snapshot = readySnapshot({ managed: [managedServer()] })
  snapshot.data.diagnostics.canWrite = false
  const controller = { getSnapshot: () => snapshot, setEnabled: () => {} }
  const [toggle] = findAll(module.__components.ManagedRow({ server: managedServer(), controller, t }), (element) => element.props.role === 'switch')
  assert.equal(toggle.props.disabled, true)
  assert.equal(toggle.props.className, 'mcpcfg-switch')
})

test('the editor dialog uses the same switch for every on/off option', async () => {
  const module = await loadClient()
  const { ctx, dictionaries } = fakeApplyContext()
  module.apply(ctx)
  const dictionary = dictionaries.get('mcp-config')
  const t = (key) => (dictionary.zh && dictionary.zh[key]) || key
  const controller = {
    getSnapshot: () => readySnapshot({}),
    closeEditor: () => {},
    saveEditor: async () => {},
    errorText: (error) => String(error),
  }
  const dialog = module.__components.ServerDialog({
    controller,
    t,
    mode: 'edit',
    initial: { id: 'id-1', name: 'context7', transport: 'stdio', command: 'npx', args: '', env: '', cwd: '', url: '', headers: {}, timeout: '60000', failOnStartup: false, disabled: true },
  })
  const switches = findAll(dialog, (element) => element.props.role === 'switch')
  assert.equal(switches.length, 2, 'failOnStartup + enabled')
  for (const element of switches) {
    assert.equal(element.props.className, 'mcpcfg-switch')
    assert.equal(element.children[0].props.className, 'mcpcfg-switch-thumb')
  }
  const checkboxes = findAll(dialog, (element) => element.type === 'input' && element.props.type === 'checkbox')
  assert.equal(checkboxes.length, 0, 'no second control type for the same kind of option')

  const enabledSwitch = switches.find((element) => element.props['aria-label'] === '启用')
  assert.ok(enabledSwitch, 'the enable option is labelled as a switch, not as a checkbox')
  assert.equal(enabledSwitch.props['aria-checked'], 'false', 'a disabled server renders the switch off')
  const failFastSwitch = switches.find((element) => element.props['aria-label'] === t('form.failFast'))
  assert.ok(failFastSwitch)
  assert.equal(failFastSwitch.props['aria-checked'], 'false')
})

test('the switch stylesheet follows the DSH switch tokens in both themes', async () => {
  const module = await loadClient()
  const css = module.__css
  const switchRules = css.split('}').filter((rule) => rule.includes('.mcpcfg-switch')).join('}')
  assert.match(switchRules, /--dsw-alias-border-l3/, 'the off track is a visible border tone')
  assert.match(switchRules, /\[aria-checked="true"\]\{background:var\(--dsw-alias-state-business-primary/, 'an enabled switch reads as the DSH blue')
  assert.doesNotMatch(switchRules, /\[aria-checked="true"\]\{background:var\(--dsw-alias-brand-primary/, 'the mono brand tone reads as "off" to users who expect blue to mean enabled')
  assert.match(switchRules, /--dsw-alias-switch-thumb/, 'the off knob uses the shared switch-thumb token')
  assert.match(switchRules, /width:36px;height:20px/, 'same metrics as the DSH switch')
  assert.match(switchRules, /translateX\(16px\)/)
  assert.doesNotMatch(switchRules, /--dsw-alias-bg-layer-[23]/, 'a white theme layer would make the off track disappear')
  assert.doesNotMatch(switchRules, /--dsw-alias-fill-l2/, 'that token is not defined by the DSH themes')
  assert.doesNotMatch(switchRules, /::after/, 'the knob must be an element so it can be inspected and themed')
  assert.ok(!css.includes('.mcpcfg-check'), 'the old checkbox row style is gone')
})

test('enabled reads blue in the status tag as well as the switch', async () => {
  const module = await loadClient()
  const { ctx, dictionaries } = fakeApplyContext()
  module.apply(ctx)
  const dictionary = dictionaries.get('mcp-config')
  const t = (key) => (dictionary.zh && dictionary.zh[key]) || key
  const controller = { getSnapshot: () => readySnapshot({ managed: [managedServer()] }), setEnabled: () => {} }

  // Render order in the title row: transport, status, tool count.
  const tagClasses = (server) => findAll(module.__components.ManagedRow({ server, controller, t }), (element) => String(element.props.className || '').includes('mcpcfg-tag')).map((element) => element.props.className)
  const enabledTags = tagClasses(managedServer())
  assert.equal(enabledTags.length, 3, JSON.stringify(enabledTags))
  assert.match(enabledTags[1], /mcpcfg-tag-info/, 'the enabled status uses the blue tone')
  assert.match(enabledTags[2], /mcpcfg-tag-ok/, 'the tool count keeps the success tone so status and count stay distinguishable')

  const stoppedTags = tagClasses(managedServer({ disabled: true, status: 'disabled', toolCount: 0 }))
  assert.equal(stoppedTags.length, 2, JSON.stringify(stoppedTags))
  assert.match(stoppedTags[1], /mcpcfg-tag-warn/)

  const css = module.__css
  assert.match(css, /\.mcpcfg-tag-info\{color:var\(--dsw-alias-state-business-primary\);background:var\(--dsw-alias-state-business-tertiary/, 'the blue tone follows the DSH info tag')
})

function textOf(element) {
  const parts = []
  collect: for (const child of element.children || []) {
    if (typeof child === 'string') parts.push(child)
    else if (child && typeof child === 'object' && Array.isArray(child.children)) {
      const nested = textOf(child)
      if (nested) parts.push(nested)
    }
  }
  return parts.join('')
}

test('one server toggling never locks the rest of the page', async () => {
  const module = await loadClient()
  const { ctx, dictionaries } = fakeApplyContext()
  module.apply(ctx)
  const dictionary = dictionaries.get('mcp-config')
  const t = (key) => (dictionary.zh && dictionary.zh[key]) || key
  const first = managedServer()
  const second = managedServer({ id: 'id-2', name: 'zai', summary: 'https://x/mcp', toolCount: 0 })
  const snapshot = readySnapshot({ managed: [first, second] })
  snapshot.pending = ['toggle:id-1']
  const controller = {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    ensureLoaded: () => {},
    rescan: () => {},
    openEditor: () => {},
    openConfirm: () => {},
    setEnabled: () => {},
    closeTransient: () => {},
  }
  const tree = renderTree(module.__components.Page({ controller, t }))
  const buttons = findAll(tree, (element) => element.type === 'button')
  const byLabel = (label) => buttons.filter((element) => textOf(element) === label)

  const headerButtons = byLabel('重新扫描').concat(byLabel('新增 MCP'))
  assert.equal(headerButtons.length, 2, 'header actions still render')
  for (const button of headerButtons) {
    assert.ok(!button.props.disabled, `${textOf(button)} must stay usable while a row is toggling`)
  }

  const switches = findAll(tree, (element) => element.props.role === 'switch')
  assert.equal(switches.length, 2)
  assert.equal(switches[0].props['aria-busy'], 'true', 'only the toggling row reports busy')
  assert.ok(!switches[0].props.disabled, 'the toggling switch is not dimmed')
  assert.equal(switches[1].props['aria-busy'], undefined)
  assert.ok(!switches[1].props.disabled, 'the other row stays clickable')

  const deletes = byLabel('删除')
  assert.equal(deletes.length, 2)
  assert.ok(!deletes[0].props.disabled, 'the toggling row can still be deleted')
  assert.ok(!deletes[1].props.disabled, 'another row can still be deleted')

  const edits = byLabel('编辑')
  for (const edit of edits) assert.ok(!edit.props.disabled, 'editing stays available')
})

test('a busy switch still forwards the click so the intent flips back', async () => {
  const module = await loadClient()
  const { ctx, dictionaries } = fakeApplyContext()
  module.apply(ctx)
  const dictionary = dictionaries.get('mcp-config')
  const t = (key) => (dictionary.zh && dictionary.zh[key]) || key
  const calls = []
  const controller = {
    getSnapshot: () => ({ ...readySnapshot({ managed: [managedServer()] }), pending: ['toggle:id-1'] }),
    setEnabled: (server) => calls.push(server),
  }
  const tree = renderTree(module.__components.ManagedRow({ server: managedServer(), controller, t }))
  const [toggle] = findAll(tree, (element) => element.props.role === 'switch')
  toggle.props.onClick()
  assert.equal(calls.length, 1, 'the second click must reach the controller, not be dropped')
})

function toggleController(module, dictionaries, { onUpdate }) {
  const calls = []
  const state = {
    managed: [managedServer()],
    profileRows: [],
    groups: [],
    configErrors: [],
    diagnostics: { canWrite: true, mcpModule: { ok: true, error: '' }, checkedFiles: 1, scanFailure: '', generatedAt: Date.now() },
  }
  const ctx = {
    connection: {
      rpc: {
        async call(channel, endpoint, payload) {
          calls.push(payload.endpoint)
          if (payload.endpoint === 'update') return onUpdate(payload)
          if (payload.endpoint === 'remove') return { ok: true, value: { saved: true } }
          return { ok: true, value: JSON.parse(JSON.stringify(state)) }
        },
      },
    },
  }
  const dictionary = dictionaries.get('mcp-config')
  const t = (key) => (dictionary.zh && dictionary.zh[key]) || key
  const api = module.__internals.createApi(ctx)
  return { controller: module.__internals.createController(api, t), calls }
}

test('a toggle flips the row before the Host answers, then settles', async () => {
  const module = await loadClient()
  const { ctx, dictionaries } = fakeApplyContext()
  module.apply(ctx)
  const { controller, calls } = toggleController(module, dictionaries, {
    onUpdate: async () => ({ ok: true, value: { saved: true, name: 'context7' } }),
  })
  await controller.reload()
  const [server] = controller.getSnapshot().data.managed
  const beginning = controller.setEnabled(server)

  // The click must not wait for the round trip.
  assert.equal(controller.getSnapshot().data.managed[0].disabled, true)
  assert.equal(controller.getSnapshot().data.managed[0].status, 'disabled')
  assert.deepEqual(Array.from(controller.getSnapshot().pending), ['toggle:id-1'])

  await beginning
  assert.deepEqual(calls, ['state', 'update', 'state'], 'write first, then a quiet re-read')
  assert.deepEqual(Array.from(controller.getSnapshot().pending), [], 'the lock is released after the write')
  assert.equal(controller.getSnapshot().toast, null, 'a successful toggle stays silent')
  controller.dispose()
})

test('a refused toggle rolls the row back and leaves the page usable', async () => {
  const module = await loadClient()
  const { ctx, dictionaries } = fakeApplyContext()
  module.apply(ctx)
  const { controller } = toggleController(module, dictionaries, {
    onUpdate: async () => ({ ok: false, error: { code: 'mcp-config/internal', message: 'Host refused the write' } }),
  })
  await controller.reload()
  const [server] = controller.getSnapshot().data.managed
  await controller.setEnabled(server)

  const row = controller.getSnapshot().data.managed[0]
  assert.equal(row.disabled, false, 'the switch returns to the Host state')
  assert.equal(row.status, 'enabled')
  assert.deepEqual(Array.from(controller.getSnapshot().pending), [], 'a failure never leaves a control stuck busy')
  assert.equal(controller.getSnapshot().toast.tone, 'error')
  controller.dispose()
})

test('a mutation that never answers releases its control on the UI timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const module = await loadClient()
  const { ctx, dictionaries } = fakeApplyContext()
  module.apply(ctx)
  const { controller } = toggleController(module, dictionaries, {
    onUpdate: () => new Promise(() => {}),
  })
  await controller.reload()
  const [server] = controller.getSnapshot().data.managed
  void controller.setEnabled(server)
  assert.deepEqual(Array.from(controller.getSnapshot().pending), ['toggle:id-1'])

  // The write leaves after the settle window, then the Host never answers.
  const settle = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve() }
  t.mock.timers.tick(module.__limits.toggleSettleMs)
  await settle()
  assert.deepEqual(Array.from(controller.getSnapshot().pending), ['toggle:id-1'])
  t.mock.timers.tick(module.__limits.mutationLockMs - 1)
  await settle()
  assert.deepEqual(Array.from(controller.getSnapshot().pending), ['toggle:id-1'])

  // A request lost in the plugin restart must not keep the row busy forever.
  t.mock.timers.tick(2)
  await settle()
  assert.deepEqual(Array.from(controller.getSnapshot().pending), [])
  assert.equal(controller.getSnapshot().data.managed[0].disabled, false, 'the row falls back to the confirmed state')
  controller.dispose()
})

test('a fast on/off click pair never reaches the Host at all', async () => {
  const module = await loadClient()
  const { ctx, dictionaries } = fakeApplyContext()
  module.apply(ctx)
  const { controller, calls } = toggleController(module, dictionaries, {
    onUpdate: async () => ({ ok: true, value: { saved: true } }),
  })
  await controller.reload()
  const [server] = controller.getSnapshot().data.managed

  void controller.setEnabled(server)
  void controller.setEnabled(server)
  assert.equal(controller.getSnapshot().data.managed[0].disabled, false, 'the UI follows the newest click')

  await new Promise((resolve) => setTimeout(resolve, module.__limits.toggleSettleMs * 2 + 100))
  assert.deepEqual(calls, ['state'], 'landing back on the original state writes nothing')
  assert.equal(controller.getSnapshot().data.managed[0].disabled, false)
  controller.dispose()
})

test('a click during a write is honoured once the write returns', async () => {
  const module = await loadClient()
  const { ctx, dictionaries } = fakeApplyContext()
  module.apply(ctx)
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let gated = true
  const { controller, calls } = toggleController(module, dictionaries, {
    onUpdate: async () => {
      if (gated) {
        gated = false
        await gate
      }
      return { ok: true, value: { saved: true } }
    },
  })
  await controller.reload()
  const [server] = controller.getSnapshot().data.managed

  const first = controller.setEnabled(server)
  await new Promise((resolve) => setTimeout(resolve, module.__limits.toggleSettleMs + 60))
  assert.equal(controller.getSnapshot().data.managed[0].disabled, true, 'first write is in flight')
  assert.equal(calls.filter((call) => call === 'update').length, 1)

  // Turn it back on while the first write is still waiting for the Host.
  void controller.setEnabled(server)
  assert.equal(controller.getSnapshot().data.managed[0].disabled, false, 'the second click flips the row immediately')

  release()
  await first
  assert.equal(controller.getSnapshot().data.managed[0].disabled, false)
  assert.deepEqual(
    Array.from(controller.getSnapshot().pending),
    [],
    'the queue drains instead of staying busy',
  )
  assert.ok(calls.filter((call) => call === 'update').length >= 2, 'the second intent is written')
  controller.dispose()
})


test('deleting a row drops the switch write it still had queued', async () => {
  const module = await loadClient()
  const { ctx, dictionaries } = fakeApplyContext()
  module.apply(ctx)
  const { controller, calls } = toggleController(module, dictionaries, {
    onUpdate: async () => ({ ok: true, value: { saved: true } }),
  })
  await controller.reload()
  const [server] = controller.getSnapshot().data.managed

  const toggling = controller.setEnabled(server)
  const removing = controller.remove(server)
  await Promise.all([toggling, removing])

  assert.deepEqual(calls.filter((call) => call === 'update'), [], 'a server being deleted is never written again')
  assert.ok(calls.includes('remove'))
  assert.deepEqual(Array.from(controller.getSnapshot().pending), [], 'both operations release their keys')
  controller.dispose()
})
