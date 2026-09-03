/**
 * Deterministic, no-LLM fuzzy + subsequence + alias matcher.
 *
 * Returns a score in [0, 1] where 1 = exact title match and 0 = no hit.
 *
 * Algorithm (chosen for stability + tiny code, spec §7):
 *   - empty query          -> 0
 *   - exact match (case-insensitive) -> 1
 *   - prefix match         -> 0.92
 *   - alias exact          -> 0.95 (aliases are user-defined shortcuts)
 *   - subsequence match    -> decays with gap distance; the closer the
 *                             subsequence is to a prefix, the higher the
 *                             score; also rewards early-start matches
 *
 * This is intentionally NOT a fuzzy-edit-distance algorithm — DSH ships
 * its own cmdk-style ranking in ui-commands. We deliberately diverge so
 * that Universal Palette's ranking has its own explainable signature
 * (frecency + context), not a re-implementation of the slash-command
 * ranker. That separation is part of why this is not a duplicate of
 * dsh-spotlight (spec §2 conflict matrix).
 */

export interface MatchInput {
  readonly title: string
  readonly subtitle?: string
  readonly keywords?: readonly string[]
  readonly aliases?: readonly string[]
}

export interface MatchResult {
  readonly score: number
  /** Substring ranges of `title` that matched; used for keyword highlighting. */
  readonly ranges: readonly Range[]
}

export interface Range {
  readonly start: number
  readonly end: number
}

function lower(s: string): string {
  return s.toLowerCase()
}

function findRanges(haystack: string, needle: string): Range[] {
  if (needle.length === 0) return []
  const ranges: Range[] = []
  let from = 0
  while (from <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, from)
    if (idx < 0) break
    ranges.push({ start: idx, end: idx + needle.length })
    from = idx + needle.length
  }
  return ranges
}

/** Returns the longest contiguous subsequence match as a Range[], or null. */
function subsequence(haystack: string, needle: string): Range[] | null {
  const h = lower(haystack)
  const n = lower(needle)
  if (n.length === 0) return []
  const ranges: Range[] = []
  let hi = 0
  for (let ni = 0; ni < n.length; ni++) {
    const ch = n.charCodeAt(ni)
    let found = -1
    for (let j = hi; j < h.length; j++) {
      if (h.charCodeAt(j) === ch) {
        found = j
        break
      }
    }
    if (found < 0) return null
    ranges.push({ start: found, end: found + 1 })
    hi = found + 1
  }
  return ranges
}

export function matchItem(query: string, input: MatchInput): MatchResult {
  const q = query.trim()
  if (q.length === 0) return { score: 0, ranges: [] }

  const title = input.title
  const lt = lower(title)
  const lq = lower(q)

  // 1. exact title (case-insensitive)
  if (lt === lq) return { score: 1, ranges: [{ start: 0, end: title.length }] }

  // 2. alias exact
  if (input.aliases && input.aliases.length > 0) {
    for (const a of input.aliases) {
      if (lower(a) === lq) {
        return { score: 0.95, ranges: findRanges(lt, lq) }
      }
    }
  }

  // 3. prefix on title
  if (lt.startsWith(lq)) {
    return { score: 0.92, ranges: [{ start: 0, end: q.length }] }
  }

  // 4. prefix on subtitle
  if (input.subtitle && lower(input.subtitle).startsWith(lq)) {
    return { score: 0.7, ranges: [] }
  }

  // 5. keyword prefix
  if (input.keywords) {
    for (const k of input.keywords) {
      if (lower(k).startsWith(lq)) {
        return { score: 0.72, ranges: [] }
      }
      if (lower(k) === lq) {
        return { score: 0.82, ranges: [] }
      }
    }
  }

  // 6. subsequence in title (the typical fuzzy case)
  const sub = subsequence(title, q)
  if (sub) {
    const totalSpan = sub[sub.length - 1]!.end - sub[0]!.start
    const density = q.length / Math.max(totalSpan, 1)
    const early = 1 - sub[0]!.start / Math.max(lt.length, 1)
    const score = Math.min(0.86, 0.55 + 0.20 * density + 0.11 * early)
    return { score, ranges: sub }
  }

  // 7. subsequence in subtitle
  if (input.subtitle) {
    const sub = subsequence(input.subtitle, q)
    if (sub) return { score: 0.45, ranges: [] }
  }

  // 8. subsequence in keywords
  if (input.keywords) {
    for (const k of input.keywords) {
      if (subsequence(k, q)) return { score: 0.5, ranges: [] }
    }
  }

  return { score: 0, ranges: [] }
}
