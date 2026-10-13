"use client"

import React, { createContext, useContext } from "react"
import { useCopilotConversations } from "@/hooks/use-copilot-conversations"

type CopilotContextValue = ReturnType<typeof useCopilotConversations>

const CopilotContext = createContext<CopilotContextValue | null>(null)

export function CopilotProvider({ children }: { children: React.ReactNode }) {
  const value = useCopilotConversations()
  return <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>
}

export function useCopilotContext() {
  const ctx = useContext(CopilotContext)
  if (!ctx) {
    throw new Error("useCopilotContext must be used within CopilotProvider")
  }
  return ctx
}
