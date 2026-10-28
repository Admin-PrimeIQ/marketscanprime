-- `documentId` de Strapi en la auditoría (lib/db/audit.ts), para reaplicar cambios en Strapi. Solo agrega
-- una columna que admite NULL y un índice; no toca filas existentes.

-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN     "public_id" TEXT;

-- CreateIndex
CREATE INDEX "audit_log_entity_public_id_idx" ON "audit_log"("entity", "public_id");
