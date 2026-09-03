/**
 * Host entry point.
 *
 * The host half is intentionally empty: per the DSH architecture split
 * (docs/architecture.md / cordis-plugin-development), this plugin is a
 * browser-only capability. There is no host-side service, tool, or
 * event subscription to register. The file exists so the package
 * `main` export resolves and the bundle can apply to the web profile
 * via cordis.patch.yml.
 */

export const hostApply = (): void => {
  // No-op.
}

export default hostApply
