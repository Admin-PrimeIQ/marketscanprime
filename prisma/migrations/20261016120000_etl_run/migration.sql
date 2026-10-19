-- CreateEnum
CREATE TYPE "etl_run_status" AS ENUM ('running', 'validated', 'committed', 'rolled_back', 'aborted', 'failed');

-- CreateTable
CREATE TABLE "etl_run" (
    "id" UUID NOT NULL,
    "command" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "dry_run" BOOLEAN NOT NULL,
    "status" "etl_run_status" NOT NULL,
    "snapshot" TEXT,
    "allowed" TEXT[],
    "counts" JSONB,
    "issues" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "etl_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "etl_run_started_at_idx" ON "etl_run"("started_at");
