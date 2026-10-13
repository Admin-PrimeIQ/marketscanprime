/**
 * Utilidades de autenticación
 * Funciones auxiliares para manejar la autenticación y sesiones
 */

import { strapiClient, type StrapiUser, type StrapiAuthResponse } from '@/lib/api/strapi'

export interface AuthSession {
  user: StrapiUser
  token: string
  expiresAt?: number
}

const SESSION_KEY = 'auth_session'
const USER_KEY = 'auth_user'

/**
 * Guarda la sesión del usuario de forma segura
 */
export function saveSession(authResponse: StrapiAuthResponse): void {
  if (typeof window === 'undefined') return

  const session: AuthSession = {
    user: authResponse.user,
    token: authResponse.jwt,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 días
  }

  // Guardar sesión completa
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  
  // Guardar usuario por separado para acceso rápido
  localStorage.setItem(USER_KEY, JSON.stringify(authResponse.user))
}

/**
 * Obtiene la sesión actual del usuario
 */
export function getSession(): AuthSession | null {
  if (typeof window === 'undefined') return null

  const sessionStr = localStorage.getItem(SESSION_KEY)
  if (!sessionStr) return null

  try {
    const session: AuthSession = JSON.parse(sessionStr)
    
    // Verificar si la sesión expiró
    if (session.expiresAt && session.expiresAt < Date.now()) {
      clearSession()
      return null
    }

    return session
  } catch {
    clearSession()
    return null
  }
}

/**
 * Obtiene el usuario actual
 */
export function getCurrentUser(): StrapiUser | null {
  if (typeof window === 'undefined') return null

  const userStr = localStorage.getItem(USER_KEY)
  if (!userStr) return null

  try {
    return JSON.parse(userStr)
  } catch {
    return null
  }
}

/**
 * Limpia la sesión del usuario
 */
export function clearSession(): void {
  if (typeof window === 'undefined') return

  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(USER_KEY)
  strapiClient.logout()
}

/**
 * Verifica si el usuario está autenticado
 */
export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false

  const session = getSession()
  return !!session && strapiClient.isAuthenticated()
}

/**
 * Actualiza la información del usuario en la sesión
 */
export function updateUser(user: StrapiUser): void {
  if (typeof window === 'undefined') return

  const session = getSession()
  if (session) {
    session.user = user
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  }
}

