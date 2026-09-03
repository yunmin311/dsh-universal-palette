/**
 * Integration smoke test: activate client + mount UI under the
 * minimal DOM shim.
 *
 * Verifies the V1 contract:
 *   - capability probe reports the host surface
 *   - palette mounts when shell.overlay is present
 *   - palette DISABLES (no DOM mutation) when shell.overlay is absent
 *   - dispose removes listeners + DOM
 */

import '../dom-shim.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activateClient, type ClientHandle } from '../../src/client/index.ts'
import type { HostSurface } from '../../src/client/capabilities.ts'

const fullHost: HostSurface = {
  version: '0.1.2-rc.1',
  hasShellOverlaySlot: true,
  commands: {
    list: async () => [{ name: 'compact', description: 'Compact current session' }],
    find: async () => undefined,
    execute: async () => ({ kind: 'success' }),
  },
  sessions: {
    list: async () => [
      { id: 's1', title: 'Auth refactor', workspaceId: 'w1', updatedAt: Date.now() },
    ],
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

test('activateClient mounts when shell.overlay is present', async () => {
  let client: ClientHandle | undefined
  try {
    const overlayRoot = document.createElement('div')
    overlayRoot.dataset['shellOverlayRoot'] = 'true'
    client = activateClient({
      host: fullHost,
      overlay: { shellOverlayRoot: overlayRoot },
    })
    await waitForReady(client)
    const r = client.capabilityReport()
    assert.equal(r!.commands, true)
    assert.equal(r!.sessions, true)
    assert.equal(r!.shellOverlaySlot, true)
    assert.equal(client.isMounted(), true)
  } finally {
    client?.dispose()
  }
})

test('activateClient fails closed when shell.overlay is absent', async () => {
  let client: ClientHandle | undefined
  try {
    const bodyChildrenBefore = document.body.children.length
    client = activateClient({
      host: fullHost,
      overlay: { shellOverlayRoot: null },
    })
    await waitForReady(client)
    assert.equal(client.isMounted(), false, 'palette must not mount without shell.overlay')
    // No DOM mutation on document.body — release-blocker item 5.
    assert.equal(document.body.children.length, bodyChildrenBefore)
  } finally {
    client?.dispose()
  }
})

test('dispose removes the host element', async () => {
  let client: ClientHandle | undefined
  try {
    const overlayRoot = document.createElement('div')
    client = activateClient({
      host: fullHost,
      overlay: { shellOverlayRoot: overlayRoot },
    })
    await waitForReady(client)
    assert.equal(client.isMounted(), true)
    client.dispose()
    // After dispose, overlayRoot has zero children.
    assert.equal(overlayRoot.children.length, 0)
  } finally {
    client?.dispose()
  }
})
