import packageJson from '../package.json'

export const APP_VERSION = packageJson.version

// Los factores de varas viven en lib/units/varas.ts, que no importa nada, para
// que el motor de fórmulas pueda usarlos fuera del navegador. Se reexportan acá
// para no romper a nadie que ya los importaba de este módulo.
export { M2_TO_VARAS_SQUARED, M_TO_VARAS, getVarasFactor } from './units/varas.ts'
