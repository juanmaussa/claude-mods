// usage-bars: uso del plan (ventanas de 5 h y 7 d) como barras finas sobre el prompt.
// Las cifras las entrega el propio Claude Code (session.measure / $.session.usage): no hay
// consultas de red. El temporizador solo vuelve a dibujar la cuenta regresiva.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { UsageWindow } from '../types'

const CELLS = 8
const TICK_MS = 120_000 // 2 minutos
const WARN_AT = 90
const ACCENT = 'green'
const TRACK = '#363636' // gris solido muy tenue para el tramo vacio de la barra
const LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'gasto' }
const ORDER = ['five_hour', 'seven_day', 'spend_limit']

const snapshot = atom({ plugin: 'usage-bars', key: 'snapshot' } as const, null as UsageWindow[] | null)
const tick = atom({ plugin: 'usage-bars', key: 'tick' } as const, 0)
const warned = atom({ plugin: 'usage-bars', key: 'warned' } as const, {} as Record<string, number>)

type Segment = { text: string; color?: string; dim?: boolean; bold?: boolean }
type Part = { isPrimary: boolean; segments: Segment[] }

export const register: Register = on => {
  let timer: { cancel(): void } | undefined

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    timer?.cancel()
    timer = $.clock.every(TICK_MS, () => {
      void (async () => {
        const snap = await read($, snapshot)
        if (snap?.some(w => w.resetsAt)) await update($, tick, n => n + 1)
      })().catch(() => {})
    })
    const usage = await $.session.usage().catch(() => null)
    if (usage) await take($, usage.rateLimits).catch(() => {})
    return result
  })

  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    await take($, e.rateLimits).catch(() => {})
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    await read($, tick)
    const snap = await read($, snapshot)
    if (e.props.hasSurvey || !snap) return rest

    const parts = fit(build(snap, await $.clock.now()), e.props.bodyColumns - 2)
    if (parts.length === 0) return rest

    const { Box, Text } = $.ui.resolve(e)
    const segments: Segment[] = [{ text: '▎', color: ACCENT, bold: true }]
    parts.forEach((p, i) => {
      if (i > 0) segments.push({ text: '   ' })
      segments.push(...p.segments)
    })

    const mine = (
      <Box flexDirection="row" paddingX={1}>
        {segments.map((s, i) => (
          <Text key={String(i)} color={s.color} dimColor={s.dim} bold={s.bold} wrap="truncate">
            {s.text}
          </Text>
        ))}
      </Box>
    )
    // Con otras bandas ya dibujadas (rest) se arma una columna con la forma que el motor acepta
    return rest
      ? { type: 'Box', props: { key: 'bands', flexDirection: 'column' }, children: [mine, rest] }
      : mine
  })
}

async function take($: EngineInterface, rateLimits: readonly UsageWindow[]) {
  const windows = rateLimits
    .filter(w => Number.isFinite(w.percentUsed))
    .map(w => ({ kind: w.kind, percentUsed: w.percentUsed, resetsAt: w.resetsAt }))
  // Una medición sin ventanas (aún sin lectura) no borra la última cifra conocida
  if (windows.length === 0) return
  await update($, snapshot, () => windows)
  await warn($, windows)
}

// Un aviso por ventana y por periodo, al pasar de WARN_AT.
async function warn($: EngineInterface, windows: UsageWindow[]) {
  const done = await read($, warned)
  const now = await $.clock.now()
  const fresh: Record<string, number> = {}
  const rearm: string[] = []
  for (const w of windows) {
    const resetMs = resetTime(w)
    if (w.percentUsed < WARN_AT) {
      if (resetMs === 0 && done[w.kind] !== undefined) rearm.push(w.kind)
      continue
    }
    const last = done[w.kind]
    if (last !== undefined && resetMs <= last + 30 * 60_000) continue
    fresh[w.kind] = resetMs
    const when = resetMs > 0 ? `, reinicia en ${countdown(resetMs - now)}` : ''
    $.ui.toast(`Límite ${label(w.kind)} al ${Math.round(w.percentUsed)}%${when}`)
  }
  if (Object.keys(fresh).length > 0 || rearm.length > 0) {
    await update($, warned, (old: Record<string, number>) => {
      const next = { ...old, ...fresh }
      for (const kind of rearm) delete next[kind]
      return next
    })
  }
}

export function build(windows: UsageWindow[], now: number): Part[] {
  return windows
    .filter(w => !isStale(w, now))
    .sort((a, b) => rank(a.kind) - rank(b.kind))
    .map((w, i) => {
      const color = colorFor(w.percentUsed)
      const filled = fillCells(w.percentUsed)
      const segments: Segment[] = [
        { text: `${label(w.kind)} `, dim: true },
        { text: '█'.repeat(filled), color },
        { text: '█'.repeat(CELLS - filled), color: TRACK },
        { text: ` ${Math.round(w.percentUsed)}%`, color },
      ]
      const resetMs = resetTime(w)
      // La primera ventana siempre muestra el reinicio; las demás solo cuando van altas
      if (resetMs > 0 && w.kind === 'seven_day') {
        // La semana se reinicia un dia y hora concretos: Dom 7pm
        segments.push({ text: ` ↻ ${weekday(resetMs)}`, dim: true })
      } else if (resetMs > 0 && (i === 0 || w.percentUsed >= 75)) {
        segments.push({ text: ` ↻${countdown(resetMs - now)}`, dim: true })
      }
      return { isPrimary: i === 0, segments }
    })
}

// Si no cabe, se descartan primero las ventanas secundarias.
export function fit(parts: Part[], columns: number): Part[] {
  const kept = [...parts]
  while (width(kept) > columns && kept.length > 1) kept.pop()
  return kept
}

function width(parts: Part[]) {
  const text = parts.map(p => p.segments.map(s => s.text).join('')).join('   ')
  return 2 + [...text].length
}

export function fillCells(percent: number) {
  const p = Math.min(Math.max(percent, 0), 100)
  const cells = Math.round((p / 100) * CELLS)
  return p > 0 ? Math.max(cells, 1) : 0
}

export function colorFor(percent: number) {
  if (percent >= 90) return 'red'
  if (percent >= 75) return 'yellow'
  return ACCENT
}

export function countdown(ms: number) {
  const minutes = Math.max(0, Math.ceil(ms / 60_000))
  if (minutes < 1) return 'ya'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h${String(minutes % 60).padStart(2, '0')}`
  return `${Math.floor(hours / 24)}d${hours % 24}h`
}

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

// Dia y hora local del reinicio: "Dom 7pm", "Lun 9:30am"
export function weekday(ms: number) {
  const d = new Date(ms)
  const h = d.getHours()
  const m = d.getMinutes()
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${DAYS[d.getDay()]} ${hour}${m ? ':' + String(m).padStart(2, '0') : ''}${h < 12 ? 'am' : 'pm'}`
}

function resetTime(w: UsageWindow) {
  const ms = w.resetsAt ? Date.parse(w.resetsAt) : NaN
  return Number.isFinite(ms) ? ms : 0
}

function isStale(w: UsageWindow, now: number) {
  const resetMs = resetTime(w)
  return resetMs > 0 && resetMs <= now
}

function label(kind: string) {
  return LABELS[kind] ?? kind.replace(/_/g, ' ')
}

function rank(kind: string) {
  const i = ORDER.indexOf(kind)
  return i < 0 ? ORDER.length : i
}
