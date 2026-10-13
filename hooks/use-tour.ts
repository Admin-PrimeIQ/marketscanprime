"use client"

import { useState, useEffect, useCallback } from "react"

import { TOUR_ENABLED } from "@/lib/tour-utils"

const STORAGE_KEY_PREFIX = "tour_completed_"

export function useTour(section: string) {
  const storageKey = `${STORAGE_KEY_PREFIX}${section}`
  const [isActive, setIsActive] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    // El tour está apagado (ver TOUR_ENABLED en lib/tour-utils). Se sale acá y
    // no en cada página: son cinco, y una que se olvidara seguiría arrancando
    // el recorrido sola.
    if (!TOUR_ENABLED) return

    // Check if tour was already completed
    try {
      const completed = localStorage.getItem(storageKey)
      console.log(`Tour check for ${section}:`, { completed, storageKey })
      if (!completed) {
        // Small delay to ensure DOM is ready
        setTimeout(() => {
          console.log(`Activating tour for ${section}`)
          setIsActive(true)
        }, 1000)
      } else {
        console.log(`Tour already completed for ${section}`)
      }
    } catch (error) {
      console.error('Error accessing localStorage:', error)
      // If localStorage is not available, still show the tour
      setTimeout(() => {
        console.log(`Activating tour for ${section} (localStorage error)`)
        setIsActive(true)
      }, 1000)
    }
  }, [storageKey, mounted, section])

  const next = useCallback(() => {
    setCurrentStep((prev) => prev + 1)
  }, [])

  const previous = useCallback(() => {
    setCurrentStep((prev) => Math.max(0, prev - 1))
  }, [])

  const skip = useCallback(() => {
    setIsActive(false)
    localStorage.setItem(storageKey, "true")
  }, [storageKey])

  const complete = useCallback(() => {
    setIsActive(false)
    localStorage.setItem(storageKey, "true")
  }, [storageKey])

  const reset = useCallback(() => {
    // Apagado: reiniciar no debe encenderlo. Sin esta guarda, el botón de
    // Ajustes seguiría siendo una puerta de entrada al tour desactivado.
    if (!TOUR_ENABLED) return
    localStorage.removeItem(storageKey)
    setCurrentStep(0)
    setIsActive(true)
  }, [storageKey])

  return {
    isActive,
    currentStep,
    next,
    previous,
    skip,
    complete,
    reset,
  }
}
