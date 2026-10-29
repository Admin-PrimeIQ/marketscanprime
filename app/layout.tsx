import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { NextIntlClientProvider } from 'next-intl';
import { AuthProvider } from "@/context/AuthContext"
import { ThemeProvider } from "@/components/theme-provider"
import { cookies } from 'next/headers';
import { defaultLocale } from '@/i18n';
import messagesEs from '@/messages/es.json';
import messagesEn from '@/messages/en.json';
import "./globals.css"

// Inter font - Similar to Notion's typography
const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600", "700"],
})

export const metadata: Metadata = {
  title: "Market Scan - Prime IQ Admin",
  description: "Sistema de gestión de datos de Market Scan para proyectos inmobiliarios",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Sin try/catch: al prerenderizar, `cookies()` lanza el error con el que Next marca la ruta como
  // dinámica, y atraparlo rompe esa detección.
  const cookieStore = await cookies();
  const locale: 'es' | 'en' = cookieStore.get('locale')?.value === 'en' ? 'en' : defaultLocale;
  const messages = locale === 'en' ? messagesEn : messagesEs;

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`} suppressHydrationWarning>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem={false}
            disableTransitionOnChange
          >
            <AuthProvider>
              {children}
            </AuthProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
        <div id="portal" />
      </body>
    </html>
  )
}
