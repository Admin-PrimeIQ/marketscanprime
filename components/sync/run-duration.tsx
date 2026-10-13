"use client"

import { useEffect, useState } from "react"

/**
 * Reloj de pared de una corrida.
 *
 * Una corrida terminada se calcula una vez y no vuelve a tocarse. Una en curso
 * necesita SU PROPIO tick: la página refresca cada 5 s, así que el contador
 * saltaba de 5 en 5 y se leía como congelado — justo lo contrario de lo que un
 * cronómetro tiene que transmitir mientras algo corre.
 */
function format(fromMs: number, toMs: number): string {
  const secs = Math.max(0, Math.round((toMs - fromMs) / 1000))
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ${secs % 60}s`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export function RunDuration({
  startedAt,
  finishedAt,
  className,
}: {
  startedAt: string
  finishedAt: string | null
  className?: string
}) {
  const start = new Date(startedAt).getTime()
  const isLive = !finishedAt

  // Arranca en el instante de inicio, no en Date.now(): el primer render tiene
  // que dar lo mismo en el servidor que en el cliente. El efecto corrige al
  // montar, antes de que se vea.
  const [now, setNow] = useState(start)

  useEffect(() => {
    if (!isLive) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [isLive, startedAt])

  const end = finishedAt ? new Date(finishedAt).getTime() : now
  return (
    <span className={className} suppressHydrationWarning>
      {format(start, end)}
    </span>
  )
}
