import type { ReactNode } from "react"
import { CopilotsChrome } from "@/components/copilots/copilots-chrome"
import { N8nChatStylesheet } from "@/components/copilots/n8n-chat-stylesheet"

export default function CopilotsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <N8nChatStylesheet />
      <CopilotsChrome>{children}</CopilotsChrome>
    </>
  )
}
