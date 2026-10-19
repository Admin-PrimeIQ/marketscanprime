/**
 * La skill proteger-produccion pide las lecturas completas del RDS fuera del horario laboral
 * (7:00–19:00, hora de Guatemala, UTC-6 sin horario de verano).
 */
export const BUSINESS_START = 7
export const BUSINESS_END = 19

export function guatemalaHour(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Guatemala", hour: "numeric", hourCycle: "h23" }).format(now))
}

export function isBusinessHours(now: Date = new Date()): boolean {
  const hour = guatemalaHour(now)
  return hour >= BUSINESS_START && hour < BUSINESS_END
}
