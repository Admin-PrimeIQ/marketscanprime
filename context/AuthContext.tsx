"use client"

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { type StrapiUser } from '@/lib/api/strapi'
import { dataClient } from '@/lib/api/client'
import { saveSession, clearSession, getSession, getCurrentUser, isAuthenticated, updateUser, type AuthSession } from '@/lib/auth/auth'

interface AuthContextType {
  user: StrapiUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (identifier: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<StrapiUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const router = useRouter()

  // Marcar como montado solo en el cliente y cargar usuario
  useEffect(() => {
    setMounted(true)
    
    const loadUser = async () => {
      try {
        setIsLoading(true)
        
        // Verificar si hay sesión guardada (solo en cliente)
        const session = getSession()
        const savedUser = getCurrentUser()

        if (session && savedUser && isAuthenticated()) {
          // Verificar que el token sigue siendo válido obteniendo el usuario actual
          try {
            const currentUser = await dataClient.getMe()
            setUser(currentUser)
            updateUser(currentUser)
          } catch (error) {
            // Token inválido, limpiar sesión
            console.error('Error al verificar sesión:', error)
            clearSession()
            setUser(null)
          }
        } else {
          setUser(null)
        }
      } catch (error) {
        console.error('Error al cargar usuario:', error)
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }

    loadUser()
  }, [])

  const login = useCallback(async (identifier: string, password: string) => {
    try {
      setIsLoading(true)
      const authResponse = await dataClient.login(identifier, password)
      
      // Guardar sesión
      saveSession(authResponse)
      // Obtener usuario completo con role (auth/local no devuelve role por defecto)
      const me = await dataClient.getMe()
      setUser(me)
      updateUser(me)

      // TEMPORARILY CHANGED: Redirigir a projects en lugar de dashboard
      router.push('/projects')
    } catch (error) {
      console.error('Error al iniciar sesión:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [router])

  const logout = useCallback(async () => {
    const session = getSession()
    if (session?.token) {
      try {
        await fetch("/api/exchange-rates", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.token}` },
          cache: "no-store",
        })
      } catch {
        /* seguir con cierre de sesión aunque falle la invalidación */
      }
    }
    clearSession()
    setUser(null)
    router.push("/login")
  }, [router])

  const refreshUser = useCallback(async () => {
    try {
      if (!isAuthenticated()) {
        setUser(null)
        return
      }

      const currentUser = await dataClient.getMe()
      setUser(currentUser)
      updateUser(currentUser)
    } catch (error) {
      console.error('Error al actualizar usuario:', error)
      // Si falla, puede ser que el token expiró
      clearSession()
      setUser(null)
      router.push('/login')
    }
  }, [router])

  // Solo verificar autenticación después de que el componente esté montado
  const isUserAuthenticated = mounted && !!user && isAuthenticated()

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: isUserAuthenticated,
    login,
    logout,
    refreshUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider')
  }
  return context
}

