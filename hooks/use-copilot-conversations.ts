"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "@/context/AuthContext"
import {
  createPrimeiqChatSession,
  listPrimeiqChatSessions,
  renamePrimeiqChatSession,
  type PrimeiqChatSession,
} from "@/lib/copilot/primeiq-chat-session-api"
import {
  archiveSessionInSidebar,
  isSessionArchived,
  unarchiveSessionInSidebar,
  setSessionsArchived,
} from "@/lib/copilot/n8n-chat-archived-sessions"
import type { CopilotConversation } from "@/lib/copilot/conversations"

function sessionToConversation(s: PrimeiqChatSession): CopilotConversation {
  return {
    id: s.id,
    title: s.name?.trim() || `Chat …${s.id.slice(-8)}`,
    createdAt: Date.parse(s.created_at) || Date.now(),
    updatedAt: Date.parse(s.updated_at) || Date.now(),
  }
}

export function useCopilotConversations() {
  const { user } = useAuth()
  const email = user?.email ?? null

  const [sessions, setSessions] = useState<PrimeiqChatSession[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [listVersion, setListVersion] = useState(0)
  const [archiveBump, setArchiveBump] = useState(0)

  useEffect(() => {
    if (!email) {
      setSessions([])
      setReady(true)
      return
    }
    let cancelled = false
    setLoading(true)
    void listPrimeiqChatSessions(email)
      .then((rows) => {
        if (!cancelled) {
          setSessions(rows)
          setError(null)
          setReady(true)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setReady(true)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [email, listVersion])

  const conversations = useMemo<CopilotConversation[]>(() => {
    void archiveBump
    return sessions
      .filter((s) => !isSessionArchived(s.id))
      .map(sessionToConversation)
  }, [sessions, archiveBump])

  const archivedConversations = useMemo<CopilotConversation[]>(() => {
    void archiveBump
    return sessions
      .filter((s) => isSessionArchived(s.id))
      .map(sessionToConversation)
  }, [sessions, archiveBump])

  const refresh = useCallback(() => {
    setListVersion((v) => v + 1)
  }, [])

  /**
   * Crea una sesión nueva en n8n y devuelve su id, o null si hay error.
   * Esta función reemplaza el antiguo `register(entry)` que guardaba en localStorage.
   */
  const register = useCallback(async (): Promise<string | null> => {
    if (!email) return null
    setError(null)
    try {
      const session = await createPrimeiqChatSession({ email })
      setListVersion((v) => v + 1)
      return session.id
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    }
  }, [email])

  /**
   * Archiva una sesión en el sidebar (sessionStorage).
   * No borra nada en n8n; el historial sigue en el servidor.
   */
  const archive = useCallback((id: string) => {
    archiveSessionInSidebar(id)
    setArchiveBump((n) => n + 1)
  }, [])

  const unarchive = useCallback((id: string) => {
    unarchiveSessionInSidebar(id)
    setArchiveBump((n) => n + 1)
  }, [])

  /**
   * Archiva o desarchiva varias conversaciones con un solo refresco.
   *
   * Llamar `archive` en un bucle escribiría el storage y volvería a calcular la
   * lista una vez por conversación. Con veinte marcadas eso se nota.
   */
  const setArchived = useCallback((ids: string[], archivado: boolean) => {
    if (!ids.length) return
    setSessionsArchived(ids, archivado)
    setArchiveBump((n) => n + 1)
  }, [])

  /** Renombra una sesión vía la Sessions API de n8n. */
  const rename = useCallback(
    async (id: string, title: string): Promise<void> => {
      if (!email) return
      setError(null)
      try {
        await renamePrimeiqChatSession({ id, name: title, email })
        setListVersion((v) => v + 1)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [email],
  )

  return {
    conversations,
    archivedConversations,
    ready,
    loading,
    error,
    email,
    refresh,
    register,
    archive,
    unarchive,
    setArchived,
    rename,
  }
}
