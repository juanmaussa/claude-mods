export type UsageWindow = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'usage-bars': {
      snapshot: UsageWindow[] | null
      tick: number
      warned: Record<string, number>
    }
  }
}
