'use client'

/**
 * Notion-Style Components Examples
 * 
 * Este archivo muestra ejemplos de cómo usar los componentes estilo Notion.
 * Puedes copiar estos ejemplos y adaptarlos a tus necesidades.
 */

import { NotionAvatarComponent } from './notion-avatar'
import { NotionIllustration } from './notion-illustration'

/**
 * Ejemplo: Avatar aleatorio
 */
export function RandomAvatarExample() {
  return (
    <div className="flex items-center gap-4 p-4">
      <NotionAvatarComponent size={40} />
      <NotionAvatarComponent size={48} shape="circle" />
      <NotionAvatarComponent size={64} shape="square" />
    </div>
  )
}

/**
 * Ejemplo: Avatar con configuración personalizada
 */
export function CustomAvatarExample() {
  return (
    <div className="flex items-center gap-4 p-4">
      <NotionAvatarComponent 
        size={56}
        bgColor="f0f0f0"
        shape="rounded"
      />
    </div>
  )
}

/**
 * Ejemplo: Ilustración (requiere que el SVG esté en /public/illustrations/)
 */
export function IllustrationExample() {
  return (
    <div className="flex flex-col items-center justify-center p-12 space-y-4">
      <NotionIllustration 
        name="empty_state" 
        width={300}
        height={300}
        alt="Empty state"
      />
      <p className="text-muted-foreground text-center">
        No hay elementos para mostrar
      </p>
    </div>
  )
}

/**
 * Ejemplo: Card estilo Notion
 */
export function NotionCardExample() {
  return (
    <div className="notion-card p-6 space-y-4">
      <div className="flex items-center gap-3">
        <NotionAvatarComponent size={40} />
        <div>
          <h3 className="font-semibold text-foreground">Usuario Ejemplo</h3>
          <p className="text-sm text-muted-foreground">Hace 2 horas</p>
        </div>
      </div>
      <p className="text-foreground">
        Este es un ejemplo de una tarjeta estilo Notion con un avatar,
        mucho espacio en blanco y colores suaves.
      </p>
    </div>
  )
}

/**
 * Ejemplo: Página vacía estilo Notion
 */
export function EmptyPageExample() {
  return (
    <div className="notion-container notion-fade-in">
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
        <NotionIllustration 
          name="empty_state"
          width={280}
          height={280}
          alt="Página vacía"
        />
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold text-foreground">
            No hay contenido aún
          </h2>
          <p className="text-muted-foreground max-w-md">
            Comienza agregando tu primer elemento para verlo aquí.
          </p>
        </div>
        <button className="notion-button bg-primary text-primary-foreground hover:opacity-90">
          Crear nuevo elemento
        </button>
      </div>
    </div>
  )
}
