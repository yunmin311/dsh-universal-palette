/**
 * Test helpers — minimal DOM polyfill so the aggregator + UI tests
 * can run under `node --test` without pulling in jsdom.
 *
 * Implementation note: the shim is intentionally loose. Node's DOM
 * typings come from `lib: ["DOM"]`; we type our fake classes as plain
 * classes with explicit casts at the seams so they don't fight the
 * global types.
 */

class FakeNode {
  children: any[] = []
  parentNode: FakeNode | null = null
  dataset: Record<string, string> = {}
  style: Record<string, string> = {}
  listeners: Record<string, Function[]> = {}
  textContent = ''
  nodeName: string

  constructor(nodeName: string) {
    this.nodeName = nodeName
  }

  appendChild<T>(child: T): T {
    this.children.push(child)
    if (child instanceof FakeNode) child.parentNode = this
    return child
  }
  removeChild(child: any): any {
    const i = this.children.indexOf(child)
    if (i >= 0) {
      this.children.splice(i, 1)
      if (child instanceof FakeNode) child.parentNode = null
    }
    return child
  }
  replaceChildren(...nodes: any[]): void {
    this.children = []
    for (const n of nodes) {
      if (n instanceof FakeNode) {
        this.children.push(n)
        n.parentNode = this
      }
    }
  }
  setAttribute(name: string, value: string): void {
    if (name === 'style') {
      const pairs = String(value).split(';')
      for (const p of pairs) {
        const [k, v] = p.split(':').map((s) => s && s.trim())
        if (k && v) this.style[k] = v
      }
      return
    }
    if (name === 'class') {
      this.className = value
    }
  }
  addEventListener(name: string, handler: any): void {
    ;(this.listeners[name.toLowerCase()] ||= []).push(handler)
  }
  removeEventListener(name: string): void {
    delete this.listeners[name.toLowerCase()]
  }
  focus(): void {
    // no-op in test env
  }
  get className(): string {
    return (this as unknown as { _className?: string })._className ?? ''
  }
  set className(v: string) {
    ;(this as unknown as { _className: string })._className = v
  }
}

class FakeElement extends FakeNode {
  id = ''
  constructor(nodeName: string) {
    super(nodeName.toUpperCase())
  }
  override setAttribute(name: string, value: string): void {
    if (name === 'class') this.className = value
    else if (name === 'id') this.id = value
    else super.setAttribute(name, value)
  }
}

class FakeInputElement extends FakeElement {
  type = ''
  value = ''
  spellcheck = false
  autocomplete = ''
  placeholder = ''
}

class FakeTextNode {
  nodeValue: string
  constructor(nodeValue: string) {
    this.nodeValue = nodeValue
  }
}

function isNode(v: unknown): v is Node {
  return v instanceof FakeNode || v instanceof FakeTextNode
}

const document: unknown = {
  createElement(tag: string): HTMLElement {
    if (tag.toLowerCase() === 'input') return new FakeInputElement('input') as unknown as HTMLElement
    return new FakeElement(tag) as unknown as HTMLElement
  },
  createTextNode(text: string): Text {
    return new FakeTextNode(text) as unknown as Text
  },
  body: new FakeElement('body'),
  activeElement: null as Element | null,
  dispatchEvent(): void {
    // no-op
  },
}

;(document as unknown as { activeElement: Element | null }).activeElement = null

export function installDomGlobals(): void {
  const g = globalThis as unknown as Record<string, unknown>
  if (!g.document) g.document = document
  if (!g.window) {
    const win = {
      addEventListener(): void {
        // no-op
      },
      removeEventListener(): void {
        // no-op
      },
    }
    g.window = win
  }
  if (!g.navigator) {
    g.navigator = {
      clipboard: undefined,
    }
  }
  if (!g.localStorage) {
    const store: Record<string, string> = {}
    g.localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v
      },
      removeItem: (k: string) => {
        delete store[k]
      },
    }
  }
}

installDomGlobals()

export const __testing = { FakeElement, FakeInputElement }
