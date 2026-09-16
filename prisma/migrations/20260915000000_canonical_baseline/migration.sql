-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('ADMIN', 'OFFICE', 'PROJECT_MANAGER', 'EMPLOYEE', 'ACCOUNTING');

-- CreateEnum
CREATE TYPE "CollaborationRole" AS ENUM ('COLLAB_VIEWER', 'COLLAB_MEMBER', 'COLLAB_MANAGER', 'EXTERNAL_PLANNER', 'INTERNAL_PLANNER', 'OPERATOR', 'PARTNER');

-- CreateEnum
CREATE TYPE "CollaborationProjectStatus" AS ENUM ('DRAFT', 'PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CollaborationHealthStatus" AS ENUM ('GREEN', 'YELLOW', 'RED');

-- CreateEnum
CREATE TYPE "CollaborationStageStatus" AS ENUM ('NOT_STARTED', 'READY', 'IN_PROGRESS', 'WAITING_FOR_APPROVAL', 'BLOCKED', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "CollaborationTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "CollaborationTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CollaborationBlockerStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "CollaborationApprovalStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProjectParticipantRole" AS ENUM ('PROJECT_LEAD', 'PROJECT_MEMBER', 'OBSERVER');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED_TO_ORDER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderConfirmationType" AS ENUM ('SIGNED_DOCUMENT', 'EMAIL', 'VERBAL', 'CUSTOMER_PURCHASE_ORDER', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'FINALIZED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'CORRECTED');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('STANDARD', 'ADVANCE', 'PARTIAL', 'FINAL', 'CORRECTION', 'CANCELLATION');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('OFFER_PDF', 'ORDER_PDF', 'INVOICE_PDF', 'SERVICE_REPORT_PDF', 'ORDER_CONFIRMATION', 'SERVICE_REPORT_CONFIRMATION', 'CORRECTION_PDF', 'CANCELLATION_PDF', 'UPLOAD', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentFormat" AS ENUM ('PDF', 'DOCX', 'JSON', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentLifecycle" AS ENUM ('DRAFT', 'FINAL', 'UPLOAD');

-- CreateEnum
CREATE TYPE "ArchiveStatus" AS ENUM ('PENDING', 'ARCHIVED', 'FAILED');

-- CreateEnum
CREATE TYPE "ServiceReportStatus" AS ENUM ('DRAFT', 'FINALIZED');

-- CreateEnum
CREATE TYPE "NumberSequenceType" AS ENUM ('OFFER', 'ORDER', 'INVOICE', 'SERVICE_REPORT');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'OFFER_NUMBER_CHANGE', 'DELETE', 'STATUS_CHANGE', 'FINALIZE', 'CANCEL', 'CORRECT', 'PAYMENT_ADDED', 'PAYMENT_REMOVED', 'DOCUMENT_UPLOADED', 'DOCUMENT_DELETED', 'LOGIN', 'LOGOUT', 'PERMISSION_CHANGED', 'SETTINGS_CHANGED', 'ARCHIVE_SUCCEEDED', 'ARCHIVE_FAILED', 'ARCHIVE_RETRIED', 'ARCHIVE_TESTED');

-- CreateEnum
CREATE TYPE "CustomerAddressType" AS ENUM ('BILLING', 'SHIPPING');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "role_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_projects" (
    "id" TEXT NOT NULL,
    "project_number" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "year" INTEGER,
    "status" "CollaborationProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "health_status" "CollaborationHealthStatus" NOT NULL DEFAULT 'GREEN',
    "location" TEXT,
    "building" TEXT,
    "floor" TEXT,
    "area" TEXT,
    "planned_start" TIMESTAMP(3),
    "planned_end" TIMESTAMP(3),
    "actual_start" TIMESTAMP(3),
    "actual_end" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "internal_project_id" TEXT,

    CONSTRAINT "collaboration_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "project_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "customer_id" TEXT NOT NULL,
    "lead_user_id" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "location" TEXT,
    "building" TEXT,
    "floor" TEXT,
    "area" TEXT,
    "planned_start" TIMESTAMP(3),
    "planned_end" TIMESTAMP(3),
    "actual_start" TIMESTAMP(3),
    "actual_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_participants" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "ProjectParticipantRole" NOT NULL DEFAULT 'PROJECT_MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "role" "CollaborationRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collaboration_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_project_stages" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "CollaborationStageStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "weight" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "responsible_membership_id" TEXT,
    "planned_start" TIMESTAMP(3),
    "planned_end" TIMESTAMP(3),
    "actual_start" TIMESTAMP(3),
    "actual_end" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "blocked_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collaboration_project_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_tasks" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CollaborationTaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "CollaborationTaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "responsible_membership_id" TEXT,
    "due_date" TIMESTAMP(3),
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collaboration_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_checklist_items" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "responsible_membership_id" TEXT,
    "completed_by_membership_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collaboration_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_blockers" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "stage_id" TEXT,
    "task_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CollaborationBlockerStatus" NOT NULL DEFAULT 'OPEN',
    "responsible_membership_id" TEXT,
    "cause" TEXT,
    "resolution" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collaboration_blockers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_approvals" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "status" "CollaborationApprovalStatus" NOT NULL DEFAULT 'REQUESTED',
    "requested_by_id" TEXT NOT NULL,
    "decided_by_id" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collaboration_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_project_stage_dependencies" (
    "id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "depends_on_stage_id" TEXT NOT NULL,
    "required_status" "CollaborationStageStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collaboration_project_stage_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" "RoleName" NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "legal_form" TEXT,
    "vat_id" TEXT,
    "tax_number" TEXT,
    "street" TEXT,
    "house_number" TEXT,
    "postal_code" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'DE',
    "has_billing_address" BOOLEAN NOT NULL DEFAULT false,
    "billing_name" TEXT,
    "billing_additional" TEXT,
    "billing_street" TEXT,
    "billing_house_number" TEXT,
    "billing_postal_code" TEXT,
    "billing_city" TEXT,
    "billing_country" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "fax" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "normalized_key" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "additional" TEXT,
    "street" TEXT NOT NULL,
    "house_number" TEXT,
    "postal_code" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'DE',
    "contact_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "address_id" TEXT NOT NULL,
    "type" "CustomerAddressType" NOT NULL,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "salutation" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "position" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "offer_number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "project_id" TEXT,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "customer_snapshot" JSONB,
    "company_snapshot" JSONB,
    "area_name" TEXT,
    "title" TEXT,
    "intro_text" TEXT,
    "outro_text" TEXT,
    "offer_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "total_net" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_gross" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pdf_path" TEXT,
    "pdf_version" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_items" (
    "id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Stk.',
    "unit_price" DECIMAL(12,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "tax_amount" DECIMAL(12,2) NOT NULL,
    "gross_amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "offer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "project_id" TEXT,
    "offer_id" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "customer_snapshot" JSONB,
    "company_snapshot" JSONB,
    "title" TEXT,
    "description" TEXT,
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "confirmation_type" "OrderConfirmationType",
    "confirmation_note" TEXT,
    "completed_at" TIMESTAMP(3),
    "total_net" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_gross" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Stk.',
    "unit_price" DECIMAL(12,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "tax_amount" DECIMAL(12,2) NOT NULL,
    "gross_amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_reports" (
    "id" TEXT NOT NULL,
    "report_number" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "report_date" TIMESTAMP(3) NOT NULL,
    "status" "ServiceReportStatus" NOT NULL DEFAULT 'DRAFT',
    "finalized_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "customer_snapshot" JSONB,
    "company_snapshot" JSONB,
    "total_net" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pdf_path" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_report_items" (
    "id" TEXT NOT NULL,
    "service_report_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Std.',
    "unit_price" DECIMAL(12,2) NOT NULL,
    "discount_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 19,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "service_report_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoice_number" TEXT,
    "customer_id" TEXT NOT NULL,
    "order_id" TEXT,
    "project_id" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "type" "InvoiceType" NOT NULL DEFAULT 'STANDARD',
    "original_invoice_id" TEXT,
    "cancelled_by_invoice_id" TEXT,
    "customer_snapshot" JSONB,
    "company_snapshot" JSONB,
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "delivery_date" TIMESTAMP(3),
    "delivery_period_start" TIMESTAMP(3),
    "delivery_period_end" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "finalized_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "total_net" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_gross" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payment_term_days" INTEGER,
    "payment_note" TEXT,
    "intro_text" TEXT,
    "outro_text" TEXT,
    "pdf_path" TEXT,
    "pdf_version" INTEGER NOT NULL DEFAULT 0,
    "pdf_generated_at" TIMESTAMP(3),
    "xrechnung_xml" TEXT,
    "zugferd_data" JSONB,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Stk.',
    "unit_price" DECIMAL(12,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "tax_amount" DECIMAL(12,2) NOT NULL,
    "gross_amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "method" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "format" "DocumentFormat" NOT NULL DEFAULT 'OTHER',
    "lifecycle" "DocumentLifecycle" NOT NULL DEFAULT 'UPLOAD',
    "archive_status" "ArchiveStatus" NOT NULL DEFAULT 'ARCHIVED',
    "archive_error" TEXT,
    "archive_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_archive_attempt_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "customer_id" TEXT,
    "offer_id" TEXT,
    "order_id" TEXT,
    "service_report_id" TEXT,
    "invoice_id" TEXT,
    "customer_purchase_order_id" TEXT,
    "project_id" TEXT,
    "filename" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "checksum" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_purchase_orders" (
    "id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "order_id" TEXT,
    "order_number" TEXT,
    "order_date" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequences" (
    "id" TEXT NOT NULL,
    "type" "NumberSequenceType" NOT NULL,
    "year" INTEGER NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "format" TEXT NOT NULL DEFAULT '{prefix}{year}-{number:04}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "user_email" TEXT,
    "action" "AuditAction" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_settings" (
    "id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "legal_form" TEXT,
    "business_activity" TEXT,
    "street" TEXT,
    "house_number" TEXT,
    "postal_code" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'DE',
    "vat_id" TEXT,
    "tax_number" TEXT,
    "tax_office" TEXT,
    "bank_name" TEXT,
    "iban" TEXT,
    "bic" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "fax" TEXT,
    "website" TEXT,
    "register_court" TEXT,
    "register_number" TEXT,
    "managing_director" TEXT,
    "supplier_number" TEXT,
    "invoice_prefix" TEXT NOT NULL DEFAULT 'RE',
    "offer_prefix" TEXT NOT NULL DEFAULT 'AN',
    "order_prefix" TEXT NOT NULL DEFAULT 'AU',
    "service_report_prefix" TEXT NOT NULL DEFAULT 'LN',
    "default_payment_term_days" INTEGER NOT NULL DEFAULT 14,
    "default_tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 19.00,
    "default_invoice_intro" TEXT,
    "default_invoice_outro" TEXT,
    "default_offer_intro" TEXT,
    "default_offer_outro" TEXT,
    "logo_path" TEXT,
    "logo_storage_key" TEXT,
    "logo_scale" INTEGER NOT NULL DEFAULT 140,
    "logo_width" INTEGER,
    "logo_height" INTEGER,
    "document_archive_enabled" BOOLEAN NOT NULL DEFAULT false,
    "document_archive_path" TEXT,
    "document_archive_json_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunning_notices" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "level_label" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "due_date" TIMESTAMP(3) NOT NULL,
    "fee" DECIMAL(10,2),
    "pdf_path" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "dunning_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "collaboration_projects_project_number_key" ON "collaboration_projects"("project_number");

-- CreateIndex
CREATE UNIQUE INDEX "collaboration_projects_internal_project_id_key" ON "collaboration_projects"("internal_project_id");

-- CreateIndex
CREATE INDEX "collaboration_projects_active_deleted_at_idx" ON "collaboration_projects"("active", "deleted_at");

-- CreateIndex
CREATE INDEX "collaboration_projects_status_deleted_at_idx" ON "collaboration_projects"("status", "deleted_at");

-- CreateIndex
CREATE INDEX "collaboration_projects_health_status_deleted_at_idx" ON "collaboration_projects"("health_status", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "projects_project_number_key" ON "projects"("project_number");

-- CreateIndex
CREATE INDEX "projects_customer_id_deleted_at_idx" ON "projects"("customer_id", "deleted_at");

-- CreateIndex
CREATE INDEX "projects_lead_user_id_idx" ON "projects"("lead_user_id");

-- CreateIndex
CREATE INDEX "projects_status_deleted_at_idx" ON "projects"("status", "deleted_at");

-- CreateIndex
CREATE INDEX "project_participants_user_id_idx" ON "project_participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_participants_project_id_user_id_key" ON "project_participants"("project_id", "user_id");

-- CreateIndex
CREATE INDEX "collaboration_memberships_user_id_active_idx" ON "collaboration_memberships"("user_id", "active");

-- CreateIndex
CREATE INDEX "collaboration_memberships_project_id_active_idx" ON "collaboration_memberships"("project_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "collaboration_memberships_user_id_project_id_key" ON "collaboration_memberships"("user_id", "project_id");

-- CreateIndex
CREATE INDEX "collaboration_project_stages_project_id_status_idx" ON "collaboration_project_stages"("project_id", "status");

-- CreateIndex
CREATE INDEX "collaboration_project_stages_responsible_membership_id_idx" ON "collaboration_project_stages"("responsible_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "collaboration_project_stages_project_id_code_key" ON "collaboration_project_stages"("project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "collaboration_project_stages_project_id_sequence_key" ON "collaboration_project_stages"("project_id", "sequence");

-- CreateIndex
CREATE INDEX "collaboration_tasks_project_id_status_idx" ON "collaboration_tasks"("project_id", "status");

-- CreateIndex
CREATE INDEX "collaboration_tasks_stage_id_sequence_idx" ON "collaboration_tasks"("stage_id", "sequence");

-- CreateIndex
CREATE INDEX "collaboration_tasks_responsible_membership_id_idx" ON "collaboration_tasks"("responsible_membership_id");

-- CreateIndex
CREATE INDEX "collaboration_checklist_items_project_id_completed_idx" ON "collaboration_checklist_items"("project_id", "completed");

-- CreateIndex
CREATE INDEX "collaboration_checklist_items_stage_id_sequence_idx" ON "collaboration_checklist_items"("stage_id", "sequence");

-- CreateIndex
CREATE INDEX "collaboration_blockers_project_id_status_idx" ON "collaboration_blockers"("project_id", "status");

-- CreateIndex
CREATE INDEX "collaboration_blockers_stage_id_status_idx" ON "collaboration_blockers"("stage_id", "status");

-- CreateIndex
CREATE INDEX "collaboration_blockers_task_id_status_idx" ON "collaboration_blockers"("task_id", "status");

-- CreateIndex
CREATE INDEX "collaboration_approvals_project_id_status_idx" ON "collaboration_approvals"("project_id", "status");

-- CreateIndex
CREATE INDEX "collaboration_approvals_stage_id_status_idx" ON "collaboration_approvals"("stage_id", "status");

-- CreateIndex
CREATE INDEX "collaboration_project_stage_dependencies_depends_on_stage_i_idx" ON "collaboration_project_stage_dependencies"("depends_on_stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "collaboration_project_stage_dependencies_stage_id_depends_o_key" ON "collaboration_project_stage_dependencies"("stage_id", "depends_on_stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE INDEX "permissions_resource_idx" ON "permissions"("resource");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_resource_action_key" ON "permissions"("resource", "action");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_number_key" ON "customers"("number");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE INDEX "customers_number_idx" ON "customers"("number");

-- CreateIndex
CREATE INDEX "customers_deleted_at_idx" ON "customers"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "addresses_normalized_key_key" ON "addresses"("normalized_key");

-- CreateIndex
CREATE INDEX "addresses_company_name_idx" ON "addresses"("company_name");

-- CreateIndex
CREATE INDEX "addresses_street_postal_code_city_country_idx" ON "addresses"("street", "postal_code", "city", "country");

-- CreateIndex
CREATE INDEX "customer_addresses_customer_id_type_is_active_idx" ON "customer_addresses"("customer_id", "type", "is_active");

-- CreateIndex
CREATE INDEX "customer_addresses_address_id_idx" ON "customer_addresses"("address_id");

-- CreateIndex
CREATE INDEX "customer_addresses_deleted_at_idx" ON "customer_addresses"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "customer_addresses_customer_id_address_id_type_key" ON "customer_addresses"("customer_id", "address_id", "type");

-- CreateIndex
CREATE INDEX "contacts_customer_id_idx" ON "contacts"("customer_id");

-- CreateIndex
CREATE INDEX "contacts_deleted_at_idx" ON "contacts"("deleted_at");

-- CreateIndex
CREATE INDEX "offers_customer_id_idx" ON "offers"("customer_id");

-- CreateIndex
CREATE INDEX "offers_project_id_idx" ON "offers"("project_id");

-- CreateIndex
CREATE INDEX "offers_status_idx" ON "offers"("status");

-- CreateIndex
CREATE INDEX "offers_offer_date_idx" ON "offers"("offer_date");

-- CreateIndex
CREATE INDEX "offers_deleted_at_idx" ON "offers"("deleted_at");

-- CreateIndex
CREATE INDEX "offer_items_offer_id_idx" ON "offer_items"("offer_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_offer_id_key" ON "orders"("offer_id");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE INDEX "orders_project_id_idx" ON "orders"("project_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_order_date_idx" ON "orders"("order_date");

-- CreateIndex
CREATE INDEX "orders_deleted_at_idx" ON "orders"("deleted_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_reports_report_number_key" ON "service_reports"("report_number");

-- CreateIndex
CREATE INDEX "service_reports_report_date_idx" ON "service_reports"("report_date");

-- CreateIndex
CREATE UNIQUE INDEX "service_reports_order_id_key" ON "service_reports"("order_id");

-- CreateIndex
CREATE INDEX "service_report_items_service_report_id_idx" ON "service_report_items"("service_report_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_customer_id_idx" ON "invoices"("customer_id");

-- CreateIndex
CREATE INDEX "invoices_order_id_idx" ON "invoices"("order_id");

-- CreateIndex
CREATE INDEX "invoices_project_id_idx" ON "invoices"("project_id");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_invoice_date_idx" ON "invoices"("invoice_date");

-- CreateIndex
CREATE INDEX "invoices_due_date_idx" ON "invoices"("due_date");

-- CreateIndex
CREATE INDEX "invoices_finalized_at_idx" ON "invoices"("finalized_at");

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");

-- CreateIndex
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- CreateIndex
CREATE INDEX "payments_payment_date_idx" ON "payments"("payment_date");

-- CreateIndex
CREATE INDEX "documents_customer_id_idx" ON "documents"("customer_id");

-- CreateIndex
CREATE INDEX "documents_offer_id_idx" ON "documents"("offer_id");

-- CreateIndex
CREATE INDEX "documents_order_id_idx" ON "documents"("order_id");

-- CreateIndex
CREATE INDEX "documents_invoice_id_idx" ON "documents"("invoice_id");

-- CreateIndex
CREATE INDEX "documents_customer_purchase_order_id_idx" ON "documents"("customer_purchase_order_id");

-- CreateIndex
CREATE INDEX "documents_project_id_idx" ON "documents"("project_id");

-- CreateIndex
CREATE INDEX "documents_type_idx" ON "documents"("type");

-- CreateIndex
CREATE INDEX "documents_archive_status_idx" ON "documents"("archive_status");

-- CreateIndex
CREATE INDEX "documents_lifecycle_idx" ON "documents"("lifecycle");

-- CreateIndex
CREATE INDEX "documents_deleted_at_idx" ON "documents"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "customer_purchase_orders_offer_id_key" ON "customer_purchase_orders"("offer_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_purchase_orders_order_id_key" ON "customer_purchase_orders"("order_id");

-- CreateIndex
CREATE INDEX "customer_purchase_orders_customer_id_idx" ON "customer_purchase_orders"("customer_id");

-- CreateIndex
CREATE INDEX "customer_purchase_orders_created_by_id_idx" ON "customer_purchase_orders"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "number_sequences_type_year_key" ON "number_sequences"("type", "year");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "dunning_notices_invoice_id_idx" ON "dunning_notices"("invoice_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_projects" ADD CONSTRAINT "collaboration_projects_internal_project_id_fkey" FOREIGN KEY ("internal_project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_lead_user_id_fkey" FOREIGN KEY ("lead_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_participants" ADD CONSTRAINT "project_participants_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_participants" ADD CONSTRAINT "project_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_memberships" ADD CONSTRAINT "collaboration_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_memberships" ADD CONSTRAINT "collaboration_memberships_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "collaboration_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_project_stages" ADD CONSTRAINT "collaboration_project_stages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "collaboration_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_project_stages" ADD CONSTRAINT "collaboration_project_stages_responsible_membership_id_fkey" FOREIGN KEY ("responsible_membership_id") REFERENCES "collaboration_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_tasks" ADD CONSTRAINT "collaboration_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "collaboration_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_tasks" ADD CONSTRAINT "collaboration_tasks_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "collaboration_project_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_tasks" ADD CONSTRAINT "collaboration_tasks_responsible_membership_id_fkey" FOREIGN KEY ("responsible_membership_id") REFERENCES "collaboration_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_checklist_items" ADD CONSTRAINT "collaboration_checklist_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "collaboration_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_checklist_items" ADD CONSTRAINT "collaboration_checklist_items_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "collaboration_project_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_checklist_items" ADD CONSTRAINT "collaboration_checklist_items_responsible_membership_id_fkey" FOREIGN KEY ("responsible_membership_id") REFERENCES "collaboration_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_checklist_items" ADD CONSTRAINT "collaboration_checklist_items_completed_by_membership_id_fkey" FOREIGN KEY ("completed_by_membership_id") REFERENCES "collaboration_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_blockers" ADD CONSTRAINT "collaboration_blockers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "collaboration_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_blockers" ADD CONSTRAINT "collaboration_blockers_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "collaboration_project_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_blockers" ADD CONSTRAINT "collaboration_blockers_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "collaboration_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_blockers" ADD CONSTRAINT "collaboration_blockers_responsible_membership_id_fkey" FOREIGN KEY ("responsible_membership_id") REFERENCES "collaboration_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_blockers" ADD CONSTRAINT "collaboration_blockers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_blockers" ADD CONSTRAINT "collaboration_blockers_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_approvals" ADD CONSTRAINT "collaboration_approvals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "collaboration_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_approvals" ADD CONSTRAINT "collaboration_approvals_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "collaboration_project_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_approvals" ADD CONSTRAINT "collaboration_approvals_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_approvals" ADD CONSTRAINT "collaboration_approvals_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_project_stage_dependencies" ADD CONSTRAINT "collaboration_project_stage_dependencies_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "collaboration_project_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_project_stage_dependencies" ADD CONSTRAINT "collaboration_project_stage_dependencies_depends_on_stage__fkey" FOREIGN KEY ("depends_on_stage_id") REFERENCES "collaboration_project_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_items" ADD CONSTRAINT "offer_items_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_report_items" ADD CONSTRAINT "service_report_items_service_report_id_fkey" FOREIGN KEY ("service_report_id") REFERENCES "service_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_service_report_id_fkey" FOREIGN KEY ("service_report_id") REFERENCES "service_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_customer_purchase_order_id_fkey" FOREIGN KEY ("customer_purchase_order_id") REFERENCES "customer_purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_purchase_orders" ADD CONSTRAINT "customer_purchase_orders_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_purchase_orders" ADD CONSTRAINT "customer_purchase_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_purchase_orders" ADD CONSTRAINT "customer_purchase_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_purchase_orders" ADD CONSTRAINT "customer_purchase_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dunning_notices" ADD CONSTRAINT "dunning_notices_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
