import assert from 'node:assert'
import { ensureUnitFormulasSynced, getVatRate } from './core/formulas.js'

// Horizontal: habitable = unitSize; total = habitable (+0)
{
  const u = { unitSizeM2: 60, parkingSpaces: 2, totalPriceUSD: 100000 }
  ensureUnitFormulasSynced(u, {}, false, getVatRate('T1', 'Casas', 'Uso Venta'), false)
  assert.strictEqual(u.habitableConstructionM2, 60, 'horiz habitable')
  assert.strictEqual(u.totalSizeM2, 60, 'horiz total (no parking)')
  assert.strictEqual(u.parkingSizeM2, 25, 'horiz parking size')
}
// Vertical: habitable = unitSize + balcón; total = habitable + parqueo
{
  const u = { unitSizeM2: 60, parkingSpaces: 2, unitType: [{ __component: 'unit-types.housing', balconyTerraceSizeM2: 10 }] }
  ensureUnitFormulasSynced(u, {}, true, 1.092, false)
  assert.strictEqual(u.habitableConstructionM2, 70, 'vert habitable +balcón')
  assert.strictEqual(u.totalSizeM2, 95, 'vert total = 70 + 25')
}
// Lote: unitSize = terreno = total
{
  const u = { unitSizeM2: 0, landM2: 120, parkingSpaces: 0 }
  ensureUnitFormulasSynced(u, {}, false, 1.12, true)
  assert.strictEqual(u.unitSizeM2, 120, 'lote unitSize = terreno')
  assert.strictEqual(u.habitableConstructionM2, 120, 'lote habitable = terreno')
  assert.strictEqual(u.totalSizeM2, 120, 'lote total = terreno')
}
// Cuota (installmentUSD) por país (ISO): GT (0.075/240/0.90) vs SV (0.08/300/0.85).
// El motor deriva priceWithoutVATUSD desde totalPriceUSD (vatRate=1 → idéntico),
// por eso usamos vatRate=1 para que priceWithoutVAT = 100000 exacto.
function pmt(rate, nper, pv) { const r = rate / 12; return Math.round(((r * pv) / (1 - Math.pow(1 + r, -nper))) * 100) / 100 }
{
  const expGT = pmt(0.075, 240, 100000 * 0.9)
  const u = { totalPriceUSD: 100000, priceWithoutVATUSD: 100000, unitSizeM2: 50 }
  ensureUnitFormulasSynced(u, {}, false, 1, false, 'GT')
  assert.strictEqual(u.installmentUSD, expGT, 'GT cuota')
}
{
  const expSV = pmt(0.08, 300, 100000 * 0.85)
  const expGT = pmt(0.075, 240, 100000 * 0.9)
  const u = { totalPriceUSD: 100000, priceWithoutVATUSD: 100000, unitSizeM2: 50 }
  ensureUnitFormulasSynced(u, {}, false, 1, false, 'SV')
  assert.strictEqual(u.installmentUSD, expSV, 'SV cuota')
  assert.notStrictEqual(expSV, expGT, 'GT != SV')
}
// IVA por país: SV → 0% (precio sin IVA = total); GT → resta IVA.
{
  const vatGT = getVatRate('T1', 'Casas', undefined, 'GT')
  const u = { totalPriceUSD: 1234, unitSizeM2: 50 }
  ensureUnitFormulasSynced(u, {}, false, vatGT, false, 'GT')
  assert.ok(Math.abs(u.priceWithoutVATUSD - 1234) > 0.01, 'GT resta IVA (priceWithoutVAT != total)')
}
{
  const vatSV = getVatRate('T1', 'Casas', undefined, 'SV')
  assert.strictEqual(vatSV, 1.0, 'SV vatRate = 1.0 (0%)')
  const u = { totalPriceUSD: 1234, unitSizeM2: 50 }
  ensureUnitFormulasSynced(u, {}, false, vatSV, false, 'SV')
  assert.strictEqual(u.priceWithoutVATUSD, 1234, 'SV: precio sin IVA = total (0% IVA)')
}
console.log('parity OK')
