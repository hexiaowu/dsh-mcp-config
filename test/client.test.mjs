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
