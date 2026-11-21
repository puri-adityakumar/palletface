/**
 * Playwright browser registry for constrained qualification sandboxes.
 * It permits only one browser engine process tree at a time. Engines are
 * started on first context use, contexts are tracked and closed by their
 * owner, and switching engines is rejected while any context remains open.
 */
export function createSerializedBrowserRegistry(playwright, names, { onLifecycle = () => {} } = {}) {
  const states = Object.fromEntries(names.map((name) => [name, {
    name,
    browser: null,
    contexts: new Set(),
    version: null,
  }]))

  async function closeEngine(state) {
    if (!state.browser) return
    if (state.contexts.size) {
      throw new Error(`cannot close ${state.name}: ${state.contexts.size} context(s) remain open`)
    }
    const browser = state.browser
    state.browser = null
    await browser.close()
    onLifecycle({ event: 'browser-closed', engine: state.name })
  }

  async function ensureEngine(state) {
    for (const other of Object.values(states)) {
      if (other === state || !other.browser) continue
      if (other.contexts.size) {
        throw new Error(`cannot start ${state.name}: ${other.name} still has ${other.contexts.size} open context(s)`)
      }
      await closeEngine(other)
    }
    if (!state.browser) {
      state.browser = await playwright[state.name].launch({ headless: true })
      state.version = state.browser.version()
      onLifecycle({ event: 'browser-started', engine: state.name, version: state.version })
    }
    return state.browser
  }

  const browsers = Object.fromEntries(Object.entries(states).map(([name, state]) => [name, {
    version: () => state.version,
    newContext: async (...args) => {
      const browser = await ensureEngine(state)
      const context = await browser.newContext(...args)
      state.contexts.add(context)
      let closePromise = null
      const originalClose = context.close.bind(context)
      context.close = (...closeArgs) => {
        if (closePromise) return closePromise
        closePromise = (async () => {
          try {
            return await originalClose(...closeArgs)
          } finally {
            state.contexts.delete(context)
            onLifecycle({ event: 'context-closed', engine: name, activeContexts: state.contexts.size })
          }
        })()
        return closePromise
      }
      onLifecycle({ event: 'context-opened', engine: name, activeContexts: state.contexts.size })
      return context
    },
    close: () => closeEngine(state),
  }]))

  return {
    browsers,
    versions: () => Object.fromEntries(Object.entries(states).map(([name, state]) => [name, state.version])),
    async closeAll() {
      for (const state of Object.values(states)) {
        for (const context of [...state.contexts]) {
          try { await context.close() } catch { /* caller records phase failures */ }
        }
        if (state.browser) await closeEngine(state)
      }
    },
  }
}
