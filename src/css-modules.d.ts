declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
  export const cssText: string
}
