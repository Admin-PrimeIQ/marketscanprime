-- El esquema "msp_app" lo crea un administrador (CREATE SCHEMA msp_app AUTHORIZATION j_stage_admin):
-- el usuario de la migración no tiene CREATE sobre la base, y Postgres valida ese permiso
-- antes de evaluar IF NOT EXISTS.

-- CreateEnum
CREATE TYPE "quarter" AS ENUM ('T1', 'T2', 'T3', 'T4', 'S1', 'S2');

-- CreateEnum
CREATE TYPE "block_domain" AS ENUM ('housing', 'office', 'industrial');

-- CreateEnum
CREATE TYPE "market" AS ENUM ('Primary', 'Secondary');

-- CreateEnum
CREATE TYPE "block_usage" AS ENUM ('Venta', 'Renta');

-- CreateEnum
CREATE TYPE "availability" AS ENUM ('Available', 'Not Available');

-- CreateEnum
CREATE TYPE "bank" AS ENUM ('fha', 'bi', 'gtc', 'chn', 'banrural', 'bac', 'bam', 'bantrab', 'credicorp', 'internacional', 'promerica', 'azteca', 'inmobiliario', 'inv', 'ficohsa', 'vivibanco', 'antigua', 'ownerFinancing');

-- CreateEnum
CREATE TYPE "currency" AS ENUM ('GTQ', 'MXN', 'PAB', 'BZD', 'CRC', 'NIO', 'HNL');

-- CreateEnum
CREATE TYPE "office_classification" AS ENUM ('Micro 1', 'Micro 2', 'Small 1', 'Small 2', 'Medium 1', 'Medium 2', 'Medium 3', 'Large 1', 'Large 2', 'Large 3', 'Large 4', 'Large 5');

-- CreateEnum
CREATE TYPE "office_size_classification" AS ENUM ('Micro', 'Small', 'Medium', 'Large');

-- CreateEnum
CREATE TYPE "employee_capacity_range" AS ENUM ('Range_1_To_5', 'Range_6_To_10', 'Range_11_To_15', 'Range_16_To_20', 'Range_21_To_30', 'Range_31_To_40', 'Range_41_To_50', 'Range_51_To_80', 'Range_81_To_100', 'Range_101_To_140', 'Range_141_To_170', 'Range_More_Than_171');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('authenticated', 'operator', 'supervisor', 'administrator', 'super_administrator');

-- CreateEnum
CREATE TYPE "sync_run_status" AS ENUM ('resolving', 'running', 'completed', 'completed_with_skips', 'failed', 'aborted');

-- CreateEnum
CREATE TYPE "sync_operation" AS ENUM ('push', 'pull');

-- CreateEnum
CREATE TYPE "sync_block_mode" AS ENUM ('legacy', 'native');

-- CreateEnum
CREATE TYPE "sync_block_operation" AS ENUM ('insert', 'update');

-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('create', 'update', 'delete');

-- CreateTable
CREATE TABLE "amenity" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "amenity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "country" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "iso_code" TEXT,
    "iso_code_2" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "developer" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "tax_id" TEXT,
    "contact_person" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "developer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nse" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "nse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_type" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "security_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "block_category" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "block_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "block_focus" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "block_focus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "block_status" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "block_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_parking_type" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "unit_parking_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_topography" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "unit_topography_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_usage" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "unit_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rate_profile" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exchange_rate_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rate_profile_currency" (
    "profile_id" INTEGER NOT NULL,
    "currency" "currency" NOT NULL,
    "buy_rate" DECIMAL(18,8),
    "sell_rate" DECIMAL(18,8),

    CONSTRAINT "exchange_rate_profile_currency_pkey" PRIMARY KEY ("profile_id","currency")
);

-- CreateTable
CREATE TABLE "project" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "municipality" TEXT,
    "zone" TEXT,
    "subzone" TEXT,
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "muvi" BOOLEAN,
    "showroom" BOOLEAN,
    "model_house" BOOLEAN,
    "access_quantity" INTEGER,
    "image_url" TEXT,
    "fha" BOOLEAN,
    "fractional_down_payment" BOOLEAN,
    "down_payment_percentage" DECIMAL(10,2),
    "country_id" INTEGER,
    "developer_id" INTEGER,
    "nse_id" INTEGER,
    "security_type_id" INTEGER,
    "exchange_rate_profile_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_amenity" (
    "project_id" INTEGER NOT NULL,
    "amenity_id" INTEGER NOT NULL,
    "sort_order" DOUBLE PRECISION,

    CONSTRAINT "project_amenity_pkey" PRIMARY KEY ("project_id","amenity_id")
);

-- CreateTable
CREATE TABLE "project_service" (
    "project_id" INTEGER NOT NULL,
    "service_id" INTEGER NOT NULL,
    "sort_order" DOUBLE PRECISION,

    CONSTRAINT "project_service_pkey" PRIMARY KEY ("project_id","service_id")
);

-- CreateTable
CREATE TABLE "block" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT,
    "legacy_id" TEXT,
    "project_id" INTEGER NOT NULL,
    "domain" "block_domain" NOT NULL,
    "quarter" "quarter",
    "market" "market",
    "block_usage" "block_usage",
    "phase" TEXT,
    "tower" TEXT,
    "sector" TEXT,
    "year" INTEGER,
    "collection_date" DATE,
    "start_date" DATE,
    "delivery_date" DATE,
    "commercialization_months" INTEGER,
    "total_units" INTEGER,
    "total_m2" DECIMAL(10,2),
    "available_units" INTEGER,
    "available_m2" DECIMAL(10,2),
    "visitor_parking" INTEGER,
    "assigned_parking" INTEGER,
    "total_project_parking" INTEGER,
    "parking_for_sale" INTEGER,
    "mig_number" INTEGER,
    "average_price_usd" DECIMAL(10,2),
    "average_size_m2" DECIMAL(10,2),
    "average_price_per_m2_usd" DECIMAL(10,2),
    "average_installment_usd" DECIMAL(10,2),
    "average_income_usd" DECIMAL(10,2),
    "additional_parking_price_usd" DECIMAL(10,2),
    "category_id" INTEGER,
    "focus_id" INTEGER,
    "status_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "block_financing" (
    "block_id" INTEGER NOT NULL,
    "down_payment_percent" DECIMAL(10,2),
    "fractional_down_payment" BOOLEAN,
    "fractional_down_payment_fha" DECIMAL(10,2),
    "fractional_installments_other_banks" DECIMAL(10,2),
    "min_down_payment_fha" DECIMAL(10,2),
    "min_down_payment_other_banks" DECIMAL(10,2),
    "max_loan_term_years_fha" INTEGER,
    "max_loan_term_years_banks" INTEGER,
    "max_loan_term_years_owner" INTEGER,

    CONSTRAINT "block_financing_pkey" PRIMARY KEY ("block_id")
);

-- CreateTable
CREATE TABLE "block_bank_rate" (
    "block_id" INTEGER NOT NULL,
    "bank" "bank" NOT NULL,
    "annual_rate_percent" DECIMAL(10,2),

    CONSTRAINT "block_bank_rate_pkey" PRIMARY KEY ("block_id","bank")
);

-- CreateTable
CREATE TABLE "unit" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT,
    "legacy_id" TEXT,
    "block_id" INTEGER NOT NULL,
    "kind" "block_domain",
    "unit_number" TEXT,
    "model" TEXT,
    "availability" "availability",
    "front_m2" DECIMAL(14,4),
    "depth_m2" DECIMAL(14,4),
    "land_m2" DECIMAL(14,4),
    "unit_size_m2" DECIMAL(14,4),
    "habitable_construction_m2" DECIMAL(14,4),
    "parking_size_m2" DECIMAL(14,4),
    "total_size_m2" DECIMAL(14,4),
    "bathrooms" DECIMAL(4,1),
    "has_parking" BOOLEAN,
    "has_motorcycle_parking" BOOLEAN,
    "parking_spaces" INTEGER,
    "total_price_usd" DECIMAL(15,2),
    "price_without_vat_usd" DECIMAL(15,2),
    "price_per_m2_usd" DECIMAL(15,2),
    "rental_price_usd" DECIMAL(15,2),
    "rental_price_without_vat_usd" DECIMAL(15,2),
    "rental_price_per_m2_without_vat_usd" DECIMAL(15,2),
    "maintenance_total_price_m2_usd" DECIMAL(15,2),
    "maintenance_price_per_m2_usd" DECIMAL(15,2),
    "installment_usd" DECIMAL(15,2),
    "income_usd" DECIMAL(15,2),
    "unit_absorption" DECIMAL(18,12),
    "absorption_per_m2" DECIMAL(18,12),
    "usage_id" INTEGER,
    "topography_id" INTEGER,
    "parking_type_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_housing" (
    "unit_id" INTEGER NOT NULL,
    "bedrooms" INTEGER,
    "balcony_terrace_size_m2" DECIMAL(10,2),

    CONSTRAINT "unit_housing_pkey" PRIMARY KEY ("unit_id")
);

-- CreateTable
CREATE TABLE "unit_office" (
    "unit_id" INTEGER NOT NULL,
    "employee_capacity" INTEGER,
    "price_without_parking_m2_usd" DECIMAL(10,2),
    "property_value_without_parking_usd" DECIMAL(10,2),
    "office_classification" "office_classification",
    "general_size_classification" "office_size_classification",
    "employee_capacity_range" "employee_capacity_range",
    "m2_range" TEXT,
    "size_employee_capacity_combined" TEXT,
    "size_m2_combined" TEXT,
    "parking_for_sale" INTEGER,
    "balcony_terrace_size_m2" DECIMAL(10,2),

    CONSTRAINT "unit_office_pkey" PRIMARY KEY ("unit_id")
);

-- CreateTable
CREATE TABLE "unit_industrial" (
    "unit_id" INTEGER NOT NULL,
    "warehouse_storage_size_m2" DECIMAL(10,2),
    "office_size_m2" DECIMAL(10,2),
    "mezzanine_size_m2" DECIMAL(10,2),
    "loading_area_m2" DECIMAL(10,2),
    "width_1_m2" DECIMAL(10,2),
    "depth_1_m2" DECIMAL(10,2),
    "depth_2_m2" DECIMAL(10,2),
    "height_m2" DECIMAL(10,2),
    "additional_parking_price_usd" DECIMAL(10,2),
    "quality_classification" TEXT,

    CONSTRAINT "unit_industrial_pkey" PRIMARY KEY ("unit_id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'local',
    "password_hash" TEXT,
    "role" "user_role" NOT NULL DEFAULT 'authenticated',
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "reset_password_token" TEXT,
    "reset_password_expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_run" (
    "id" UUID NOT NULL,
    "status" "sync_run_status" NOT NULL,
    "operation" "sync_operation" NOT NULL DEFAULT 'push',
    "domain" "block_domain" NOT NULL DEFAULT 'housing',
    "requested_by" TEXT NOT NULL,
    "force" BOOLEAN NOT NULL DEFAULT false,
    "targets_count" INTEGER,
    "done" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "s3_prefix" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "sync_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_run_block" (
    "id" SERIAL NOT NULL,
    "run_id" UUID NOT NULL,
    "block_id" INTEGER,
    "block_public_id" TEXT NOT NULL,
    "cod_proyecto" TEXT,
    "mode" "sync_block_mode",
    "operation" "sync_block_operation",
    "status" TEXT NOT NULL,
    "error" TEXT,
    "phase" SMALLINT,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "sync_run_block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rate" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "currency" TEXT NOT NULL,
    "unit" TEXT,
    "buy" DECIMAL(18,8),
    "sell" DECIMAL(18,8),
    "reference_rate" DECIMAL(18,8),
    "source" TEXT,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "user_id" INTEGER,
    "entity" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "action" "audit_action" NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "amenity_public_id_key" ON "amenity"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_public_id_key" ON "service"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "country_public_id_key" ON "country"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "country_iso_code_key" ON "country"("iso_code");

-- CreateIndex
CREATE UNIQUE INDEX "country_iso_code_2_key" ON "country"("iso_code_2");

-- CreateIndex
CREATE UNIQUE INDEX "developer_public_id_key" ON "developer"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "nse_public_id_key" ON "nse"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "security_type_public_id_key" ON "security_type"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "block_category_public_id_key" ON "block_category"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "block_focus_public_id_key" ON "block_focus"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "block_status_public_id_key" ON "block_status"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "unit_parking_type_public_id_key" ON "unit_parking_type"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "unit_topography_public_id_key" ON "unit_topography"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "unit_usage_public_id_key" ON "unit_usage"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rate_profile_public_id_key" ON "exchange_rate_profile"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_public_id_key" ON "project"("public_id");

-- CreateIndex
CREATE INDEX "project_code_idx" ON "project"("code");

-- CreateIndex
CREATE INDEX "project_country_id_idx" ON "project"("country_id");

-- CreateIndex
CREATE INDEX "project_developer_id_idx" ON "project"("developer_id");

-- CreateIndex
CREATE INDEX "project_exchange_rate_profile_id_idx" ON "project"("exchange_rate_profile_id");

-- CreateIndex
CREATE INDEX "project_amenity_amenity_id_idx" ON "project_amenity"("amenity_id");

-- CreateIndex
CREATE INDEX "project_service_service_id_idx" ON "project_service"("service_id");

-- CreateIndex
CREATE UNIQUE INDEX "block_public_id_key" ON "block"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "block_code_key" ON "block"("code");

-- CreateIndex
CREATE INDEX "block_project_id_idx" ON "block"("project_id");

-- CreateIndex
CREATE INDEX "block_legacy_id_idx" ON "block"("legacy_id");

-- CreateIndex
CREATE INDEX "block_domain_quarter_idx" ON "block"("domain", "quarter");

-- CreateIndex
CREATE UNIQUE INDEX "unit_public_id_key" ON "unit"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "unit_code_key" ON "unit"("code");

-- CreateIndex
CREATE INDEX "unit_block_id_idx" ON "unit"("block_id");

-- CreateIndex
CREATE INDEX "unit_legacy_id_idx" ON "unit"("legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_public_id_key" ON "user"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_reset_password_token_key" ON "user"("reset_password_token");

-- CreateIndex
CREATE INDEX "sync_run_status_idx" ON "sync_run"("status");

-- CreateIndex
CREATE INDEX "sync_run_created_at_idx" ON "sync_run"("created_at");

-- CreateIndex
CREATE INDEX "sync_run_block_run_id_idx" ON "sync_run_block"("run_id");

-- CreateIndex
CREATE INDEX "sync_run_block_block_id_idx" ON "sync_run_block"("block_id");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rate_date_currency_key" ON "exchange_rate"("date", "currency");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_user_id_idx" ON "audit_log"("user_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- AddForeignKey
ALTER TABLE "exchange_rate_profile_currency" ADD CONSTRAINT "exchange_rate_profile_currency_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "exchange_rate_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "developer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_nse_id_fkey" FOREIGN KEY ("nse_id") REFERENCES "nse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_security_type_id_fkey" FOREIGN KEY ("security_type_id") REFERENCES "security_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_exchange_rate_profile_id_fkey" FOREIGN KEY ("exchange_rate_profile_id") REFERENCES "exchange_rate_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_amenity" ADD CONSTRAINT "project_amenity_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_amenity" ADD CONSTRAINT "project_amenity_amenity_id_fkey" FOREIGN KEY ("amenity_id") REFERENCES "amenity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_service" ADD CONSTRAINT "project_service_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_service" ADD CONSTRAINT "project_service_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block" ADD CONSTRAINT "block_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block" ADD CONSTRAINT "block_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "block_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block" ADD CONSTRAINT "block_focus_id_fkey" FOREIGN KEY ("focus_id") REFERENCES "block_focus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block" ADD CONSTRAINT "block_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "block_status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block_financing" ADD CONSTRAINT "block_financing_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "block"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block_bank_rate" ADD CONSTRAINT "block_bank_rate_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "block"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit" ADD CONSTRAINT "unit_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "block"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit" ADD CONSTRAINT "unit_usage_id_fkey" FOREIGN KEY ("usage_id") REFERENCES "unit_usage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit" ADD CONSTRAINT "unit_topography_id_fkey" FOREIGN KEY ("topography_id") REFERENCES "unit_topography"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit" ADD CONSTRAINT "unit_parking_type_id_fkey" FOREIGN KEY ("parking_type_id") REFERENCES "unit_parking_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_housing" ADD CONSTRAINT "unit_housing_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_office" ADD CONSTRAINT "unit_office_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_industrial" ADD CONSTRAINT "unit_industrial_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_run_block" ADD CONSTRAINT "sync_run_block_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "sync_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_run_block" ADD CONSTRAINT "sync_run_block_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "block"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
