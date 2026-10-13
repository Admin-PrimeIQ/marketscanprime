'use client'

import React from 'react'
import { NotionIllustration } from './notion-illustration'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'
import { getIllustrationWithFallback } from '@/lib/popsy-illustrations'

export interface EmptyStateProps {
  /**
   * Name of the illustration (should match SVG file in /public/illustrations/)
   * OR a Popsy URL (e.g., "https://illustrations.popsy.co/white/engineer.svg")
   * Common illustrations: 'empty_state', 'no_results', 'coffee_break', 'relaxing', etc.
   */
  illustration?: string
  /**
   * Direct URL to an illustration (Popsy, Notioly, etc.)
   * If provided, this takes precedence over 'illustration'
   */
  illustrationSrc?: string
  /**
   * Title of the empty state
   */
  title: string
  /**
   * Description text
   */
  description?: string
  /**
   * Action button configuration
   */
  action?: {
    label: string
    onClick: () => void
    variant?: 'default' | 'outline' | 'ghost'
  }
  /**
   * Secondary action button
   */
  secondaryAction?: {
    label: string
    onClick: () => void
    variant?: 'default' | 'outline' | 'ghost'
  }
  /**
   * Custom illustration size
   */
  illustrationSize?: number
  /**
   * Additional CSS classes
   */
  className?: string
  /**
   * Show a subtle background
   */
  withBackground?: boolean
}

/**
 * EmptyState Component
 * 
 * A beautiful empty state component with Notion-style illustrations.
 * Perfect for when there's no data, no results, or initial states.
 * 
 * @example
 * ```tsx
 * <EmptyState
 *   illustration="empty_state"
 *   title="No hay proyectos aún"
 *   description="Comienza creando tu primer proyecto para verlo aquí."
 *   action={{
 *     label: "Crear proyecto",
 *     onClick: () => router.push('/projects/new')
 *   }}
 * />
 * ```
 */
export function EmptyState({
  illustration = 'empty_state',
  illustrationSrc,
  title,
  description,
  action,
  secondaryAction,
  illustrationSize = 280,
  className,
  withBackground = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 px-4 notion-fade-in',
        withBackground && 'rounded-lg bg-muted/30 border border-border',
        className
      )}
    >
      <div className="mb-6">
        {illustrationSrc ? (
          <NotionIllustration
            src={illustrationSrc}
            width={illustrationSize}
            height={illustrationSize}
            alt={title}
          />
        ) : illustration ? (
          (() => {
            // Try to get fallback for common illustration names
            const illustrationMap: Record<string, keyof typeof import('@/lib/popsy-illustrations').POPSY_ILLUSTRATIONS> = {
              'empty_state': 'emptyState',
              'no_results': 'noResults',
              'coffee_break': 'coffee',
              'relaxing': 'relaxing',
              'error': 'error',
            }
            const key = illustrationMap[illustration] || 'emptyState'
            const [primary, fallback] = getIllustrationWithFallback(key)
            return (
              <NotionIllustration
                src={primary}
                fallbackSrc={fallback}
                width={illustrationSize}
                height={illustrationSize}
                alt={title}
              />
            )
          })()
        ) : (
          <NotionIllustration
            src="https://illustrations.popsy.co/white/paper-documents.svg"
            width={illustrationSize}
            height={illustrationSize}
            alt={title}
          />
        )}
      </div>
      
      <div className="text-center space-y-3 max-w-md">
        <h3 className="text-xl font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {(action || secondaryAction) && (
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          {action && (
            <Button
              onClick={action.onClick}
              variant={action.variant || 'default'}
              className="notion-button"
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              onClick={secondaryAction.onClick}
              variant={secondaryAction.variant || 'outline'}
              className="notion-button"
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * LoadingState Component
 * 
 * A loading state with a subtle illustration
 */
export interface LoadingStateProps {
  title?: string
  description?: string
  illustration?: string
  className?: string
}

export function LoadingState({
  title = 'Cargando...',
  description,
  illustration,
  className,
}: LoadingStateProps) {
  // Use Popsy illustration directly for loading state
  const loadingIllustration = illustration 
    ? undefined 
    : 'https://illustrations.popsy.co/white/paper-documents.svg'

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 px-4',
        className
      )}
    >
      <div className="mb-6 opacity-50">
        <NotionIllustration
          src={loadingIllustration}
          name={illustration}
          width={200}
          height={200}
          alt="Cargando"
        />
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-lg font-medium text-foreground">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        <div className="mt-4">
          <div className="h-1 w-32 bg-muted rounded-full overflow-hidden mx-auto">
            <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * ErrorState Component
 * 
 * An error state with an illustration
 */
export interface ErrorStateProps {
  title?: string
  description?: string
  illustration?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function ErrorState({
  title = 'Algo salió mal',
  description = 'Por favor, intenta de nuevo más tarde.',
  illustration = 'error',
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 px-4 notion-fade-in',
        className
      )}
    >
      <div className="mb-6">
        <NotionIllustration
          name={illustration}
          width={240}
          height={240}
          alt={title}
        />
      </div>
      
      <div className="text-center space-y-3 max-w-md">
        <h3 className="text-xl font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>

      {action && (
        <div className="mt-6">
          <Button
            onClick={action.onClick}
            variant="outline"
            className="notion-button"
          >
            {action.label}
          </Button>
        </div>
      )}
    </div>
  )
}

// Explicit exports to ensure Next.js recognizes them
export { EmptyState, LoadingState, ErrorState }
export type { EmptyStateProps, LoadingStateProps, ErrorStateProps }
