/**
 * Host apply — Node half of the dual-face plugin.
 *
 * Universal Palette is a browser-side capability; the host half is
 * empty (no host-side services, no events, no tools). It exists so
 * the package's `lib/index.js` and the `dsh.bundle` field in
 * `cordis.patch.yml` are well-formed.
 */

export const hostApply = (): void => {
  // No-op.
}

export default hostApply
