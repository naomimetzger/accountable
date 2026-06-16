import type { Address } from 'viem'

export type HistoryDay = {
  date: string
  label: string
  completed: boolean
  isToday: boolean
}

const COMPLETION_HISTORY_KEY = 'accountable:completion-history'

export function localDateString(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return year + '-' + month + '-' + day
}

function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function shiftLocalDate(dateString: string, days: number): string {
  const date = parseLocalDate(dateString)
  date.setDate(date.getDate() + days)
  return localDateString(date)
}

function completionHistoryKey(address: Address, groupId: number): string {
  return COMPLETION_HISTORY_KEY + ':' + groupId + ':' + address.toLowerCase()
}

export function readCompletionHistory(address: Address, groupId: number): Set<string> {
  try {
    const raw = localStorage.getItem(completionHistoryKey(address, groupId))
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((value): value is string => typeof value === 'string'))
  } catch {
    return new Set()
  }
}

function saveCompletionHistory(address: Address, groupId: number, dates: Set<string>) {
  localStorage.setItem(
    completionHistoryKey(address, groupId),
    JSON.stringify([...dates].sort()),
  )
}

export function areAllGoalsComplete(completions: boolean[]): boolean {
  return completions.length > 0 && completions.every(Boolean)
}

/** Off-chain only: records a local day when on-chain goals are all complete. */
export function recordCompletedDay(address: Address, groupId: number, date = localDateString()): Set<string> {
  const history = readCompletionHistory(address, groupId)
  if (!history.has(date)) {
    history.add(date)
    saveCompletionHistory(address, groupId, history)
  }
  return history
}

export function calculateStreak(history: Set<string>, today = localDateString()): number {
  if (!history.has(today)) return 0
  let streak = 0
  let cursor = today
  while (history.has(cursor)) {
    streak += 1
    cursor = shiftLocalDate(cursor, -1)
  }
  return streak
}

export function buildRecentHistory(history: Set<string>, days = 7, today = localDateString()): HistoryDay[] {
  return Array.from({ length: days }, (_, index) => {
    const offset = days - 1 - index
    const date = shiftLocalDate(today, -offset)
    const label = offset === 0
      ? 'Today'
      : parseLocalDate(date).toLocaleDateString('en-GB', { weekday: 'short' })
    return {
      date,
      label,
      completed: history.has(date),
      isToday: offset === 0,
    }
  })
}
