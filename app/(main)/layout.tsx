import type React from "react"
import { MainLayoutClient } from "@/components/main-layout-client"

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <MainLayoutClient>{children}</MainLayoutClient>
}
