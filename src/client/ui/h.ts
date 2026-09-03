/**
 * Tiny hyperscript helper used by the UI.
 *
 * We deliberately avoid React / Preact / lit dependencies — the plugin
 * is shipped as a single bundle that the DSH shell loads into a host
 * page. Pulling in a framework would balloon the install and create a
 * dependency contract DSH does not yet commit to across versions.
 *
 * `h()` returns a real DOM node so we can compose the palette from
 * declarative call sites without a JSX runtime.
 */

export type Ref<T extends Element = Element> = ((el: T | null) => void) | null

export type EventHandler<E extends Event = Event> = (e: E) => void

export type Component<P> = (props: P) => HTMLElement

type HyperscriptProps = Record<
  string,
  string | number | boolean | Ref | ((...args: never[]) => unknown) | undefined
>

function isRef(v: unknown): v is Ref {
  return typeof v === 'function'
}

export function h(
  tag: string,
  props: HyperscriptProps = {},
  ...children: Array<string | Node | null | undefined | false>
): HTMLElement {
  const el = document.createElement(tag)

  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue
    if (k === 'ref' && isRef(v)) {
      v(el)
      continue
    }
    if (k.startsWith('on') && typeof v === 'function') {
      const eventName = k.slice(2).toLowerCase()
      el.addEventListener(eventName, v as EventListener)
      continue
    }
    if (k === 'style' && typeof v === 'string') {
      el.setAttribute('style', v)
      continue
    }
    if (k === 'class') {
      el.setAttribute('class', String(v))
      continue
    }
    if (k === 'dataset' && v && typeof v === 'object') {
      for (const [dk, dv] of Object.entries(v as Record<string, string>)) {
        el.dataset[dk] = dv
      }
      continue
    }
    if (typeof v === 'boolean') {
      if (v) el.setAttribute(k, '')
      continue
    }
    el.setAttribute(k, String(v))
  }

  for (const c of children) {
    if (c === null || c === undefined || c === false) continue
    if (typeof c === 'string' || typeof c === 'number') {
      el.appendChild(document.createTextNode(String(c)))
    } else {
      el.appendChild(c)
    }
  }

  return el
}
