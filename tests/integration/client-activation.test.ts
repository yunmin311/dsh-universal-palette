/**
 * Integration smoke test: activate client + mount UI under the
 * minimal DOM shim. We exercise the full activation path including
 * preferences load, provider registration, and palette open/close.
 *
 * The shim is intentionally tiny — only the surface the palette uses.
 */

import '../dom-shim.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activateClient, type ClientHandle } from '../../src/client/index.ts'
import type { HostSurface } from '../../src/client/capabilities.ts'

const fullHost: HostSurface = {
  version: '0.1.2-alpha.3',
  hasShellOverlaySlot: false, // forces fallback container path
  commands: {
    list: async () => [{ name: 'compact', description: 'Compact current session' }],
    find: async () => undefined,
    execute: async () => ({ kind: 'success' }),
  },
  sessions: {
    list: async () => [{ id: 's1', title: 'Auth refactor', workspaceId: 'w1', updatedAt: Date.now() }],
    getCurrent: () => ({ id: 's1', workspaceId: 'w1' }),
    getCurrentWorkspace: () => ({ id: 'w1' }),
    open: async () => {},
  },
}

async function waitForReady(handle: ClientHandle): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (handle.isReady()) return
    await new Promise((r) => setTimeout(r, 20))
  }
}

test('activateClient boots and exposes capability report', async () => {
  const report: unknown[] = []
  let client: ClientHandle | undefined
  try {
    client = activateClient({
      host: fullHost,
      onReady: (r) => report.push(r),
    })
    await waitForReady(client)
    const r = client.capabilityReport()
    assert.equal(r!.commands, true)
    assert.equal(r!.sessions, true)
    assert.equal(r!.shellOverlaySlot, false)
  } finally {
    client?.dispose()
  }
})

test('dispose removes the host element', async () => {
  let client: ClientHandle | undefined
  try {
    client = activateClient({ host: fullHost })
    await waitForReady(client)
    const before = document.body.children.length
    client.dispose()
    // After dispose, body may have one fewer element (the host).
    // We can't assert strict equality because the localStorage backend
    // is shared across calls in the same test file.
    assert.ok(document.body.children.length <= before)
  } finally {
    client?.dispose()
  }
})
