import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withLabel, buildBlockName } from './block-name.ts'

// Mismos casos que strapi-display-names.test.js en sync-database: las dos
// reglas tienen que dar el mismo nombre.

test('la fase que ya dice «Fase 3» no produce «Fase Fase 3»', () => {
  assert.equal(
    buildBlockName('Hacienda San Jose la Laguna', { phase: 'Fase 3' }),
    'Hacienda San Jose la Laguna - Fase 3',
  )
})

test('con el valor pelado sigue igual que siempre', () => {
  assert.equal(buildBlockName('P', { phase: '1', sector: 'A', tower: 'B' }), 'P - Fase 1 - Sector A - Torre B')
})

test('limpia repeticiones y respeta palabras que sólo empiezan igual', () => {
  assert.equal(withLabel('Fase', 'Fase Fase 3'), 'Fase 3')
  assert.equal(withLabel('Torre', 'Torreón'), 'Torre Torreón')
  assert.equal(withLabel('Fase', 'Fase Vistas de Andana'), 'Fase Vistas de Andana')
})

test('las partes vacías no aparecen', () => {
  assert.equal(buildBlockName('P', { phase: '', sector: null, tower: '  ' }), 'P')
})
