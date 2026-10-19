import { UNDEFINED_PROJECT, type Resolved } from "../model"
import type { RawRow } from "../snapshot"
import type { AppRow } from "../specs"
import { bool, date, doc, int, numeric, refDoc, stamps, text } from "./common"

export function blockRow(resolved: Resolved, row: RawRow): AppRow {
  const { present, rel, duplicateCodes } = resolved
  const id = Number(row.id)
  return {
    public_id: doc(row),
    code: duplicateCodes.blocks.has(id) ? null : text(row.code),
    name: text(row.name),
    legacy_id: text(row.legacy_id),
    project_id: refDoc(present, "projects", rel.blockProject.get(id)) ?? UNDEFINED_PROJECT,
    domain: text(row.domain),
    quarter: text(row.quarter),
    market: text(row.market),
    block_usage: text(row.block_usage),
    phase: text(row.phase),
    tower: text(row.tower),
    sector: text(row.sector),
    year: int(row.year),
    collection_date: date(row.collection_date),
    start_date: date(row.start_date),
    delivery_date: date(row.delivery_date),
    commercialization_months: int(row.commercialization_months),
    total_units: int(row.total_units),
    total_m2: numeric(row.total_m_2),
    available_units: int(row.available_units),
    available_m2: numeric(row.available_m_2),
    visitor_parking: int(row.visitor_parking),
    assigned_parking: int(row.assigned_parking),
    total_project_parking: int(row.total_project_parking),
    parking_for_sale: int(row.parking_for_sale),
    mig_number: int(row.mig_number),
    average_price_usd: numeric(row.average_price_usd),
    average_size_m2: numeric(row.average_size_m_2),
    average_price_per_m2_usd: numeric(row.average_price_per_m_2_usd),
    average_installment_usd: numeric(row.average_installment_usd),
    average_income_usd: numeric(row.average_income_usd),
    additional_parking_price_usd: numeric(row.additional_parking_price_usd),
    category_id: refDoc(present, "block_categories", rel.blockCategory.get(id)),
    focus_id: refDoc(present, "block_focuses", rel.blockFocus.get(id)),
    status_id: refDoc(present, "block_statuses", rel.blockStatus.get(id)),
    ...stamps(row),
  }
}

export function blockFinancing(resolved: Resolved): { financing: AppRow[]; bankRates: AppRow[] } {
  const financing: AppRow[] = []
  const bankRates: AppRow[] = []
  for (const [blockId, { row, banks }] of resolved.financing) {
    const block = doc(resolved.present.blocks.get(blockId)!)
    financing.push({
      block_id: block,
      down_payment_percent: numeric(row.down_payment_percent),
      fractional_down_payment: bool(row.fractional_down_payment),
      fractional_down_payment_fha: numeric(row.fractional_down_payment_fha),
      fractional_installments_other_banks: numeric(row.fractional_installments_other_banks),
      min_down_payment_fha: numeric(row.min_down_payment_fha),
      min_down_payment_other_banks: numeric(row.min_down_payment_other_banks),
      max_loan_term_years_fha: int(row.max_loan_term_years_fha),
      max_loan_term_years_banks: int(row.max_loan_term_years_banks),
      max_loan_term_years_owner: int(row.max_loan_term_years_owner),
    })
    for (const { bank, rate } of banks) bankRates.push({ block_id: block, bank, annual_rate_percent: numeric(rate) })
  }
  return { financing, bankRates }
}
