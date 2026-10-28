-- Límite de intentos de login (lib/db/login-throttle.ts). Solo agrega; no toca filas existentes.

-- CreateTable
CREATE TABLE "login_attempt" (
    "key" TEXT NOT NULL,
    "fail_count" INTEGER NOT NULL DEFAULT 0,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "locked_until" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempt_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "login_attempt_updated_at_idx" ON "login_attempt"("updated_at");
