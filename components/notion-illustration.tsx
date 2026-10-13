'use client'

import React from 'react'
import { cn } from '@/lib/utils'

export interface NotionIllustrationProps {
  /**
   * Name of the illustration (should match the SVG file name)
   * Place your Notioly/Popsy SVGs in /public/illustrations/
   * OR use a Popsy URL directly (e.g., "https://illustrations.popsy.co/white/engineer.svg")
   */
  name?: string
  /**
   * Direct URL to an illustration (Popsy, Notioly, unDraw, etc.)
   * If provided, this takes precedence over 'name'
   */
  src?: string
  /**
   * Fallback URL if the primary src fails to load
   */
  fallbackSrc?: string
  /**
   * Width of the illustration
   * @default "auto"
   */
  width?: number | string
  /**
   * Height of the illustration
   * @default "auto"
   */
  height?: number | string
  /**
   * Additional CSS classes
   */
  className?: string
  /**
   * Alt text for accessibility
   */
  alt?: string
  /**
   * Custom color overrides (for SVGs with fill/stroke attributes)
   * This will be applied as CSS variables that can override SVG colors
   */
  color?: string
}

/**
 * NotionIllustration Component
 * 
 * A component for displaying Notion-style illustrations from Notioly or Popsy.
 * 
 * Supports two modes:
 * 1. Local files: Place SVGs in /public/illustrations/ and use 'name' prop
 * 2. Direct URLs: Use 'src' prop with Popsy URLs (e.g., "https://illustrations.popsy.co/white/engineer.svg")
 * 
 * @example
 * ```tsx
 * // Local file
 * <NotionIllustration 
 *   name="coffee_break" 
 *   width={300}
 *   height={300}
 * />
 * 
 * // Popsy URL
 * <NotionIllustration 
 *   src="https://illustrations.popsy.co/white/engineer.svg"
 *   width={300}
 *   height={300}
 * />
 * ```
 */
export function NotionIllustration({
  name,
  src,
  fallbackSrc,
  width = 'auto',
  height = 'auto',
  className,
  alt = 'Illustration',
  color,
}: NotionIllustrationProps) {
  const [hasError, setHasError] = React.useState(false)
  const [currentSrc, setCurrentSrc] = React.useState<string | null>(null)
  const widthValue = typeof width === 'number' ? `${width}px` : width
  const heightValue = typeof height === 'number' ? `${height}px` : height

  // Determinar la fuente de la imagen
  const primarySrc = src || (name ? `/illustrations/${name}.svg` : null)
  const fallback = fallbackSrc

  React.useEffect(() => {
    setCurrentSrc(primarySrc)
    setHasError(false)
  }, [primarySrc])

  const handleError = () => {
    if (fallback && currentSrc === primarySrc) {
      // Try fallback
      setCurrentSrc(fallback)
      setHasError(false)
    } else {
      // Both failed, show placeholder
      setHasError(true)
    }
  }

  // Calcular el padding dinámico para los fallbacks también
  const fallbackPadding = typeof width === 'number' 
    ? Math.max(8, Math.min(width * 0.1, 24)) 
    : 12

  // Si hay error y no hay fallback, usar Popsy como fallback final
  if (hasError && !fallback) {
    // Use Popsy as ultimate fallback
    const popsyFallback = `https://illustrations.popsy.co/white/question-mark.svg`
    return (
      <div
        className={cn('inline-flex items-center justify-center', className)}
        style={{
          width: widthValue,
          height: heightValue,
        }}
      >
        <div 
          className="rounded-full bg-white/90 dark:bg-white/95 shadow-sm border border-border/50 flex items-center justify-center"
          style={{
            padding: `${fallbackPadding}px`,
            minWidth: 'fit-content',
            minHeight: 'fit-content',
          }}
        >
          <img
            src={popsyFallback}
            alt={alt}
            style={{
              width: widthValue === 'auto' ? '100%' : widthValue,
              height: heightValue === 'auto' ? '100%' : heightValue,
              objectFit: 'contain',
              opacity: 0.6,
              maxWidth: '100%',
              maxHeight: '100%',
            }}
            className="notion-illustration"
            loading="lazy"
          />
        </div>
      </div>
    )
  }

  if (!currentSrc && !primarySrc) {
    // No source at all, use Popsy empty state
    const popsyEmpty = `https://illustrations.popsy.co/white/paper-documents.svg`
    return (
      <div
        className={cn('inline-flex items-center justify-center', className)}
        style={{
          width: widthValue,
          height: heightValue,
        }}
      >
        <div 
          className="rounded-full bg-white/90 dark:bg-white/95 shadow-sm border border-border/50 flex items-center justify-center"
          style={{
            padding: `${fallbackPadding}px`,
            minWidth: 'fit-content',
            minHeight: 'fit-content',
          }}
        >
          <img
            src={popsyEmpty}
            alt={alt}
            style={{
              width: widthValue === 'auto' ? '100%' : widthValue,
              height: heightValue === 'auto' ? '100%' : heightValue,
              objectFit: 'contain',
              opacity: 0.6,
              maxWidth: '100%',
              maxHeight: '100%',
            }}
            className="notion-illustration"
            loading="lazy"
          />
        </div>
      </div>
    )
  }

  // Calcular el padding dinámico basado en el tamaño
  const paddingSize = typeof width === 'number' 
    ? Math.max(8, Math.min(width * 0.1, 24)) 
    : 12

  return (
    <div
      className={cn('inline-flex items-center justify-center', className)}
      style={{
        width: widthValue,
        height: heightValue,
        ...(color && { '--illustration-color': color } as React.CSSProperties),
      }}
    >
      {/* Círculo blanco/claro para que la ilustración sea visible en modo oscuro */}
      <div 
        className="rounded-full bg-white/90 dark:bg-white/95 shadow-sm border border-border/50 flex items-center justify-center"
        style={{
          padding: `${paddingSize}px`,
          minWidth: 'fit-content',
          minHeight: 'fit-content',
        }}
      >
        <img
          src={currentSrc || primarySrc || ''}
          alt={alt}
          style={{
            width: widthValue === 'auto' ? '100%' : widthValue,
            height: heightValue === 'auto' ? '100%' : heightValue,
            objectFit: 'contain',
            maxWidth: '100%',
            maxHeight: '100%',
          }}
          className="notion-illustration"
          onError={handleError}
          loading="lazy"
        />
      </div>
    </div>
  )
}

/**
 * Inline SVG Illustration Component
 * 
 * For when you want to import SVGs directly as React components
 * (better for customization and theming)
 * 
 * @example
 * ```tsx
 * import CoffeeBreak from '@/public/illustrations/coffee_break.svg'
 * 
 * <InlineNotionIllustration 
 *   svg={CoffeeBreak}
 *   width={300}
 *   className="text-blue-500"
 * />
 * ```
 */
export interface InlineNotionIllustrationProps {
  /**
   * SVG component (imported SVG or React component)
   */
  svg: React.ComponentType<React.SVGProps<SVGSVGElement>> | string
  /**
   * Width of the illustration
   */
  width?: number | string
  /**
   * Height of the illustration
   */
  height?: number | string
  /**
   * Additional CSS classes
   */
  className?: string
  /**
   * Additional props to pass to the SVG
   */
  svgProps?: React.SVGProps<SVGSVGElement>
}

export function InlineNotionIllustration({
  svg: SvgComponent,
  width = 'auto',
  height = 'auto',
  className,
  svgProps,
}: InlineNotionIllustrationProps) {
  const widthValue = typeof width === 'number' ? `${width}px` : width
  const heightValue = typeof height === 'number' ? `${height}px` : height

  // If it's a string (path), render as img
  if (typeof SvgComponent === 'string') {
    return (
      <img
        src={SvgComponent}
        alt="Illustration"
        style={{ width: widthValue, height: heightValue }}
        className={className}
      />
    )
  }

  // If it's a component, render it
  return (
    <div className={className} style={{ width: widthValue, height: heightValue }}>
      <SvgComponent
        width={widthValue}
        height={heightValue}
        style={{ width: '100%', height: '100%' }}
        {...svgProps}
      />
    </div>
  )
}

// Explicit exports to ensure Next.js recognizes them
export { NotionIllustration, InlineNotionIllustration }
export type { NotionIllustrationProps, InlineNotionIllustrationProps }
