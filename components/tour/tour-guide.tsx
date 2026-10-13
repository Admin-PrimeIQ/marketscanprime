"use client"

import React, { useEffect, useState, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { X, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export interface TourStep {
  id: string
  target: string // selector CSS o data attribute
  title: string
  description: string
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center'
  offset?: number
  highlightPadding?: number
}

interface TourGuideProps {
  steps: TourStep[]
  isActive: boolean
  currentStep: number
  onNext: () => void
  onPrevious: () => void
  onSkip: () => void
  onComplete: () => void
}

export function TourGuide({
  steps,
  isActive,
  currentStep,
  onNext,
  onPrevious,
  onSkip,
  onComplete,
}: TourGuideProps) {
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null)
  const [previousTargetElement, setPreviousTargetElement] = useState<HTMLElement | null>(null)
  const [overlayStyle, setOverlayStyle] = useState<React.CSSProperties>({})
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({})
  const [mounted, setMounted] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Cleanup function to restore a specific element's styles
  const cleanupElementStyles = useCallback((element: HTMLElement | null) => {
    if (!element) return
    
    const originalZIndex = (element as any).__tourOriginalZIndex
    const originalPosition = (element as any).__tourOriginalPosition
    
    // Always restore styles to their original values
    // If we have stored originals, use them; otherwise reset to empty (default CSS)
    if (originalZIndex !== undefined && originalZIndex !== null) {
      element.style.zIndex = originalZIndex
    } else {
      // If no original was stored, remove inline style to use CSS default
      element.style.zIndex = ''
    }
    
    if (originalPosition !== undefined && originalPosition !== null) {
      element.style.position = originalPosition
    } else {
      // If no original was stored, remove inline style to use CSS default
      element.style.position = ''
    }
    
    // Always remove tour-specific styles
    element.style.boxShadow = ''
    element.style.borderRadius = ''
    element.style.transition = ''
    
    // Remove the stored values
    delete (element as any).__tourOriginalZIndex
    delete (element as any).__tourOriginalPosition
  }, [])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isActive || currentStep < 0 || currentStep >= steps.length) {
      // Cleanup all elements when tour ends
      if (targetElement) {
        cleanupElementStyles(targetElement)
      }
      if (previousTargetElement) {
        cleanupElementStyles(previousTargetElement)
      }
      // Also cleanup any remaining elements with tour styles
      const allTourElements = document.querySelectorAll('[data-tour]')
      allTourElements.forEach((el) => {
        cleanupElementStyles(el as HTMLElement)
      })
      setPreviousTargetElement(null)
      setTargetElement(null)
      return
    }

    // IMPORTANT: Cleanup previous target element IMMEDIATELY when step changes
    // This ensures element from step 1 returns to normal z-index before step 2 starts
    // We do this BEFORE finding the new element to ensure proper cleanup order
    if (targetElement) {
      cleanupElementStyles(targetElement)
      setPreviousTargetElement(targetElement)
    }

    // Wait a bit for DOM to be ready
    const timeoutId = setTimeout(() => {
      const step = steps[currentStep]
      if (!step) {
        console.warn('Step not found at index:', currentStep)
        return
      }
      
      const element = document.querySelector(step.target) as HTMLElement

      if (!element) {
        console.warn(`Tour step target not found: ${step.target}`)
        const availableElements = Array.from(document.querySelectorAll('[data-tour]')).map(el => el.getAttribute('data-tour'))
        console.log('Available elements with data-tour:', availableElements)
        console.log('Current step:', currentStep, 'Total steps:', steps.length)
        console.log('Is active:', isActive)
        // Retry after a longer delay
        setTimeout(() => {
          const retryElement = document.querySelector(step.target) as HTMLElement
          if (retryElement) {
            // Ensure previous element is cleaned up
            if (targetElement && targetElement !== retryElement) {
              cleanupElementStyles(targetElement)
            }
            setTargetElement(retryElement)
            retryElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
            setTimeout(() => {
              updatePositions(retryElement, step)
            }, 300)
          }
        }, 1000)
        return
      }

      // Ensure we don't apply styles to the same element twice
      // If it's the same element, it should already be cleaned up from above
      if (targetElement && targetElement !== element) {
        cleanupElementStyles(targetElement)
      }

      setTargetElement(element)

      // Scroll element into view
      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })

      // Wait for scroll to complete
      setTimeout(() => {
        updatePositions(element, step)
      }, 300)
    }, 100)

    return () => clearTimeout(timeoutId)
  }, [isActive, currentStep, steps, cleanupElementStyles, targetElement, previousTargetElement])

  const updatePositions = (element: HTMLElement, step: TourStep) => {
    const rect = element.getBoundingClientRect()
    const padding = step.highlightPadding || 8
    const offset = step.offset || 16

    // Overlay style - we'll create the hole using multiple divs
    setOverlayStyle({
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 99998,
      pointerEvents: 'auto',
    })

    // Calculate tooltip position
    const tooltipWidth = 360
    const tooltipHeight = tooltipRef.current?.offsetHeight || 200
    const position = step.position || 'bottom'

    let top = 0
    let left = 0

    switch (position) {
      case 'top':
        top = rect.top - tooltipHeight - offset
        left = rect.left + rect.width / 2 - tooltipWidth / 2
        break
      case 'bottom':
        top = rect.bottom + offset
        left = rect.left + rect.width / 2 - tooltipWidth / 2
        break
      case 'left':
        top = rect.top + rect.height / 2 - tooltipHeight / 2
        left = rect.left - tooltipWidth - offset
        break
      case 'right':
        top = rect.top + rect.height / 2 - tooltipHeight / 2
        left = rect.right + offset
        break
      case 'center':
        top = window.innerHeight / 2 - tooltipHeight / 2
        left = window.innerWidth / 2 - tooltipWidth / 2
        break
    }

    // Keep tooltip within viewport
    const maxLeft = window.innerWidth - tooltipWidth - 16
    const maxTop = window.innerHeight - tooltipHeight - 16
    left = Math.max(16, Math.min(left, maxLeft))
    top = Math.max(16, Math.min(top, maxTop))

    setTooltipStyle({
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: `${tooltipWidth}px`,
      zIndex: 9999999,
    })

    // Add highlight to target element
    // Only store original values if they haven't been stored before
    // This prevents overwriting the original values if the same element is used in multiple steps
    if ((element as any).__tourOriginalZIndex === undefined) {
      const computedStyle = getComputedStyle(element)
      // Get original values: prefer inline styles, fallback to computed styles, or empty string
      const originalPosition = element.style.position || computedStyle.position || ''
      const originalZIndex = element.style.zIndex || computedStyle.zIndex || ''
      ;(element as any).__tourOriginalPosition = originalPosition
      ;(element as any).__tourOriginalZIndex = originalZIndex
    }
    
    // Apply tour styles to bring element to foreground
    element.style.position = 'relative'
    element.style.zIndex = '10000'
    element.style.transition = 'all 0.3s ease'
    element.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.5), 0 0 0 8px rgba(59, 130, 246, 0.3)'
    element.style.borderRadius = '8px'
  }

  // Cleanup function to restore all modified elements
  const cleanupTourStyles = useCallback(() => {
    // First cleanup current and previous target elements
    cleanupElementStyles(targetElement)
    cleanupElementStyles(previousTargetElement)
    
    // Then find and cleanup ALL elements with data-tour that were modified
    // This is more efficient than checking all DOM elements
    const allTourElements = document.querySelectorAll('[data-tour]')
    allTourElements.forEach((el) => {
      const element = el as HTMLElement
      // Only cleanup if it has tour styles applied (has stored original values)
      if ((element as any).__tourOriginalZIndex !== undefined) {
        cleanupElementStyles(element)
      }
    })
  }, [targetElement, previousTargetElement, cleanupElementStyles])

  // Cleanup when targetElement changes (fallback cleanup)
  useEffect(() => {
    return () => {
      // This cleanup runs when targetElement changes or component unmounts
      // The main cleanup is handled in the step change effect above
      if (targetElement) {
        cleanupElementStyles(targetElement)
      }
    }
  }, [targetElement, cleanupElementStyles])

  // Cleanup when tour ends (isActive becomes false)
  useEffect(() => {
    if (!isActive) {
      cleanupTourStyles()
    }
  }, [isActive, cleanupTourStyles])

  if (!mounted) {
    return null
  }

  if (!isActive) {
    return null
  }

  if (currentStep < 0 || currentStep >= steps.length) {
    console.warn('Tour step out of bounds:', { currentStep, stepsLength: steps.length })
    return null
  }

  if (steps.length === 0) {
    console.warn('Tour has no steps')
    return null
  }

  const step = steps[currentStep]
  const isFirst = currentStep === 0
  const isLast = currentStep === steps.length - 1

  // Debug log
  console.log('TourGuide render:', {
    isActive,
    currentStep,
    stepsLength: steps.length,
    targetElement: !!targetElement,
    stepTarget: step.target,
  })

  const overlayContent = (
    <>
      {/* Overlay with hole */}
      {targetElement && (() => {
        const rect = targetElement.getBoundingClientRect()
        const padding = 8
        const holeX = rect.left - padding
        const holeY = rect.top - padding
        const holeWidth = rect.width + padding * 2
        const holeHeight = rect.height + padding * 2
        
        return (
          <div style={overlayStyle}>
            {/* Top overlay */}
            {holeY > 0 && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                height: `${holeY}px`,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                zIndex: 99998,
              }} />
            )}
            {/* Bottom overlay */}
            {holeY + holeHeight < window.innerHeight && (
              <div style={{
                position: 'fixed',
                top: `${holeY + holeHeight}px`,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                zIndex: 99998,
              }} />
            )}
            {/* Left overlay */}
            {holeX > 0 && (
              <div style={{
                position: 'fixed',
                top: `${holeY}px`,
                left: 0,
                width: `${holeX}px`,
                height: `${holeHeight}px`,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                zIndex: 99998,
              }} />
            )}
            {/* Right overlay */}
            {holeX + holeWidth < window.innerWidth && (
              <div style={{
                position: 'fixed',
                top: `${holeY}px`,
                left: `${holeX + holeWidth}px`,
                right: 0,
                height: `${holeHeight}px`,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                zIndex: 99998,
              }} />
            )}
          </div>
        )
      })()}

      {/* Tooltip */}
      <Card
        ref={tooltipRef}
        style={tooltipStyle}
        className="bg-card border-2 border-primary shadow-2xl"
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <CardTitle className="text-lg font-semibold">{step.title}</CardTitle>
              <div className="mt-1 text-xs text-muted-foreground">
                Paso {currentStep + 1} de {steps.length}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 -mt-1 -mr-1"
              onClick={() => {
                cleanupTourStyles()
                onSkip()
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <CardDescription className="text-sm leading-relaxed">
            {step.description}
          </CardDescription>
          <div className="flex items-center justify-between mt-6 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                cleanupTourStyles()
                onSkip()
              }}
              className="text-xs"
            >
              Omitir tour
            </Button>
            <div className="flex items-center gap-2">
              {!isFirst && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onPrevious}
                  className="text-xs"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Anterior
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => {
                  if (isLast) {
                    cleanupTourStyles()
                    onComplete()
                  } else {
                    onNext()
                  }
                }}
                className="text-xs"
              >
                {isLast ? 'Finalizar' : 'Siguiente'}
                {!isLast && <ChevronRight className="h-4 w-4 ml-1" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  )

  return createPortal(overlayContent, document.body)
}
