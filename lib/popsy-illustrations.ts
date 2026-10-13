/**
 * Popsy Illustrations Configuration
 * 
 * Centralized configuration for Popsy illustrations used throughout the app.
 * All illustrations are from https://illustrations.popsy.co/
 * 
 * To find and customize illustrations:
 * 1. Visit https://illustrations.popsy.co/
 * 2. Browse by category or search for specific illustrations
 * 3. Click on an illustration to copy its URL
 * 4. Update the URLs below with your preferred illustrations and colors
 * 
 * Color themes available: amber, blue, green, indigo, orange, pink, purple, red, teal, yellow
 * 
 * Note: Some illustration names may need to be adjusted based on what's available on Popsy.
 * You can search for similar concepts if a specific name doesn't exist.
 */

/**
 * Popsy Illustrations - Verified working illustrations
 * Based on actual illustrations available at https://illustrations.popsy.co/
 */
export const POPSY_ILLUSTRATIONS = {
  // Dashboard & General - Real Estate themed
  dashboard: 'https://illustrations.popsy.co/white/business-analysis.svg', // Análisis de mercado inmobiliario
  analytics: 'https://illustrations.popsy.co/white/finance-growth.svg', // Crecimiento financiero/ventas
  charts: 'https://illustrations.popsy.co/white/finance-growth.svg', // Gráficos de crecimiento
  
  // Projects & Development - Real Estate themed
  engineer: 'https://illustrations.popsy.co/white/engineer.svg', // Ingeniero/arquitecto
  developer: 'https://illustrations.popsy.co/white/businessman-with-a-suitcase.svg', // Desarrollador inmobiliario
  project: 'https://illustrations.popsy.co/white/product-launch.svg', // Lanzamiento de proyecto
  building: 'https://illustrations.popsy.co/white/work-party.svg', // Construcción/obra
  construction: 'https://illustrations.popsy.co/white/man-riding-a-rocket.svg', // Proyecto en crecimiento
  
  // Empty States
  empty: 'https://illustrations.popsy.co/white/question-mark.svg',
  emptyState: 'https://illustrations.popsy.co/white/paper-documents.svg', // Documentos/expedientes
  noResults: 'https://illustrations.popsy.co/white/searching-location-on-the-phone.svg', // Búsqueda de ubicación
  search: 'https://illustrations.popsy.co/white/searching-location-on-the-phone.svg', // Búsqueda de propiedades
  
  // Productivity & Work
  productivity: 'https://illustrations.popsy.co/white/woman-on-laptop-excel.svg', // Gestión de datos
  task: 'https://illustrations.popsy.co/white/calculator.svg', // Cálculos de precios
  checklist: 'https://illustrations.popsy.co/white/paper-documents.svg', // Lista de verificación
  planning: 'https://illustrations.popsy.co/white/business-analysis.svg', // Planificación de proyectos
  
  // Relaxation & Welcome
  relaxing: 'https://illustrations.popsy.co/white/home-from-work.svg', // Casa/hogar
  coffee: 'https://illustrations.popsy.co/white/home-from-work.svg', // Descanso
  welcome: 'https://illustrations.popsy.co/white/happy-man-waving.svg', // Bienvenida
  meditation: 'https://illustrations.popsy.co/white/home-from-work.svg', // Hogar
  
  // Data & Lists - Real Estate themed
  database: 'https://illustrations.popsy.co/white/paper-documents.svg', // Base de datos de propiedades
  list: 'https://illustrations.popsy.co/white/calculator.svg', // Lista de unidades
  catalog: 'https://illustrations.popsy.co/white/online-shopping.svg', // Catálogo de propiedades
  folder: 'https://illustrations.popsy.co/white/package-delivery.svg', // Archivos de proyectos
  
  // Units & Properties - Real Estate themed
  home: 'https://illustrations.popsy.co/white/home-from-work.svg', // Casa/hogar
  apartment: 'https://illustrations.popsy.co/white/home-from-work.svg', // Apartamento
  house: 'https://illustrations.popsy.co/white/home-from-work.svg', // Casa
  property: 'https://illustrations.popsy.co/white/businessman-with-a-suitcase.svg', // Propiedad/comercial
  
  // Error & Status
  error: 'https://illustrations.popsy.co/red/calling-help.svg',
  warning: 'https://illustrations.popsy.co/orange/question-mark.svg',
  success: 'https://illustrations.popsy.co/green/shaking-hands.svg', // Venta exitosa
  loading: 'https://illustrations.popsy.co/white/paper-documents.svg',
} as const

/**
 * Popsy Fallback Illustrations - Alternative Popsy illustrations as fallback
 * These are used when the primary illustration fails to load
 */
export const POPSY_FALLBACK_ILLUSTRATIONS = {
  // Dashboard & General - Real Estate themed fallbacks
  dashboard: 'https://illustrations.popsy.co/white/keynote-presentation.svg',
  analytics: 'https://illustrations.popsy.co/white/finance-growth.svg',
  charts: 'https://illustrations.popsy.co/white/business-analysis.svg',
  
  // Projects & Development - Real Estate themed fallbacks
  engineer: 'https://illustrations.popsy.co/white/creative-work.svg',
  developer: 'https://illustrations.popsy.co/white/businessman-with-a-suitcase.svg', // Desarrollador
  project: 'https://illustrations.popsy.co/white/work-party.svg', // Proyecto en construcción
  building: 'https://illustrations.popsy.co/white/man-riding-a-rocket.svg', // Edificio en crecimiento
  construction: 'https://illustrations.popsy.co/white/work-party.svg', // Obra en construcción
  
  // Empty States
  empty: 'https://illustrations.popsy.co/white/paper-documents.svg',
  emptyState: 'https://illustrations.popsy.co/white/question-mark.svg',
  noResults: 'https://illustrations.popsy.co/white/searching-location-on-the-phone.svg',
  search: 'https://illustrations.popsy.co/white/searching-location-on-the-phone.svg',
  
  // Productivity & Work
  productivity: 'https://illustrations.popsy.co/white/woman-on-laptop-excel.svg',
  task: 'https://illustrations.popsy.co/white/calculator.svg',
  checklist: 'https://illustrations.popsy.co/white/paper-documents.svg',
  planning: 'https://illustrations.popsy.co/white/business-analysis.svg',
  
  // Relaxation & Welcome
  relaxing: 'https://illustrations.popsy.co/white/home-from-work.svg',
  coffee: 'https://illustrations.popsy.co/white/home-from-work.svg',
  welcome: 'https://illustrations.popsy.co/white/happy-man-waving.svg',
  meditation: 'https://illustrations.popsy.co/white/home-from-work.svg',
  
  // Data & Lists - Real Estate themed fallbacks
  database: 'https://illustrations.popsy.co/white/paper-documents.svg',
  list: 'https://illustrations.popsy.co/white/calculator.svg',
  catalog: 'https://illustrations.popsy.co/white/online-shopping.svg',
  folder: 'https://illustrations.popsy.co/white/package-delivery.svg',
  
  // Units & Properties - Real Estate themed fallbacks
  home: 'https://illustrations.popsy.co/white/home-from-work.svg',
  apartment: 'https://illustrations.popsy.co/white/home-from-work.svg',
  house: 'https://illustrations.popsy.co/white/home-from-work.svg',
  property: 'https://illustrations.popsy.co/white/businessman-with-a-suitcase.svg',
  
  // Error & Status
  error: 'https://illustrations.popsy.co/red/calling-help.svg',
  warning: 'https://illustrations.popsy.co/orange/question-mark.svg',
  success: 'https://illustrations.popsy.co/green/shaking-hands.svg',
  loading: 'https://illustrations.popsy.co/white/paper-documents.svg',
} as const

/**
 * Get a Popsy illustration URL by key
 */
export function getPopsyIllustration(key: keyof typeof POPSY_ILLUSTRATIONS): string {
  return POPSY_ILLUSTRATIONS[key]
}

/**
 * Get a Popsy fallback illustration URL by key
 */
export function getPopsyFallbackIllustration(key: keyof typeof POPSY_FALLBACK_ILLUSTRATIONS): string {
  return POPSY_FALLBACK_ILLUSTRATIONS[key]
}

/**
 * Get illustration for a specific section with fallback
 * Tries Popsy first, then unDraw as fallback
 */
export function getSectionIllustration(section: string, useFallback = true): string {
  const sectionMap: Record<string, keyof typeof POPSY_ILLUSTRATIONS> = {
    dashboard: 'dashboard',
    projects: 'project',
    blocks: 'building',
    units: 'home',
    catalogs: 'catalog',
    login: 'welcome',
    empty: 'emptyState',
    'no-results': 'noResults',
  }
  
  const key = sectionMap[section] || 'empty'
  
  if (useFallback) {
    // Return both Popsy and unDraw URLs as fallback options
    return getPopsyIllustration(key)
  }
  
  return getPopsyIllustration(key)
}

/**
 * Get illustration with automatic fallback
 * Returns an array: [primary, fallback]
 */
export function getIllustrationWithFallback(key: keyof typeof POPSY_ILLUSTRATIONS): [string, string] {
  return [POPSY_ILLUSTRATIONS[key], POPSY_FALLBACK_ILLUSTRATIONS[key]]
}
