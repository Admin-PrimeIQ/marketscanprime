'use client'

import React from 'react'
import { cn } from '@/lib/utils'

export interface NotionAvatarProps {
  /**
   * Seed for the avatar (determines the appearance)
   * If not provided, a random seed will be generated based on a hash
   */
  seed?: string
  /**
   * Size of the avatar in pixels or any valid CSS size
   */
  size?: number | string
  /**
   * Background color (hex format without #)
   * @default "f7f6f3" - Notion's warm cream color
   */
  bgColor?: string
  /**
   * Shape of the avatar
   * @default "rounded"
   */
  shape?: 'circle' | 'rounded' | 'square'
  /**
   * Additional CSS classes
   */
  className?: string
  /**
   * Whether to generate a random seed on mount if none provided
   * @default true
   */
  random?: boolean
}

/**
 * Generate a deterministic seed from a string
 */
function generateSeed(input?: string): string {
  if (input) return input
  
  // Generate a random seed if none provided
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

/**
 * NotionAvatar Component
 * 
 * Uses DiceBear's Notionists style via HTTP API to generate Notion-style avatars.
 * This approach doesn't require SCSS and works seamlessly with Next.js.
 * 
 * @example
 * ```tsx
 * // Random avatar
 * <NotionAvatarComponent size={48} />
 * 
 * // Custom seed (deterministic)
 * <NotionAvatarComponent 
 *   seed="user-123"
 *   size={64}
 *   shape="circle"
 * />
 * ```
 */
export function NotionAvatarComponent({
  seed,
  size = 40,
  bgColor = 'f7f6f3',
  shape = 'rounded',
  className,
  random = true,
}: NotionAvatarProps) {
  const [avatarSeed, setAvatarSeed] = React.useState<string>(() => {
    if (seed) return seed
    if (random) return generateSeed()
    return 'default'
  })

  React.useEffect(() => {
    if (!seed && random) {
      setAvatarSeed(generateSeed())
    } else if (seed) {
      setAvatarSeed(seed)
    }
  }, [seed, random])

  const sizeValue = typeof size === 'number' ? size : parseInt(size.toString()) || 40
  
  // Build DiceBear API URL with Notionists style
  const avatarUrl = React.useMemo(() => {
    const params = new URLSearchParams({
      seed: avatarSeed,
      size: sizeValue.toString(),
      backgroundColor: bgColor.startsWith('#') ? bgColor.slice(1) : bgColor,
      radius: shape === 'circle' ? '50' : shape === 'rounded' ? '12' : '0',
    })
    return `https://api.dicebear.com/9.x/notionists/svg?${params.toString()}`
  }, [avatarSeed, sizeValue, bgColor, shape])

  const borderRadius = shape === 'circle' ? '50%' : shape === 'rounded' ? '12px' : '0'

  return (
    <div
      className={cn('inline-flex items-center justify-center overflow-hidden', className)}
      style={{ 
        width: typeof size === 'number' ? `${size}px` : size,
        height: typeof size === 'number' ? `${size}px` : size,
        borderRadius,
      }}
    >
      <img
        src={avatarUrl}
        alt="Avatar"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
        className="notion-avatar"
        loading="lazy"
      />
    </div>
  )
}

/**
 * Hook to generate a random Notion avatar seed
 */
export function useNotionAvatar() {
  return React.useMemo(() => generateSeed(), [])
}
