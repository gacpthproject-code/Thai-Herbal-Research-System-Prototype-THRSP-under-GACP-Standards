-- CreateTable
CREATE TABLE "application_documents" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "applicationId" TEXT NOT NULL,
    "documentId" TEXT,
    "slotId" TEXT,
    "stepKey" TEXT,
    "documentType" TEXT NOT NULL,
    "fileName" TEXT,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "fileHash" TEXT,
    "photoHash" TEXT,
    "idNumber" TEXT,
    "verificationStatus" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "uploadedBy" TEXT,
    "currentForSlot" TEXT,
    "slotVersion" INTEGER NOT NULL DEFAULT 1,
    "supersededAt" TIMESTAMP(3),
    "supersededById" TEXT,

    CONSTRAINT "application_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "applicationNumber" TEXT NOT NULL,
    "healthId" TEXT NOT NULL,
    "entityId" TEXT,
    "submitterId" TEXT,
    "serviceType" TEXT NOT NULL DEFAULT 'new_application',
    "areaType" TEXT NOT NULL,
    "certificationPurpose" TEXT,
    "certificationPurposes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "previousCertNumber" TEXT,
    "consentedPDPA" BOOLEAN NOT NULL DEFAULT false,
    "standardCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "rejectCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "batchId" TEXT,
    "areaTypeIndex" INTEGER NOT NULL DEFAULT 0,
    "cultivationScopeCount" INTEGER,
    "totalAreaTypes" INTEGER NOT NULL DEFAULT 1,
    "phase1Amount" INTEGER NOT NULL DEFAULT 5885,
    "phase1Status" TEXT NOT NULL DEFAULT 'PENDING',
    "phase1InvoiceId" TEXT,
    "phase1PaidAt" TIMESTAMP(3),
    "phase1ExpiresAt" TIMESTAMP(3),
    "phase1SlipId" TEXT,
    "phase2Amount" INTEGER NOT NULL DEFAULT 29425,
    "phase2Status" TEXT NOT NULL DEFAULT 'PENDING',
    "phase2InvoiceId" TEXT,
    "phase2PaidAt" TIMESTAMP(3),
    "phase2ExpiresAt" TIMESTAMP(3),
    "phase2SlipId" TEXT,
    "previewData" JSONB,
    "isPreviewReady" BOOLEAN NOT NULL DEFAULT false,
    "reviewerId" TEXT,
    "headAuditorId" TEXT,
    "schedulerId" TEXT,
    "auditorId" TEXT,
    "sameReviewerAuditor" BOOLEAN NOT NULL DEFAULT false,
    "scheduledDate" TIMESTAMP(3),
    "auditResult" TEXT,
    "auditNotes" TEXT,
    "appointmentMode" TEXT,
    "meetingUrl" TEXT,
    "appointmentLocation" TEXT,
    "auditMode" TEXT,
    "auditMeetingUrl" TEXT,
    "auditLocation" TEXT,
    "formData" JSONB,
    "personnelHygiene" JSONB,
    "attachments" JSONB,
    "workflowHistory" JSONB,
    "supplementaryCriteria" JSONB,
    "supplementarySkipped" BOOLEAN NOT NULL DEFAULT false,
    "labResults" JSONB,
    "labResultStatus" TEXT,
    "labName" TEXT,
    "submissionHash" TEXT,
    "idempotencyKey" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdByIp" TEXT,
    "updatedByIp" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,
    "retainUntil" TIMESTAMP(3) NOT NULL DEFAULT (now() + '5 years'::interval),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "closedReason" TEXT,
    "bundleId" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_comments" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "internalOnly" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "application_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_drafts" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSavedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "plantId" TEXT,
    "serviceType" TEXT NOT NULL DEFAULT 'NEW',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "formData" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "application_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_bundles" (
    "id" TEXT NOT NULL,
    "bundleNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "healthId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "application_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resModel" TEXT NOT NULL,
    "resId" TEXT NOT NULL,
    "field" TEXT,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT,
    "fileHash" TEXT,
    "uploadedBy" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_audit_checklist_items" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "auditId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "notes" TEXT,
    "isCritical" BOOLEAN NOT NULL,
    "maxPoints" INTEGER NOT NULL,
    "recordedBy" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farm_audit_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_audit_photos" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "auditId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "gpsLatitude" DOUBLE PRECISION NOT NULL,
    "gpsLongitude" DOUBLE PRECISION NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "caption" TEXT,
    "farmDistanceMeters" DOUBLE PRECISION,
    "farmDistanceStatus" TEXT,
    "captureTimeSource" TEXT,
    "captureWindowSource" TEXT,
    "captureWindowStatus" TEXT,
    "captureWindowOffsetSec" INTEGER,
    "perceptualHash" TEXT,
    "perceptualHashAlgo" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "checklistItemId" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "farm_audit_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gps_verification_logs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reportedLatitude" DOUBLE PRECISION NOT NULL,
    "reportedLongitude" DOUBLE PRECISION NOT NULL,
    "gpsAccuracy" DOUBLE PRECISION,
    "verifiedBy" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "verificationMethod" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "gps_verification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "actorId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL DEFAULT 'USER',
    "actorEmail" TEXT,
    "actorRole" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "metadata" JSONB,
    "result" TEXT NOT NULL DEFAULT 'SUCCESS',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "previousHash" TEXT NOT NULL,
    "currentHash" TEXT NOT NULL,
    "hashAlgorithm" TEXT NOT NULL DEFAULT 'SHA-256',
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_audit_tasks" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "applicationId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "documents" JSONB,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "assignedTo" TEXT,
    "assignedBy" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "post_audit_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revision_deadlines" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "applicationId" TEXT NOT NULL,
    "revisionDue" TIMESTAMP(3) NOT NULL,
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "extensionDays" INTEGER,
    "extensionReason" TEXT,
    "extensionApprovedBy" TEXT,
    "extensionApprovedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "submittedBy" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "revision_deadlines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountType" TEXT NOT NULL DEFAULT 'HEALTH',
    "entityType" TEXT,
    "authType" TEXT NOT NULL DEFAULT 'HEALTH_ID',
    "email" TEXT,
    "password" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "phoneNumber" TEXT,
    "healthId" TEXT,
    "healthIdHash" TEXT,
    "healthIdHmac" TEXT,
    "providerId" TEXT,
    "providerIdHash" TEXT,
    "providerIdHmac" TEXT,
    "canonicalId" TEXT NOT NULL,
    "canonicalIdLegacy" TEXT,
    "ministryVerified" BOOLEAN NOT NULL DEFAULT false,
    "ministryVerifiedAt" TIMESTAMP(3),
    "idCard_deprecated" TEXT,
    "idCardHash_deprecated" TEXT,
    "idCardHmac" TEXT,
    "laserCode" TEXT,
    "companyName" TEXT,
    "taxId" TEXT,
    "taxIdHash" TEXT,
    "taxIdHmac" TEXT,
    "representativeName" TEXT,
    "representativePosition" TEXT,
    "communityName" TEXT,
    "communityRegistrationNo" TEXT,
    "communityRegistrationNoHash" TEXT,
    "communityRegistrationNoHmac" TEXT,
    "role" TEXT NOT NULL DEFAULT 'health',
    "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "accountTier" TEXT NOT NULL DEFAULT 'NORMAL',
    "address" TEXT,
    "province" TEXT,
    "district" TEXT,
    "subdistrict" TEXT,
    "zipCode" TEXT,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerificationToken" TEXT,
    "emailVerificationExpiry" TIMESTAMP(3),
    "passwordResetToken" TEXT,
    "passwordResetExpiry" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "loginAttempts" INTEGER NOT NULL DEFAULT 0,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedUntil" TIMESTAMP(3),
    "sessionsRevokedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdByIp" TEXT,
    "updatedByIp" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,
    "retainUntil" TIMESTAMP(3) NOT NULL DEFAULT (now() + '5 years'::interval),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "isAnonymized" BOOLEAN NOT NULL DEFAULT false,
    "anonymizedAt" TIMESTAMP(3),
    "privacySettings" JSONB,
    "notificationSettings" JSONB,
    "twoFactorSecret" TEXT,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorBackupCodes" JSONB,
    "twoFactorMethod" TEXT DEFAULT 'TOTP',
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_consents" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT false,
    "grantedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "user_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_links" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "identity_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "applicationId" TEXT,
    "subscriptionId" TEXT,
    "healthId" TEXT NOT NULL,
    "quoteId" TEXT,
    "serviceType" TEXT NOT NULL,
    "billingName" TEXT,
    "billingAddress" TEXT,
    "certificateNumber" TEXT,
    "items" JSONB,
    "subtotal" DECIMAL(15,2) NOT NULL,
    "vat" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "totalAmountText" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMP(3),
    "paymentTransactionId" TEXT,
    "paymentMethod" TEXT,
    "receiptNumber" TEXT,
    "receiptIssuedAt" TIMESTAMP(3),
    "receiptIssuedBy" TEXT,
    "receiptStatus" TEXT,
    "receiptError" TEXT,
    "receiptAttempts" INTEGER NOT NULL DEFAULT 0,
    "receiptLastAttemptAt" TIMESTAMP(3),
    "signatureMetadata" JSONB,
    "notes" TEXT,
    "metadata" JSONB,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdByIp" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,
    "retainUntil" TIMESTAMP(3) NOT NULL DEFAULT (now() + '7 years'::interval),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line_items" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(15,2) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "phase" TEXT,
    "isTaxable" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tier" TEXT NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "priceTHB" DECIMAL(15,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdBy" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "items" JSONB,
    "subtotal" DECIMAL(15,2) NOT NULL,
    "vat" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "validUntil" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "applicationId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "gatewayRef" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT,
    "paymentData" JSONB,
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "webhookReceivedAt" TIMESTAMP(3),
    "webhookData" JSONB,
    "idempotencyKey" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "branchName" TEXT,
    "promptpayId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "defaultForPhase" TEXT,
    "issuerType" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveUntil" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_slips" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "applicationId" TEXT,
    "subscriptionId" TEXT,
    "invoiceId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileMimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "bankRef" TEXT NOT NULL,
    "transferredAt" TIMESTAMP(3) NOT NULL,
    "amountClaimed" INTEGER NOT NULL,
    "payerNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "amountVerified" INTEGER,
    "bankAccountId" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "uploadedByIp" TEXT,
    "organizationId" TEXT NOT NULL,
    "retainUntil" TIMESTAMP(3) NOT NULL DEFAULT (now() + '7 years'::interval),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "payment_slips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entryDate" TIMESTAMP(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "invoiceId" UUID,
    "description" TEXT NOT NULL,
    "totalDebit" DECIMAL(15,2) NOT NULL,
    "totalCredit" DECIMAL(15,2) NOT NULL,
    "organizationId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entryId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "debit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "issuer" TEXT,
    "taxableAmount" DECIMAL(15,2),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_sequences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "prefix" TEXT,
    "year" INTEGER,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "issuerType" TEXT,
    "documentType" TEXT,
    "yearBE" INTEGER,
    "yearAD" INTEGER,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "lastAllocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipt_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "applicationId" TEXT NOT NULL,
    "issuerType" TEXT NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "subtotal" DECIMAL(15,2) NOT NULL,
    "vat" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "installments" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "validUntil" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "acceptedSnapshot" JSONB,
    "acceptedSnapshotHash" TEXT,
    "acceptedBy" TEXT,
    "phase1InvoicedAt" TIMESTAMP(3),
    "phase2InvoicedAt" TIMESTAMP(3),
    "notes" TEXT,
    "applicantNotes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "originalInvoiceId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "subtotal" DECIMAL(15,2) NOT NULL,
    "vat" DECIMAL(15,2) NOT NULL,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "status" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "issuedBy" TEXT,
    "postedAt" TIMESTAMP(3),
    "postedBy" TEXT,
    "organizationId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debit_notes" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "debitNoteNumber" TEXT NOT NULL,
    "originalInvoiceId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "subtotal" DECIMAL(15,2) NOT NULL,
    "vat" DECIMAL(15,2) NOT NULL,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "status" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "issuedBy" TEXT,
    "postedAt" TIMESTAMP(3),
    "postedBy" TEXT,
    "organizationId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "debit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_journal_entry_drafts" (
    "id" TEXT NOT NULL,
    "draftNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "postingDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "linesJson" JSONB NOT NULL,
    "totalDebit" DECIMAL(15,2) NOT NULL,
    "totalCredit" DECIMAL(15,2) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "postedJournalEntryId" UUID,
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "organizationId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_journal_entry_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "period_closes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reopenedAt" TIMESTAMP(3),
    "reopenedBy" TEXT,
    "reopenReason" TEXT,
    "notes" TEXT,

    CONSTRAINT "period_closes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierTaxId" TEXT NOT NULL,
    "supplierTaxIdHmac" TEXT,
    "supplierAddress" TEXT,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "receivedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(15,2) NOT NULL,
    "vat" DECIMAL(15,2) NOT NULL,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "attachmentId" TEXT,
    "organizationId" TEXT,
    "status" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "rejectionReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "journalEntryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_orders" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "applicationId" TEXT,
    "subscriptionId" TEXT,
    "milestone" TEXT NOT NULL,
    "dtam_fee_amount" DECIMAL(15,2) NOT NULL,
    "platform_fee_net" DECIMAL(15,2) NOT NULL,
    "platform_fee_vat" DECIMAL(15,2) NOT NULL,
    "platform_fee_gross" DECIMAL(15,2) NOT NULL,
    "total_payable_amount" DECIMAL(15,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    "quotation_id" UUID,
    "quotation_snapshot_hash" TEXT,
    "payment_terms_version" TEXT,
    "payment_terms_accepted_at" TIMESTAMP(3),
    "stripe_payment_intent_id" TEXT,
    "expiresAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "invoiceId" TEXT,
    "paymentTransactionId" TEXT,
    "dtam_remittance_status" TEXT,
    "remittanceBatchId" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "checkout_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dtam_remittance_batches" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "remittedAt" TIMESTAMP(3),
    "bankReference" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "journalEntryId" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "dtam_remittance_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_reminder_logs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceId" TEXT NOT NULL,
    "reminderType" TEXT NOT NULL,
    "intendedDate" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "payment_reminder_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_documents" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkoutOrderId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "pdfPath" TEXT,
    "signedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "checkout_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "certificateNumber" TEXT NOT NULL,
    "verificationCode" TEXT NOT NULL,
    "qrData" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "farmName" TEXT NOT NULL,
    "applicantName" TEXT NOT NULL,
    "submittedByUserId" TEXT,
    "holderDisplayName" TEXT,
    "holderType" TEXT,
    "cropType" TEXT NOT NULL,
    "farmSize" DOUBLE PRECISION NOT NULL,
    "province" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "subDistrict" TEXT NOT NULL,
    "address" TEXT,
    "standardCode" TEXT,
    "standardId" TEXT NOT NULL,
    "standardName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "issuedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "validityYears" INTEGER NOT NULL DEFAULT 3,
    "issuedBy" TEXT NOT NULL,
    "pdfGenerated" BOOLEAN NOT NULL DEFAULT false,
    "pdfGeneratedAt" TIMESTAMP(3),
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "verificationCount" INTEGER NOT NULL DEFAULT 0,
    "lastDownloadedAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "revokedReason" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "suspendedBy" TEXT,
    "suspendedReason" TEXT,
    "reinstatedAt" TIMESTAMP(3),
    "reinstatedBy" TEXT,
    "renewedCertificateId" TEXT,
    "previousCertificateId" TEXT,
    "revisionNo" INTEGER NOT NULL DEFAULT 1,
    "revisedAt" TIMESTAMP(3),
    "revisedBy" TEXT,
    "revisionReason" TEXT,
    "documentHash" TEXT,
    "signedBy" TEXT,
    "signedAt" TIMESTAMP(3),
    "signature" TEXT,
    "signatureAlgorithm" TEXT,
    "signatureKeyId" TEXT,
    "signaturePublicKey" TEXT,
    "printHistory" JSONB,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,
    "retainUntil" TIMESTAMP(3) NOT NULL DEFAULT (now() + '5 years'::interval),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_revisions" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "certificateId" TEXT NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "documentHash" TEXT,
    "signature" TEXT,
    "signatureAlgorithm" TEXT,
    "signatureKeyId" TEXT,
    "signaturePublicKey" TEXT,
    "signedBy" TEXT,
    "signedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3) NOT NULL,
    "supersededBy" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "reasonText" TEXT,
    "correctedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "certificate_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certification_standards" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameTH" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL DEFAULT 'v2024',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "logoUrl" TEXT,
    "targetMarket" TEXT,

    CONSTRAINT "certification_standards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "standard_requirements" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "standardId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameTH" TEXT NOT NULL,
    "description" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "standard_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplementary_criteria" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "categoryTH" TEXT,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "icon" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "inputType" TEXT NOT NULL DEFAULT 'checkbox',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "supplementary_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correction_rounds" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicationId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "roundNo" INTEGER NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "letterId" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "correction_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correction_submission_versions" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicationId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "roundNo" INTEGER NOT NULL,
    "formDataSnapshot" JSONB NOT NULL,
    "attachmentsSnapshot" JSONB,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "correction_submission_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planting_cycles" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cycleName" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL DEFAULT 1,
    "farmId" TEXT NOT NULL,
    "certificateId" TEXT,
    "plantSpeciesId" TEXT NOT NULL,
    "varietyName" TEXT,
    "plotId" TEXT,
    "plotName" TEXT,
    "plotArea" DOUBLE PRECISION,
    "areaUnit" TEXT NOT NULL DEFAULT 'sqm',
    "startDate" TIMESTAMP(3) NOT NULL,
    "expectedHarvestDate" TIMESTAMP(3),
    "actualHarvestDate" TIMESTAMP(3),
    "seedSource" TEXT,
    "seedQuantity" DOUBLE PRECISION,
    "cultivationType" TEXT NOT NULL DEFAULT 'SELF_GROWN',
    "soilType" TEXT,
    "irrigationType" TEXT,
    "estimatedYield" DOUBLE PRECISION,
    "actualYield" DOUBLE PRECISION,
    "estimatedPlantCount" INTEGER DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "planting_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planting_cycle_plots" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cycleId" TEXT NOT NULL,
    "plotId" TEXT NOT NULL,
    "allocatedAreaSqm" DOUBLE PRECISION NOT NULL,
    "plannedPlantCount" INTEGER NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "planting_cycle_plots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plant_units" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cycleId" TEXT NOT NULL,
    "cyclePlotId" TEXT,
    "batchId" TEXT,
    "code" TEXT NOT NULL,
    "variety" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "qrCode" TEXT,
    "qrUrl" TEXT,
    "printedAt" TIMESTAMP(3),
    "printCount" INTEGER NOT NULL DEFAULT 0,
    "confirmedAt" TIMESTAMP(3),
    "plantedAt" TIMESTAMP(3),
    "harvestedAt" TIMESTAMP(3),
    "soldAt" TIMESTAMP(3),
    "dataLockedAt" TIMESTAMP(3),
    "soldTo" TEXT,
    "soldToName" TEXT,
    "salePrice" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "notes" TEXT,
    "editCount" INTEGER NOT NULL DEFAULT 0,
    "lastEditAt" TIMESTAMP(3),
    "lastEditBy" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "plant_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plant_unit_edit_history" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plantUnitId" TEXT NOT NULL,
    "editedBy" TEXT,
    "editedByIp" TEXT,
    "fieldName" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "plant_unit_edit_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_logs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cycleId" TEXT,
    "plantUnitId" TEXT,
    "logType" TEXT NOT NULL,
    "logDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "photoUrl" TEXT,
    "recordedBy" TEXT,
    "height" DOUBLE PRECISION,
    "leafCount" INTEGER,
    "healthScore" INTEGER,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "care_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cultivation_logs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cycleId" TEXT NOT NULL,
    "logDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scope" TEXT NOT NULL DEFAULT 'CYCLE',
    "logType" TEXT NOT NULL,
    "plotId" TEXT,
    "plantUnitId" TEXT,
    "productName" TEXT,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "method" TEXT,
    "area" DOUBLE PRECISION,
    "temperature" DOUBLE PRECISION,
    "humidity" DOUBLE PRECISION,
    "weather" TEXT,
    "notes" TEXT,
    "photoUrl" TEXT,
    "attachmentIds" JSONB,
    "recordedBy" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "cultivation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_context_switches" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "fromEntityId" TEXT,
    "toEntityId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" VARCHAR(512),
    "source" TEXT NOT NULL DEFAULT 'HEADER',
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "entity_context_switches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_member_permission_grants" (
    "membershipId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "effect" TEXT NOT NULL,
    "reason" TEXT,
    "grantedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "entity_member_permission_grants_pkey" PRIMARY KEY ("membershipId","permission")
);

-- CreateTable
CREATE TABLE "entity_membership_events" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "targetUserId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" VARCHAR(512),
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "entity_membership_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entities" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "slug" TEXT,
    "thaiCitizenId" TEXT,
    "thaiCitizenIdHash" TEXT,
    "thaiCitizenIdHmac" TEXT,
    "juristicId" TEXT,
    "juristicIdHash" TEXT,
    "communityRegNo" TEXT,
    "communityRegNoHash" TEXT,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdBy" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_memberships" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "invitedBy" TEXT,
    "invitedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "entity_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farms" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,
    "entityId" TEXT,
    "farmName" TEXT NOT NULL,
    "farmType" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "subDistrict" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "totalArea" DOUBLE PRECISION NOT NULL,
    "cultivationArea" DOUBLE PRECISION NOT NULL,
    "areaUnit" TEXT NOT NULL DEFAULT 'sqm',
    "cultivationMethod" TEXT NOT NULL,
    "irrigationType" TEXT,
    "soilType" TEXT,
    "waterSource" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "verificationNotes" TEXT,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "landDocuments" JSONB,
    "sanitationInfo" JSONB,
    "siteHistory" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "farms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_analyses" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "farmId" TEXT NOT NULL,
    "analysisDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analysisType" TEXT NOT NULL,
    "previousLandUse" TEXT,
    "yearsOfHistory" INTEGER,
    "hasChemicalHistory" BOOLEAN NOT NULL DEFAULT false,
    "chemicalDetails" TEXT,
    "soilPH" DOUBLE PRECISION,
    "soilOrganic" DOUBLE PRECISION,
    "soilNitrogen" DOUBLE PRECISION,
    "soilPhosphorus" DOUBLE PRECISION,
    "soilPotassium" DOUBLE PRECISION,
    "soilHeavyMetals" JSONB,
    "soilReportUrl" TEXT,
    "waterPH" DOUBLE PRECISION,
    "waterEC" DOUBLE PRECISION,
    "waterColiform" DOUBLE PRECISION,
    "waterHeavyMetals" JSONB,
    "waterReportUrl" TEXT,
    "bufferZoneMeters" INTEGER,
    "nearbyPollution" TEXT,
    "floodRisk" TEXT,
    "riskLevel" TEXT,
    "riskDetails" TEXT,
    "mitigationPlan" TEXT,
    "passedCriteria" BOOLEAN NOT NULL DEFAULT false,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "site_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_records" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "farmId" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "personRole" TEXT,
    "personIdCard" TEXT,
    "trainingTopic" TEXT NOT NULL,
    "trainingType" TEXT NOT NULL,
    "trainingDate" TIMESTAMP(3) NOT NULL,
    "trainingHours" DOUBLE PRECISION,
    "trainingLocation" TEXT,
    "trainedBy" TEXT,
    "organizerName" TEXT,
    "hasCertificate" BOOLEAN NOT NULL DEFAULT false,
    "certificateNo" TEXT,
    "certificateUrl" TEXT,
    "expiryDate" TIMESTAMP(3),
    "preTestScore" DOUBLE PRECISION,
    "postTestScore" DOUBLE PRECISION,
    "passed" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "recordedBy" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "training_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plots" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "farmId" TEXT NOT NULL,
    "plotCode" TEXT,
    "qrIssuedAt" TIMESTAMP(3),
    "qrRevokedAt" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "areaSqm" DOUBLE PRECISION,
    "area" DOUBLE PRECISION NOT NULL,
    "areaUnit" TEXT NOT NULL DEFAULT 'sqm',
    "solarSystem" TEXT NOT NULL DEFAULT 'OUTDOOR',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "plots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "water_sources" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "plotId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "filtrationTypes" JSONB,
    "irrigationType" TEXT,
    "isTested" BOOLEAN NOT NULL DEFAULT false,
    "testDate" TIMESTAMP(3),
    "testResults" JSONB,
    "testDocumentUrl" TEXT,
    "description" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "water_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "growing_media" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cycleId" TEXT NOT NULL,
    "mediumType" TEXT NOT NULL,
    "customType" TEXT,
    "brand" TEXT,
    "supplierName" TEXT,
    "supplierAddress" TEXT,
    "isOrganic" BOOLEAN NOT NULL DEFAULT false,
    "organicCertUrl" TEXT,
    "notes" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "growing_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seed_sources" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cycleId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "supplierName" TEXT,
    "supplierAddress" TEXT,
    "supplierPhone" TEXT,
    "supplierLicense" TEXT,
    "hasCertificate" BOOLEAN NOT NULL DEFAULT false,
    "certificateNo" TEXT,
    "certificateUrl" TEXT,
    "certificateDate" TIMESTAMP(3),
    "isPorPor4Registered" BOOLEAN NOT NULL DEFAULT false,
    "porPor4No" TEXT,
    "porPor4Url" TEXT,
    "varietyName" TEXT,
    "lotNo" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "seed_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fertilizer_records" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cycleId" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "productName" TEXT,
    "registrationNo" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "usageDate" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "applicationMethod" TEXT,
    "npkN" DOUBLE PRECISION,
    "npkP" DOUBLE PRECISION,
    "npkK" DOUBLE PRECISION,
    "purchasedFrom" TEXT,
    "batchNo" TEXT,
    "withholdingDays" INTEGER,
    "productLabelUrl" TEXT,
    "msdsUrl" TEXT,
    "recordedBy" TEXT,
    "notes" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "fertilizer_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "controlled_environments" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "plotId" TEXT NOT NULL,
    "structureType" TEXT NOT NULL,
    "areaSqm" DOUBLE PRECISION,
    "heightM" DOUBLE PRECISION,
    "hasTempControl" BOOLEAN NOT NULL DEFAULT false,
    "tempControlType" TEXT,
    "tempRangeMin" INTEGER,
    "tempRangeMax" INTEGER,
    "targetTemp" INTEGER,
    "hasHumidityControl" BOOLEAN NOT NULL DEFAULT false,
    "humidityRangeMin" INTEGER,
    "humidityRangeMax" INTEGER,
    "targetHumidity" INTEGER,
    "hasLightControl" BOOLEAN NOT NULL DEFAULT false,
    "lightControlType" TEXT,
    "lightHoursPerDay" INTEGER,
    "hasVentilation" BOOLEAN NOT NULL DEFAULT false,
    "ventilationType" TEXT,
    "roofMaterial" TEXT,
    "wallMaterial" TEXT,
    "isGmpCertified" BOOLEAN NOT NULL DEFAULT false,
    "gmpCertificateNo" TEXT,
    "gmpCertUrl" TEXT,
    "photos" JSONB,
    "notes" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "controlled_environments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvest_batches" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "qrCode" TEXT,
    "trackingUrl" TEXT,
    "cycleId" TEXT,
    "farmId" TEXT NOT NULL,
    "plantCode" TEXT,
    "harvestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "freshWeight" DOUBLE PRECISION NOT NULL,
    "dryWeight" DOUBLE PRECISION,
    "lossWeight" DOUBLE PRECISION,
    "moistureContent" DOUBLE PRECISION,
    "qualityGrade" TEXT,
    "isDried" BOOLEAN NOT NULL DEFAULT false,
    "dryingMethod" TEXT,
    "dryingTemp" DOUBLE PRECISION,
    "dryingDuration" INTEGER,
    "qcPassed" BOOLEAN NOT NULL DEFAULT false,
    "qcNotes" TEXT,
    "qcBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "recordedBy" TEXT,
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "harvest_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drying_temperatures" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "farmId" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "humidity" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "recordedBy" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "drying_temperatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drying_humidity" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "farmId" TEXT NOT NULL,
    "humidity" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "recordedBy" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "drying_humidity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drying_dark_rooms" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "farmId" TEXT NOT NULL,
    "lightLevel" DOUBLE PRECISION NOT NULL,
    "darkRoomUsed" BOOLEAN NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "recordedBy" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "drying_dark_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curing_processes" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "farmId" TEXT NOT NULL,
    "cureDuration" INTEGER NOT NULL,
    "curationType" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "curing_processes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packaging_details" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "batchId" TEXT NOT NULL,
    "packageType" TEXT NOT NULL,
    "grade" TEXT,
    "material" TEXT,
    "isFoodGrade" BOOLEAN NOT NULL DEFAULT false,
    "storageTemp" INTEGER,
    "storageHumidity" INTEGER,
    "storageDays" INTEGER,
    "labelText" TEXT,
    "hasQrCode" BOOLEAN NOT NULL DEFAULT false,
    "qrCodeData" TEXT,
    "sealingMethod" TEXT,
    "isTamperProof" BOOLEAN NOT NULL DEFAULT false,
    "photoUrl" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "packaging_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drying_processes" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cycleId" TEXT,
    "batchId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "dryingDays" INTEGER NOT NULL DEFAULT 0,
    "method" TEXT NOT NULL,
    "tempLogs" JSONB,
    "hasDarkRoom" BOOLEAN NOT NULL DEFAULT false,
    "darkRoomHours" INTEGER,
    "moistureContent" DOUBLE PRECISION,
    "isQualityChecked" BOOLEAN NOT NULL DEFAULT false,
    "hasCuring" BOOLEAN NOT NULL DEFAULT false,
    "curingDays" INTEGER,
    "curingContainer" TEXT,
    "location" TEXT,
    "photos" JSONB,
    "performedBy" TEXT,
    "notes" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "drying_processes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "herb_species" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,
    "nameTH" TEXT NOT NULL,
    "nameEN" TEXT,
    "scientificName" TEXT,
    "familyName" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isControlled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "herb_species_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "herb_knowledge_entries" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "herbCode" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "valueNumber" DOUBLE PRECISION,
    "unit" TEXT,
    "source" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "herb_knowledge_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_rules" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "holderType" TEXT,
    "requestType" TEXT,
    "plantCode" TEXT,
    "slotId" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "maxDocumentAgeMonths" INTEGER,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "reason" TEXT,
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "requirement_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_templates" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetGroup" TEXT NOT NULL DEFAULT 'FARMER',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "activatedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "survey_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_questions" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "templateId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "section" TEXT,
    "questionText" TEXT NOT NULL,
    "questionType" TEXT NOT NULL DEFAULT 'TEXT',
    "choices" JSONB,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "survey_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_responses" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "templateId" TEXT NOT NULL,
    "respondentUserId" TEXT,
    "respondentType" TEXT NOT NULL DEFAULT 'FARMER',
    "region" TEXT NOT NULL,
    "province" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_answers" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "valueText" TEXT,
    "valueNumber" DOUBLE PRECISION,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "survey_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expert_interviews" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "intervieweeName" TEXT NOT NULL,
    "intervieweeOrg" TEXT,
    "intervieweeRole" TEXT,
    "interviewDate" TIMESTAMP(3) NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'ONSITE',
    "transcript" TEXT NOT NULL,
    "keyInsights" JSONB,
    "recordedBy" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "expert_interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL DEFAULT 'GENERAL',
    "metadata" JSONB,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configs" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'STRING',
    "description" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "wizard_step_configs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "stepKey" TEXT NOT NULL,
    "titleTH" TEXT NOT NULL,
    "titleEN" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "plantGroups" JSONB NOT NULL DEFAULT '["*"]',
    "validationRules" JSONB,
    "componentName" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "wizard_step_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_templates" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "titleTH" TEXT NOT NULL,
    "titleEN" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredDate" TIMESTAMP(3),
    "htmlTemplate" TEXT NOT NULL,
    "cssOverrides" TEXT,
    "payloadSchema" JSONB,
    "paperSize" TEXT NOT NULL DEFAULT 'A4_LANDSCAPE',
    "orientation" TEXT NOT NULL DEFAULT 'landscape',
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_submissions" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "certificateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "reportMonth" INTEGER NOT NULL,
    "reportYear" INTEGER NOT NULL,
    "formData" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "attachmentUrl" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "report_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sop_documents" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "sopType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "formData" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "sop_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scope_of_works" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "applicationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "standardCode" TEXT NOT NULL DEFAULT 'GACP',
    "inspectionScope" JSONB,
    "estimatedDays" INTEGER NOT NULL DEFAULT 1,
    "assignedAuditorId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "scope_of_works_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_checklists" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "applicationId" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sections" JSONB NOT NULL,
    "completedItems" INTEGER NOT NULL DEFAULT 0,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION,
    "auditorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "submittedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "audit_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_rooms" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "applicationId" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "roomUrl" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'JITSI',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 60,
    "hostId" TEXT NOT NULL,
    "participantIds" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "recordingUrl" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "meeting_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PRIVATE_CERTIFIER',
    "isolationTier" TEXT NOT NULL DEFAULT 'SHARED',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "locale" TEXT NOT NULL DEFAULT 'th-TH',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Bangkok',
    "contactEmail" TEXT,
    "legalName" TEXT,
    "taxId" TEXT,
    "taxIdHash" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,
    "retainUntil" TIMESTAMP(3) NOT NULL DEFAULT (now() + '5 years'::interval),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "priority" TEXT DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open',
    "relatedApplication" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_messages" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticketId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lots" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "packageType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitWeight" DOUBLE PRECISION NOT NULL,
    "totalWeight" DOUBLE PRECISION,
    "qrCode" TEXT NOT NULL,
    "trackingUrl" TEXT,
    "processedAt" TIMESTAMP(3),
    "packagedAt" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "labTestReportUrl" TEXT,
    "thcContent" DOUBLE PRECISION,
    "cbdContent" DOUBLE PRECISION,
    "moistureContent" DOUBLE PRECISION,
    "testStatus" TEXT,
    "destinationType" TEXT,
    "destination" TEXT,
    "shippedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "printedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trace_qr_security" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "qrCode" TEXT,
    "publicUrl" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dataHash" TEXT NOT NULL,
    "previousHash" TEXT,
    "chainHash" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "signatureAlgorithm" TEXT NOT NULL DEFAULT 'RSA-SHA256',
    "timestampData" JSONB,
    "keyFingerprint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "trace_qr_security_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trace_qr_scans" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qrSecurityId" TEXT NOT NULL,
    "requestIp" TEXT,
    "userAgent" TEXT,
    "requestPath" TEXT,
    "verification" JSONB,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "trace_qr_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumer_feedback" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "certificateId" TEXT,
    "rating" INTEGER NOT NULL,
    "feedback" TEXT NOT NULL,
    "contact" TEXT,
    "productName" TEXT,
    "batchNumber" TEXT,
    "farmName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "consumer_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plant_species" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,
    "nameTH" TEXT NOT NULL,
    "nameEN" TEXT,
    "scientificName" TEXT,
    "familyName" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "group" TEXT NOT NULL DEFAULT 'GENERAL',
    "requiresLicense" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "maxYieldPerPlant" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "standardSpacing" TEXT,
    "units" JSONB,
    "plantParts" JSONB,
    "securityRequirements" JSONB,
    "productionInputs" JSONB,
    "gacpCategory" TEXT,
    "dtamPlantCode" TEXT,
    "cultivationType" TEXT DEFAULT 'SELF_GROWN',
    "harvestCycle" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "plant_species_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_requirements" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "plantCode" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "documentName" TEXT NOT NULL,
    "documentNameTH" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "allowedFileTypes" JSONB,
    "maxFileSizeMB" INTEGER NOT NULL DEFAULT 10,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_access_logs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partnerId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "code" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "status" INTEGER,
    "ip" TEXT,

    CONSTRAINT "partner_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_groups" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,
    "titleTH" TEXT NOT NULL,
    "titleEN" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "role_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_group_memberships" (
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "user_group_memberships_pkey" PRIMARY KEY ("userId","groupId")
);

-- CreateTable
CREATE TABLE "user_permission_grants" (
    "userId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "effect" TEXT NOT NULL,
    "reason" TEXT,
    "grantedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "user_permission_grants_pkey" PRIMARY KEY ("userId","permission")
);

-- CreateTable
CREATE TABLE "waiver_reopen_requests" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requesterRole" TEXT NOT NULL,
    "expiredFromState" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL DEFAULT 'LENIENCY',
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "approverSide" TEXT,
    "decisionNote" TEXT,

    CONSTRAINT "waiver_reopen_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_activities" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "applicationId" TEXT NOT NULL,
    "workType" TEXT NOT NULL,
    "candidateGroup" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'TODO',
    "assignedUserId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "dueAt" TIMESTAMP(3),
    "warningAt" TIMESTAMP(3),
    "warnedAt" TIMESTAMP(3),
    "breachedAt" TIMESTAMP(3),
    "triggeredAtStage" TEXT NOT NULL,
    "note" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "work_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_activity_configs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workflowStage" TEXT NOT NULL,
    "workType" TEXT NOT NULL,
    "candidateGroup" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "labelTH" TEXT NOT NULL,
    "labelEN" TEXT NOT NULL,
    "descriptionTH" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "stage_activity_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_policies" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workType" TEXT NOT NULL,
    "targetHours" INTEGER NOT NULL,
    "warningHours" INTEGER,
    "escalationHours" INTEGER,
    "labelTH" TEXT NOT NULL,
    "labelEN" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_ledger_entries" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "assigneeUserId" TEXT NOT NULL,
    "assignedByUserId" TEXT,
    "role" TEXT,
    "previousAssigneeUserId" TEXT,
    "source" TEXT,
    "reason" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "assignment_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "application_documents_applicationId_idx" ON "application_documents"("applicationId");

-- CreateIndex
CREATE INDEX "application_documents_documentType_idx" ON "application_documents"("documentType");

-- CreateIndex
CREATE INDEX "application_documents_idNumber_idx" ON "application_documents"("idNumber");

-- CreateIndex
CREATE INDEX "application_documents_photoHash_idx" ON "application_documents"("photoHash");

-- CreateIndex
CREATE UNIQUE INDEX "application_documents_applicationId_currentForSlot_key" ON "application_documents"("applicationId", "currentForSlot");

-- CreateIndex
CREATE UNIQUE INDEX "applications_uuid_key" ON "applications"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "applications_applicationNumber_key" ON "applications"("applicationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "applications_phase1InvoiceId_key" ON "applications"("phase1InvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "applications_phase1SlipId_key" ON "applications"("phase1SlipId");

-- CreateIndex
CREATE UNIQUE INDEX "applications_phase2InvoiceId_key" ON "applications"("phase2InvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "applications_phase2SlipId_key" ON "applications"("phase2SlipId");

-- CreateIndex
CREATE UNIQUE INDEX "applications_idempotencyKey_key" ON "applications"("idempotencyKey");

-- CreateIndex
CREATE INDEX "applications_healthId_idx" ON "applications"("healthId");

-- CreateIndex
CREATE INDEX "applications_entityId_idx" ON "applications"("entityId");

-- CreateIndex
CREATE INDEX "applications_submitterId_idx" ON "applications"("submitterId");

-- CreateIndex
CREATE INDEX "applications_bundleId_idx" ON "applications"("bundleId");

-- CreateIndex
CREATE INDEX "applications_status_idx" ON "applications"("status");

-- CreateIndex
CREATE INDEX "applications_applicationNumber_idx" ON "applications"("applicationNumber");

-- CreateIndex
CREATE INDEX "applications_reviewerId_idx" ON "applications"("reviewerId");

-- CreateIndex
CREATE INDEX "applications_headAuditorId_idx" ON "applications"("headAuditorId");

-- CreateIndex
CREATE INDEX "applications_schedulerId_idx" ON "applications"("schedulerId");

-- CreateIndex
CREATE INDEX "applications_auditorId_idx" ON "applications"("auditorId");

-- CreateIndex
CREATE INDEX "applications_organizationId_idx" ON "applications"("organizationId");

-- CreateIndex
CREATE INDEX "applications_rejectCount_idx" ON "applications"("rejectCount");

-- CreateIndex
CREATE INDEX "applications_closedReason_idx" ON "applications"("closedReason");

-- CreateIndex
CREATE INDEX "applications_status_isDeleted_idx" ON "applications"("status", "isDeleted");

-- CreateIndex
CREATE INDEX "applications_healthId_isDeleted_status_idx" ON "applications"("healthId", "isDeleted", "status");

-- CreateIndex
CREATE INDEX "applications_workflowHistory_gin_idx" ON "applications" USING GIN ("workflowHistory");

-- CreateIndex
CREATE INDEX "applications_standardCode_idx" ON "applications"("standardCode");

-- CreateIndex
CREATE INDEX "application_comments_applicationId_idx" ON "application_comments"("applicationId");

-- CreateIndex
CREATE INDEX "application_comments_authorId_idx" ON "application_comments"("authorId");

-- CreateIndex
CREATE INDEX "application_comments_isDeleted_idx" ON "application_comments"("isDeleted");

-- CreateIndex
CREATE INDEX "application_comments_organizationId_idx" ON "application_comments"("organizationId");

-- CreateIndex
CREATE INDEX "application_drafts_userId_idx" ON "application_drafts"("userId");

-- CreateIndex
CREATE INDEX "application_drafts_isDeleted_idx" ON "application_drafts"("isDeleted");

-- CreateIndex
CREATE INDEX "application_drafts_organizationId_idx" ON "application_drafts"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "application_drafts_userId_status_key" ON "application_drafts"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "application_bundles_bundleNumber_key" ON "application_bundles"("bundleNumber");

-- CreateIndex
CREATE INDEX "application_bundles_healthId_idx" ON "application_bundles"("healthId");

-- CreateIndex
CREATE INDEX "application_bundles_isDeleted_idx" ON "application_bundles"("isDeleted");

-- CreateIndex
CREATE INDEX "application_bundles_organizationId_idx" ON "application_bundles"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_uuid_key" ON "attachments"("uuid");

-- CreateIndex
CREATE INDEX "attachments_resModel_resId_idx" ON "attachments"("resModel", "resId");

-- CreateIndex
CREATE INDEX "attachments_resModel_resId_field_idx" ON "attachments"("resModel", "resId", "field");

-- CreateIndex
CREATE INDEX "attachments_uploadedBy_idx" ON "attachments"("uploadedBy");

-- CreateIndex
CREATE INDEX "attachments_fileHash_idx" ON "attachments"("fileHash");

-- CreateIndex
CREATE INDEX "attachments_isDeleted_idx" ON "attachments"("isDeleted");

-- CreateIndex
CREATE INDEX "attachments_organizationId_idx" ON "attachments"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "farm_audit_checklist_items_auditId_itemCode_key" ON "farm_audit_checklist_items"("auditId", "itemCode");

-- CreateIndex
CREATE INDEX "farm_audit_photos_auditId_idx" ON "farm_audit_photos"("auditId");

-- CreateIndex
CREATE INDEX "farm_audit_photos_organizationId_idx" ON "farm_audit_photos"("organizationId");

-- CreateIndex
CREATE INDEX "farm_audit_photos_attachmentId_idx" ON "farm_audit_photos"("attachmentId");

-- CreateIndex
CREATE INDEX "farm_audit_photos_checklistItemId_idx" ON "farm_audit_photos"("checklistItemId");

-- CreateIndex
CREATE INDEX "farm_audit_photos_uploadedBy_idx" ON "farm_audit_photos"("uploadedBy");

-- CreateIndex
CREATE INDEX "gps_verification_logs_entityType_entityId_idx" ON "gps_verification_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "gps_verification_logs_organizationId_idx" ON "gps_verification_logs"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_logId_key" ON "audit_logs"("logId");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_currentHash_key" ON "audit_logs"("currentHash");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_resourceType_resourceId_idx" ON "audit_logs"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_category_severity_idx" ON "audit_logs"("category", "severity");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_metadata_idx" ON "audit_logs" USING GIN ("metadata");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_idx" ON "audit_logs"("organizationId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_resourceType_resourceId_createdAt_idx" ON "audit_logs"("resourceType", "resourceId", "timestamp" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_organizationId_sequenceNumber_key" ON "audit_logs"("organizationId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "post_audit_tasks_applicationId_idx" ON "post_audit_tasks"("applicationId");

-- CreateIndex
CREATE INDEX "post_audit_tasks_status_idx" ON "post_audit_tasks"("status");

-- CreateIndex
CREATE INDEX "post_audit_tasks_dueDate_idx" ON "post_audit_tasks"("dueDate");

-- CreateIndex
CREATE INDEX "post_audit_tasks_organizationId_idx" ON "post_audit_tasks"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "revision_deadlines_applicationId_key" ON "revision_deadlines"("applicationId");

-- CreateIndex
CREATE INDEX "revision_deadlines_applicationId_idx" ON "revision_deadlines"("applicationId");

-- CreateIndex
CREATE INDEX "revision_deadlines_status_idx" ON "revision_deadlines"("status");

-- CreateIndex
CREATE INDEX "revision_deadlines_revisionDue_idx" ON "revision_deadlines"("revisionDue");

-- CreateIndex
CREATE INDEX "revision_deadlines_organizationId_idx" ON "revision_deadlines"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "users_uuid_key" ON "users"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_healthIdHash_key" ON "users"("healthIdHash");

-- CreateIndex
CREATE UNIQUE INDEX "users_healthIdHmac_key" ON "users"("healthIdHmac");

-- CreateIndex
CREATE UNIQUE INDEX "users_providerIdHash_key" ON "users"("providerIdHash");

-- CreateIndex
CREATE UNIQUE INDEX "users_providerIdHmac_key" ON "users"("providerIdHmac");

-- CreateIndex
CREATE UNIQUE INDEX "users_canonicalId_key" ON "users"("canonicalId");

-- CreateIndex
CREATE UNIQUE INDEX "users_idCardHash_deprecated_key" ON "users"("idCardHash_deprecated");

-- CreateIndex
CREATE UNIQUE INDEX "users_idCardHmac_key" ON "users"("idCardHmac");

-- CreateIndex
CREATE UNIQUE INDEX "users_taxIdHash_key" ON "users"("taxIdHash");

-- CreateIndex
CREATE UNIQUE INDEX "users_taxIdHmac_key" ON "users"("taxIdHmac");

-- CreateIndex
CREATE UNIQUE INDEX "users_communityRegistrationNoHash_key" ON "users"("communityRegistrationNoHash");

-- CreateIndex
CREATE UNIQUE INDEX "users_communityRegistrationNoHmac_key" ON "users"("communityRegistrationNoHmac");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_healthId_idx" ON "users"("healthId");

-- CreateIndex
CREATE INDEX "users_providerId_idx" ON "users"("providerId");

-- CreateIndex
CREATE INDEX "users_canonicalId_idx" ON "users"("canonicalId");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE INDEX "users_accountType_idx" ON "users"("accountType");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE INDEX "user_consents_userId_idx" ON "user_consents"("userId");

-- CreateIndex
CREATE INDEX "user_consents_category_idx" ON "user_consents"("category");

-- CreateIndex
CREATE INDEX "user_consents_granted_idx" ON "user_consents"("granted");

-- CreateIndex
CREATE INDEX "user_consents_organizationId_idx" ON "user_consents"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "user_consents_userId_category_key" ON "user_consents"("userId", "category");

-- CreateIndex
CREATE INDEX "identity_links_userId_idx" ON "identity_links"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "identity_links_provider_subject_key" ON "identity_links"("provider", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_uuid_key" ON "invoices"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_receiptNumber_key" ON "invoices"("receiptNumber");

-- CreateIndex
CREATE INDEX "invoices_applicationId_idx" ON "invoices"("applicationId");

-- CreateIndex
CREATE INDEX "invoices_healthId_idx" ON "invoices"("healthId");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_invoiceNumber_idx" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "invoices_isDeleted_idx" ON "invoices"("isDeleted");

-- CreateIndex
CREATE INDEX "invoices_organizationId_idx" ON "invoices"("organizationId");

-- CreateIndex
CREATE INDEX "invoices_paymentTransactionId_idx" ON "invoices"("paymentTransactionId");

-- CreateIndex
CREATE INDEX "invoices_quoteId_idx" ON "invoices"("quoteId");

-- CreateIndex
CREATE INDEX "invoices_subscriptionId_idx" ON "invoices"("subscriptionId");

-- CreateIndex
CREATE INDEX "invoice_line_items_invoiceId_idx" ON "invoice_line_items"("invoiceId");

-- CreateIndex
CREATE INDEX "invoice_line_items_organizationId_idx" ON "invoice_line_items"("organizationId");

-- CreateIndex
CREATE INDEX "subscriptions_organizationId_status_idx" ON "subscriptions"("organizationId", "status");

-- CreateIndex
CREATE INDEX "subscriptions_endDate_idx" ON "subscriptions"("endDate");

-- CreateIndex
CREATE INDEX "subscriptions_isDeleted_idx" ON "subscriptions"("isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_uuid_key" ON "quotes"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_quoteNumber_key" ON "quotes"("quoteNumber");

-- CreateIndex
CREATE INDEX "quotes_applicationId_idx" ON "quotes"("applicationId");

-- CreateIndex
CREATE INDEX "quotes_status_idx" ON "quotes"("status");

-- CreateIndex
CREATE INDEX "quotes_isDeleted_idx" ON "quotes"("isDeleted");

-- CreateIndex
CREATE INDEX "quotes_organizationId_idx" ON "quotes"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_gatewayRef_key" ON "payment_transactions"("gatewayRef");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_idempotencyKey_key" ON "payment_transactions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payment_transactions_applicationId_idx" ON "payment_transactions"("applicationId");

-- CreateIndex
CREATE INDEX "payment_transactions_status_idx" ON "payment_transactions"("status");

-- CreateIndex
CREATE INDEX "payment_transactions_gatewayRef_idx" ON "payment_transactions"("gatewayRef");

-- CreateIndex
CREATE INDEX "payment_transactions_createdAt_idx" ON "payment_transactions"("createdAt");

-- CreateIndex
CREATE INDEX "payment_transactions_organizationId_idx" ON "payment_transactions"("organizationId");

-- CreateIndex
CREATE INDEX "bank_accounts_organizationId_isActive_defaultForPhase_effec_idx" ON "bank_accounts"("organizationId", "isActive", "defaultForPhase", "effectiveFrom", "effectiveUntil");

-- CreateIndex
CREATE INDEX "bank_accounts_organizationId_isActive_idx" ON "bank_accounts"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "bank_accounts_organizationId_issuerType_isActive_idx" ON "bank_accounts"("organizationId", "issuerType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_organizationId_bankCode_accountNumber_key" ON "bank_accounts"("organizationId", "bankCode", "accountNumber");

-- CreateIndex
CREATE INDEX "payment_slips_applicationId_phase_status_idx" ON "payment_slips"("applicationId", "phase", "status");

-- CreateIndex
CREATE INDEX "payment_slips_status_createdAt_idx" ON "payment_slips"("status", "createdAt");

-- CreateIndex
CREATE INDEX "payment_slips_organizationId_status_idx" ON "payment_slips"("organizationId", "status");

-- CreateIndex
CREATE INDEX "payment_slips_invoiceId_idx" ON "payment_slips"("invoiceId");

-- CreateIndex
CREATE INDEX "payment_slips_bankAccountId_idx" ON "payment_slips"("bankAccountId");

-- CreateIndex
CREATE INDEX "payment_slips_subscriptionId_idx" ON "payment_slips"("subscriptionId");

-- CreateIndex
CREATE INDEX "journal_entries_entryDate_idx" ON "journal_entries"("entryDate");

-- CreateIndex
CREATE INDEX "journal_entries_reference_idx" ON "journal_entries"("reference");

-- CreateIndex
CREATE INDEX "journal_entries_invoiceId_idx" ON "journal_entries"("invoiceId");

-- CreateIndex
CREATE INDEX "journal_entries_organizationId_idx" ON "journal_entries"("organizationId");

-- CreateIndex
CREATE INDEX "journal_lines_entryId_idx" ON "journal_lines"("entryId");

-- CreateIndex
CREATE INDEX "journal_lines_accountCode_idx" ON "journal_lines"("accountCode");

-- CreateIndex
CREATE INDEX "receipt_sequences_prefix_idx" ON "receipt_sequences"("prefix");

-- CreateIndex
CREATE INDEX "receipt_sequences_issuerType_documentType_idx" ON "receipt_sequences"("issuerType", "documentType");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_sequences_prefix_year_key" ON "receipt_sequences"("prefix", "year");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_sequences_issuer_doc_be_ad_key" ON "receipt_sequences"("issuerType", "documentType", "yearBE", "yearAD");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_quotationNumber_key" ON "quotations"("quotationNumber");

-- CreateIndex
CREATE INDEX "quotations_applicationId_issuerType_idx" ON "quotations"("applicationId", "issuerType");

-- CreateIndex
CREATE INDEX "quotations_status_idx" ON "quotations"("status");

-- CreateIndex
CREATE INDEX "quotations_organizationId_idx" ON "quotations"("organizationId");

-- CreateIndex
CREATE INDEX "quotations_isDeleted_idx" ON "quotations"("isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_creditNoteNumber_key" ON "credit_notes"("creditNoteNumber");

-- CreateIndex
CREATE INDEX "credit_notes_originalInvoiceId_idx" ON "credit_notes"("originalInvoiceId");

-- CreateIndex
CREATE INDEX "credit_notes_status_idx" ON "credit_notes"("status");

-- CreateIndex
CREATE INDEX "credit_notes_organizationId_idx" ON "credit_notes"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "debit_notes_debitNoteNumber_key" ON "debit_notes"("debitNoteNumber");

-- CreateIndex
CREATE INDEX "debit_notes_originalInvoiceId_idx" ON "debit_notes"("originalInvoiceId");

-- CreateIndex
CREATE INDEX "debit_notes_status_idx" ON "debit_notes"("status");

-- CreateIndex
CREATE INDEX "debit_notes_organizationId_idx" ON "debit_notes"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "manual_journal_entry_drafts_draftNumber_key" ON "manual_journal_entry_drafts"("draftNumber");

-- CreateIndex
CREATE INDEX "manual_journal_entry_drafts_status_idx" ON "manual_journal_entry_drafts"("status");

-- CreateIndex
CREATE INDEX "manual_journal_entry_drafts_organizationId_idx" ON "manual_journal_entry_drafts"("organizationId");

-- CreateIndex
CREATE INDEX "manual_journal_entry_drafts_createdBy_idx" ON "manual_journal_entry_drafts"("createdBy");

-- CreateIndex
CREATE INDEX "manual_journal_entry_drafts_postingDate_idx" ON "manual_journal_entry_drafts"("postingDate");

-- CreateIndex
CREATE INDEX "period_closes_organizationId_idx" ON "period_closes"("organizationId");

-- CreateIndex
CREATE INDEX "period_closes_year_month_idx" ON "period_closes"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "period_closes_organizationId_year_month_key" ON "period_closes"("organizationId", "year", "month");

-- CreateIndex
CREATE INDEX "purchase_invoices_invoiceDate_idx" ON "purchase_invoices"("invoiceDate");

-- CreateIndex
CREATE INDEX "purchase_invoices_status_idx" ON "purchase_invoices"("status");

-- CreateIndex
CREATE INDEX "purchase_invoices_organizationId_idx" ON "purchase_invoices"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_supplier_tax_hmac_invnum_key" ON "purchase_invoices"("supplierTaxIdHmac", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_orders_stripe_payment_intent_id_key" ON "checkout_orders"("stripe_payment_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_orders_invoiceId_key" ON "checkout_orders"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_orders_paymentTransactionId_key" ON "checkout_orders"("paymentTransactionId");

-- CreateIndex
CREATE INDEX "checkout_orders_applicationId_idx" ON "checkout_orders"("applicationId");

-- CreateIndex
CREATE INDEX "checkout_orders_quotation_id_idx" ON "checkout_orders"("quotation_id");

-- CreateIndex
CREATE INDEX "checkout_orders_status_idx" ON "checkout_orders"("status");

-- CreateIndex
CREATE INDEX "checkout_orders_dtam_remittance_status_idx" ON "checkout_orders"("dtam_remittance_status");

-- CreateIndex
CREATE INDEX "checkout_orders_remittanceBatchId_idx" ON "checkout_orders"("remittanceBatchId");

-- CreateIndex
CREATE INDEX "checkout_orders_organizationId_idx" ON "checkout_orders"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "dtam_remittance_batches_batchNumber_key" ON "dtam_remittance_batches"("batchNumber");

-- CreateIndex
CREATE INDEX "dtam_remittance_batches_status_idx" ON "dtam_remittance_batches"("status");

-- CreateIndex
CREATE INDEX "dtam_remittance_batches_organizationId_idx" ON "dtam_remittance_batches"("organizationId");

-- CreateIndex
CREATE INDEX "stripe_webhook_events_type_idx" ON "stripe_webhook_events"("type");

-- CreateIndex
CREATE INDEX "stripe_webhook_events_receivedAt_idx" ON "stripe_webhook_events"("receivedAt");

-- CreateIndex
CREATE INDEX "stripe_webhook_events_status_nextRetryAt_idx" ON "stripe_webhook_events"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "payment_reminder_logs_invoiceId_idx" ON "payment_reminder_logs"("invoiceId");

-- CreateIndex
CREATE INDEX "payment_reminder_logs_organizationId_idx" ON "payment_reminder_logs"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_reminder_logs_invoiceId_reminderType_intendedDate_key" ON "payment_reminder_logs"("invoiceId", "reminderType", "intendedDate");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_documents_documentNumber_key" ON "checkout_documents"("documentNumber");

-- CreateIndex
CREATE INDEX "checkout_documents_organizationId_idx" ON "checkout_documents"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_documents_checkoutOrderId_documentType_key" ON "checkout_documents"("checkoutOrderId", "documentType");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_uuid_key" ON "certificates"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_certificateNumber_key" ON "certificates"("certificateNumber");

-- CreateIndex
CREATE INDEX "certificates_userId_idx" ON "certificates"("userId");

-- CreateIndex
CREATE INDEX "certificates_status_idx" ON "certificates"("status");

-- CreateIndex
CREATE INDEX "certificates_certificateNumber_idx" ON "certificates"("certificateNumber");

-- CreateIndex
CREATE INDEX "certificates_expiryDate_idx" ON "certificates"("expiryDate");

-- CreateIndex
CREATE INDEX "certificates_isDeleted_idx" ON "certificates"("isDeleted");

-- CreateIndex
CREATE INDEX "certificates_organizationId_idx" ON "certificates"("organizationId");

-- CreateIndex
CREATE INDEX "certificates_applicationId_idx" ON "certificates"("applicationId");

-- CreateIndex
CREATE INDEX "certificates_farmId_idx" ON "certificates"("farmId");

-- CreateIndex
CREATE INDEX "certificates_standardCode_idx" ON "certificates"("standardCode");

-- CreateIndex
CREATE INDEX "certificate_revisions_certificateId_idx" ON "certificate_revisions"("certificateId");

-- CreateIndex
CREATE INDEX "certificate_revisions_organizationId_idx" ON "certificate_revisions"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_revisions_certificateId_revisionNo_key" ON "certificate_revisions"("certificateId", "revisionNo");

-- CreateIndex
CREATE UNIQUE INDEX "certification_standards_code_key" ON "certification_standards"("code");

-- CreateIndex
CREATE INDEX "certification_standards_code_idx" ON "certification_standards"("code");

-- CreateIndex
CREATE INDEX "certification_standards_isActive_idx" ON "certification_standards"("isActive");

-- CreateIndex
CREATE INDEX "standard_requirements_standardId_idx" ON "standard_requirements"("standardId");

-- CreateIndex
CREATE INDEX "standard_requirements_category_idx" ON "standard_requirements"("category");

-- CreateIndex
CREATE UNIQUE INDEX "supplementary_criteria_code_key" ON "supplementary_criteria"("code");

-- CreateIndex
CREATE INDEX "supplementary_criteria_category_idx" ON "supplementary_criteria"("category");

-- CreateIndex
CREATE INDEX "supplementary_criteria_isActive_idx" ON "supplementary_criteria"("isActive");

-- CreateIndex
CREATE INDEX "supplementary_criteria_sortOrder_idx" ON "supplementary_criteria"("sortOrder");

-- CreateIndex
CREATE INDEX "correction_rounds_applicationId_stage_idx" ON "correction_rounds"("applicationId", "stage");

-- CreateIndex
CREATE INDEX "correction_rounds_organizationId_idx" ON "correction_rounds"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "correction_rounds_applicationId_stage_roundNo_key" ON "correction_rounds"("applicationId", "stage", "roundNo");

-- CreateIndex
CREATE INDEX "correction_submission_versions_applicationId_stage_idx" ON "correction_submission_versions"("applicationId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "correction_submission_versions_applicationId_stage_roundNo_key" ON "correction_submission_versions"("applicationId", "stage", "roundNo");

-- CreateIndex
CREATE UNIQUE INDEX "planting_cycles_uuid_key" ON "planting_cycles"("uuid");

-- CreateIndex
CREATE INDEX "planting_cycles_farmId_idx" ON "planting_cycles"("farmId");

-- CreateIndex
CREATE INDEX "planting_cycles_certificateId_idx" ON "planting_cycles"("certificateId");

-- CreateIndex
CREATE INDEX "planting_cycles_status_idx" ON "planting_cycles"("status");

-- CreateIndex
CREATE INDEX "planting_cycles_isDeleted_idx" ON "planting_cycles"("isDeleted");

-- CreateIndex
CREATE INDEX "planting_cycles_organizationId_idx" ON "planting_cycles"("organizationId");

-- CreateIndex
CREATE INDEX "planting_cycles_plantSpeciesId_idx" ON "planting_cycles"("plantSpeciesId");

-- CreateIndex
CREATE INDEX "planting_cycles_plotId_idx" ON "planting_cycles"("plotId");

-- CreateIndex
CREATE INDEX "planting_cycle_plots_cycleId_idx" ON "planting_cycle_plots"("cycleId");

-- CreateIndex
CREATE INDEX "planting_cycle_plots_plotId_idx" ON "planting_cycle_plots"("plotId");

-- CreateIndex
CREATE INDEX "planting_cycle_plots_organizationId_idx" ON "planting_cycle_plots"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "planting_cycle_plots_cycleId_plotId_key" ON "planting_cycle_plots"("cycleId", "plotId");

-- CreateIndex
CREATE UNIQUE INDEX "plant_units_qrCode_key" ON "plant_units"("qrCode");

-- CreateIndex
CREATE INDEX "plant_units_cycleId_idx" ON "plant_units"("cycleId");

-- CreateIndex
CREATE INDEX "plant_units_cyclePlotId_idx" ON "plant_units"("cyclePlotId");

-- CreateIndex
CREATE INDEX "plant_units_batchId_idx" ON "plant_units"("batchId");

-- CreateIndex
CREATE INDEX "plant_units_qrCode_idx" ON "plant_units"("qrCode");

-- CreateIndex
CREATE INDEX "plant_units_status_idx" ON "plant_units"("status");

-- CreateIndex
CREATE INDEX "plant_units_variety_idx" ON "plant_units"("variety");

-- CreateIndex
CREATE INDEX "plant_units_organizationId_idx" ON "plant_units"("organizationId");

-- CreateIndex
CREATE INDEX "plant_unit_edit_history_plantUnitId_idx" ON "plant_unit_edit_history"("plantUnitId");

-- CreateIndex
CREATE INDEX "plant_unit_edit_history_createdAt_idx" ON "plant_unit_edit_history"("createdAt");

-- CreateIndex
CREATE INDEX "plant_unit_edit_history_organizationId_idx" ON "plant_unit_edit_history"("organizationId");

-- CreateIndex
CREATE INDEX "care_logs_cycleId_idx" ON "care_logs"("cycleId");

-- CreateIndex
CREATE INDEX "care_logs_plantUnitId_idx" ON "care_logs"("plantUnitId");

-- CreateIndex
CREATE INDEX "care_logs_logType_idx" ON "care_logs"("logType");

-- CreateIndex
CREATE INDEX "care_logs_logDate_idx" ON "care_logs"("logDate");

-- CreateIndex
CREATE INDEX "care_logs_organizationId_idx" ON "care_logs"("organizationId");

-- CreateIndex
CREATE INDEX "cultivation_logs_cycleId_idx" ON "cultivation_logs"("cycleId");

-- CreateIndex
CREATE INDEX "cultivation_logs_logDate_idx" ON "cultivation_logs"("logDate");

-- CreateIndex
CREATE INDEX "cultivation_logs_logType_idx" ON "cultivation_logs"("logType");

-- CreateIndex
CREATE INDEX "cultivation_logs_scope_idx" ON "cultivation_logs"("scope");

-- CreateIndex
CREATE INDEX "cultivation_logs_plotId_idx" ON "cultivation_logs"("plotId");

-- CreateIndex
CREATE INDEX "cultivation_logs_plantUnitId_idx" ON "cultivation_logs"("plantUnitId");

-- CreateIndex
CREATE INDEX "cultivation_logs_organizationId_idx" ON "cultivation_logs"("organizationId");

-- CreateIndex
CREATE INDEX "entity_context_switches_userId_createdAt_idx" ON "entity_context_switches"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "entity_context_switches_toEntityId_idx" ON "entity_context_switches"("toEntityId");

-- CreateIndex
CREATE INDEX "entity_context_switches_organizationId_idx" ON "entity_context_switches"("organizationId");

-- CreateIndex
CREATE INDEX "entity_context_switches_fromEntityId_idx" ON "entity_context_switches"("fromEntityId");

-- CreateIndex
CREATE INDEX "entity_member_permission_grants_membershipId_idx" ON "entity_member_permission_grants"("membershipId");

-- CreateIndex
CREATE INDEX "entity_member_permission_grants_organizationId_idx" ON "entity_member_permission_grants"("organizationId");

-- CreateIndex
CREATE INDEX "entity_membership_events_entityId_createdAt_idx" ON "entity_membership_events"("entityId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "entity_membership_events_actorUserId_idx" ON "entity_membership_events"("actorUserId");

-- CreateIndex
CREATE INDEX "entity_membership_events_targetUserId_idx" ON "entity_membership_events"("targetUserId");

-- CreateIndex
CREATE INDEX "entity_membership_events_eventType_idx" ON "entity_membership_events"("eventType");

-- CreateIndex
CREATE INDEX "entity_membership_events_organizationId_idx" ON "entity_membership_events"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "entities_uuid_key" ON "entities"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "entities_slug_key" ON "entities"("slug");

-- CreateIndex
CREATE INDEX "entities_organizationId_idx" ON "entities"("organizationId");

-- CreateIndex
CREATE INDEX "entities_type_idx" ON "entities"("type");

-- CreateIndex
CREATE INDEX "entities_status_idx" ON "entities"("status");

-- CreateIndex
CREATE UNIQUE INDEX "entities_type_thaiCitizenIdHmac_key" ON "entities"("type", "thaiCitizenIdHmac");

-- CreateIndex
CREATE UNIQUE INDEX "entities_type_juristicIdHash_key" ON "entities"("type", "juristicIdHash");

-- CreateIndex
CREATE UNIQUE INDEX "entities_type_communityRegNoHash_key" ON "entities"("type", "communityRegNoHash");

-- CreateIndex
CREATE INDEX "entity_memberships_entityId_idx" ON "entity_memberships"("entityId");

-- CreateIndex
CREATE INDEX "entity_memberships_userId_idx" ON "entity_memberships"("userId");

-- CreateIndex
CREATE INDEX "entity_memberships_status_idx" ON "entity_memberships"("status");

-- CreateIndex
CREATE INDEX "entity_memberships_organizationId_idx" ON "entity_memberships"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "entity_memberships_userId_entityId_key" ON "entity_memberships"("userId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "farms_uuid_key" ON "farms"("uuid");

-- CreateIndex
CREATE INDEX "farms_ownerId_idx" ON "farms"("ownerId");

-- CreateIndex
CREATE INDEX "farms_entityId_idx" ON "farms"("entityId");

-- CreateIndex
CREATE INDEX "farms_status_idx" ON "farms"("status");

-- CreateIndex
CREATE INDEX "farms_province_idx" ON "farms"("province");

-- CreateIndex
CREATE INDEX "farms_isDeleted_idx" ON "farms"("isDeleted");

-- CreateIndex
CREATE INDEX "farms_organizationId_idx" ON "farms"("organizationId");

-- CreateIndex
CREATE INDEX "site_analyses_farmId_idx" ON "site_analyses"("farmId");

-- CreateIndex
CREATE INDEX "site_analyses_analysisDate_idx" ON "site_analyses"("analysisDate");

-- CreateIndex
CREATE INDEX "site_analyses_organizationId_idx" ON "site_analyses"("organizationId");

-- CreateIndex
CREATE INDEX "training_records_farmId_idx" ON "training_records"("farmId");

-- CreateIndex
CREATE INDEX "training_records_trainingDate_idx" ON "training_records"("trainingDate");

-- CreateIndex
CREATE INDEX "training_records_trainingType_idx" ON "training_records"("trainingType");

-- CreateIndex
CREATE INDEX "training_records_organizationId_idx" ON "training_records"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "plots_plotCode_key" ON "plots"("plotCode");

-- CreateIndex
CREATE INDEX "plots_farmId_idx" ON "plots"("farmId");

-- CreateIndex
CREATE INDEX "plots_organizationId_idx" ON "plots"("organizationId");

-- CreateIndex
CREATE INDEX "water_sources_plotId_idx" ON "water_sources"("plotId");

-- CreateIndex
CREATE INDEX "water_sources_organizationId_idx" ON "water_sources"("organizationId");

-- CreateIndex
CREATE INDEX "growing_media_cycleId_idx" ON "growing_media"("cycleId");

-- CreateIndex
CREATE INDEX "growing_media_organizationId_idx" ON "growing_media"("organizationId");

-- CreateIndex
CREATE INDEX "seed_sources_cycleId_idx" ON "seed_sources"("cycleId");

-- CreateIndex
CREATE INDEX "seed_sources_certificateNo_idx" ON "seed_sources"("certificateNo");

-- CreateIndex
CREATE INDEX "seed_sources_porPor4No_idx" ON "seed_sources"("porPor4No");

-- CreateIndex
CREATE INDEX "seed_sources_organizationId_idx" ON "seed_sources"("organizationId");

-- CreateIndex
CREATE INDEX "fertilizer_records_cycleId_idx" ON "fertilizer_records"("cycleId");

-- CreateIndex
CREATE INDEX "fertilizer_records_registrationNo_idx" ON "fertilizer_records"("registrationNo");

-- CreateIndex
CREATE INDEX "fertilizer_records_organizationId_idx" ON "fertilizer_records"("organizationId");

-- CreateIndex
CREATE INDEX "controlled_environments_plotId_idx" ON "controlled_environments"("plotId");

-- CreateIndex
CREATE INDEX "controlled_environments_structureType_idx" ON "controlled_environments"("structureType");

-- CreateIndex
CREATE INDEX "controlled_environments_organizationId_idx" ON "controlled_environments"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "harvest_batches_uuid_key" ON "harvest_batches"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "harvest_batches_batchNumber_key" ON "harvest_batches"("batchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "harvest_batches_qrCode_key" ON "harvest_batches"("qrCode");

-- CreateIndex
CREATE INDEX "harvest_batches_batchNumber_idx" ON "harvest_batches"("batchNumber");

-- CreateIndex
CREATE INDEX "harvest_batches_status_idx" ON "harvest_batches"("status");

-- CreateIndex
CREATE INDEX "harvest_batches_organizationId_idx" ON "harvest_batches"("organizationId");

-- CreateIndex
CREATE INDEX "harvest_batches_cycleId_idx" ON "harvest_batches"("cycleId");

-- CreateIndex
CREATE INDEX "harvest_batches_farmId_idx" ON "harvest_batches"("farmId");

-- CreateIndex
CREATE INDEX "harvest_batches_plantCode_idx" ON "harvest_batches"("plantCode");

-- CreateIndex
CREATE INDEX "drying_temperatures_farmId_idx" ON "drying_temperatures"("farmId");

-- CreateIndex
CREATE INDEX "drying_temperatures_timestamp_idx" ON "drying_temperatures"("timestamp");

-- CreateIndex
CREATE INDEX "drying_temperatures_organizationId_idx" ON "drying_temperatures"("organizationId");

-- CreateIndex
CREATE INDEX "drying_humidity_farmId_idx" ON "drying_humidity"("farmId");

-- CreateIndex
CREATE INDEX "drying_humidity_timestamp_idx" ON "drying_humidity"("timestamp");

-- CreateIndex
CREATE INDEX "drying_humidity_organizationId_idx" ON "drying_humidity"("organizationId");

-- CreateIndex
CREATE INDEX "drying_dark_rooms_farmId_idx" ON "drying_dark_rooms"("farmId");

-- CreateIndex
CREATE INDEX "drying_dark_rooms_timestamp_idx" ON "drying_dark_rooms"("timestamp");

-- CreateIndex
CREATE INDEX "drying_dark_rooms_organizationId_idx" ON "drying_dark_rooms"("organizationId");

-- CreateIndex
CREATE INDEX "curing_processes_farmId_idx" ON "curing_processes"("farmId");

-- CreateIndex
CREATE INDEX "curing_processes_status_idx" ON "curing_processes"("status");

-- CreateIndex
CREATE INDEX "curing_processes_startDate_idx" ON "curing_processes"("startDate");

-- CreateIndex
CREATE INDEX "curing_processes_organizationId_idx" ON "curing_processes"("organizationId");

-- CreateIndex
CREATE INDEX "packaging_details_batchId_idx" ON "packaging_details"("batchId");

-- CreateIndex
CREATE INDEX "packaging_details_organizationId_idx" ON "packaging_details"("organizationId");

-- CreateIndex
CREATE INDEX "drying_processes_batchId_idx" ON "drying_processes"("batchId");

-- CreateIndex
CREATE INDEX "drying_processes_organizationId_idx" ON "drying_processes"("organizationId");

-- CreateIndex
CREATE INDEX "drying_processes_cycleId_idx" ON "drying_processes"("cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "herb_species_uuid_key" ON "herb_species"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "herb_species_code_key" ON "herb_species"("code");

-- CreateIndex
CREATE INDEX "herb_species_isActive_idx" ON "herb_species"("isActive");

-- CreateIndex
CREATE INDEX "herb_knowledge_entries_herbCode_idx" ON "herb_knowledge_entries"("herbCode");

-- CreateIndex
CREATE INDEX "herb_knowledge_entries_category_idx" ON "herb_knowledge_entries"("category");

-- CreateIndex
CREATE INDEX "herb_knowledge_entries_herbCode_category_idx" ON "herb_knowledge_entries"("herbCode", "category");

-- CreateIndex
CREATE INDEX "requirement_rules_slotId_idx" ON "requirement_rules"("slotId");

-- CreateIndex
CREATE INDEX "requirement_rules_effectiveFrom_effectiveTo_idx" ON "requirement_rules"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "survey_templates_organizationId_idx" ON "survey_templates"("organizationId");

-- CreateIndex
CREATE INDEX "survey_templates_status_idx" ON "survey_templates"("status");

-- CreateIndex
CREATE INDEX "survey_templates_isDeleted_idx" ON "survey_templates"("isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "survey_templates_organizationId_code_key" ON "survey_templates"("organizationId", "code");

-- CreateIndex
CREATE INDEX "survey_questions_templateId_idx" ON "survey_questions"("templateId");

-- CreateIndex
CREATE INDEX "survey_questions_organizationId_idx" ON "survey_questions"("organizationId");

-- CreateIndex
CREATE INDEX "survey_responses_templateId_idx" ON "survey_responses"("templateId");

-- CreateIndex
CREATE INDEX "survey_responses_region_idx" ON "survey_responses"("region");

-- CreateIndex
CREATE INDEX "survey_responses_organizationId_idx" ON "survey_responses"("organizationId");

-- CreateIndex
CREATE INDEX "survey_answers_responseId_idx" ON "survey_answers"("responseId");

-- CreateIndex
CREATE INDEX "survey_answers_questionId_idx" ON "survey_answers"("questionId");

-- CreateIndex
CREATE INDEX "survey_answers_organizationId_idx" ON "survey_answers"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "survey_answers_responseId_questionId_key" ON "survey_answers"("responseId", "questionId");

-- CreateIndex
CREATE INDEX "expert_interviews_organizationId_idx" ON "expert_interviews"("organizationId");

-- CreateIndex
CREATE INDEX "expert_interviews_interviewDate_idx" ON "expert_interviews"("interviewDate");

-- CreateIndex
CREATE INDEX "expert_interviews_isDeleted_idx" ON "expert_interviews"("isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_uuid_key" ON "notifications"("uuid");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_userId_kind_idx" ON "notifications"("userId", "kind");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "notifications_organizationId_idx" ON "notifications"("organizationId");

-- CreateIndex
CREATE INDEX "system_configs_key_idx" ON "system_configs"("key");

-- CreateIndex
CREATE UNIQUE INDEX "wizard_step_configs_stepNumber_key" ON "wizard_step_configs"("stepNumber");

-- CreateIndex
CREATE UNIQUE INDEX "wizard_step_configs_stepKey_key" ON "wizard_step_configs"("stepKey");

-- CreateIndex
CREATE INDEX "wizard_step_configs_isEnabled_idx" ON "wizard_step_configs"("isEnabled");

-- CreateIndex
CREATE INDEX "wizard_step_configs_displayOrder_idx" ON "wizard_step_configs"("displayOrder");

-- CreateIndex
CREATE INDEX "document_templates_code_idx" ON "document_templates"("code");

-- CreateIndex
CREATE INDEX "document_templates_status_idx" ON "document_templates"("status");

-- CreateIndex
CREATE UNIQUE INDEX "document_templates_code_version_key" ON "document_templates"("code", "version");

-- CreateIndex
CREATE INDEX "report_submissions_certificateId_idx" ON "report_submissions"("certificateId");

-- CreateIndex
CREATE INDEX "report_submissions_userId_idx" ON "report_submissions"("userId");

-- CreateIndex
CREATE INDEX "report_submissions_reportType_idx" ON "report_submissions"("reportType");

-- CreateIndex
CREATE INDEX "report_submissions_status_idx" ON "report_submissions"("status");

-- CreateIndex
CREATE INDEX "report_submissions_reportYear_reportMonth_idx" ON "report_submissions"("reportYear", "reportMonth");

-- CreateIndex
CREATE INDEX "report_submissions_organizationId_idx" ON "report_submissions"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "report_submissions_certificateId_reportType_reportMonth_rep_key" ON "report_submissions"("certificateId", "reportType", "reportMonth", "reportYear");

-- CreateIndex
CREATE INDEX "sop_documents_userId_idx" ON "sop_documents"("userId");

-- CreateIndex
CREATE INDEX "sop_documents_sopType_idx" ON "sop_documents"("sopType");

-- CreateIndex
CREATE INDEX "sop_documents_status_idx" ON "sop_documents"("status");

-- CreateIndex
CREATE INDEX "sop_documents_organizationId_idx" ON "sop_documents"("organizationId");

-- CreateIndex
CREATE INDEX "scope_of_works_applicationId_idx" ON "scope_of_works"("applicationId");

-- CreateIndex
CREATE INDEX "scope_of_works_status_idx" ON "scope_of_works"("status");

-- CreateIndex
CREATE INDEX "scope_of_works_isDeleted_idx" ON "scope_of_works"("isDeleted");

-- CreateIndex
CREATE INDEX "scope_of_works_organizationId_idx" ON "scope_of_works"("organizationId");

-- CreateIndex
CREATE INDEX "scope_of_works_assignedAuditorId_idx" ON "scope_of_works"("assignedAuditorId");

-- CreateIndex
CREATE INDEX "audit_checklists_applicationId_idx" ON "audit_checklists"("applicationId");

-- CreateIndex
CREATE INDEX "audit_checklists_auditorId_idx" ON "audit_checklists"("auditorId");

-- CreateIndex
CREATE INDEX "audit_checklists_status_idx" ON "audit_checklists"("status");

-- CreateIndex
CREATE INDEX "audit_checklists_isDeleted_idx" ON "audit_checklists"("isDeleted");

-- CreateIndex
CREATE INDEX "audit_checklists_organizationId_idx" ON "audit_checklists"("organizationId");

-- CreateIndex
CREATE INDEX "meeting_rooms_applicationId_idx" ON "meeting_rooms"("applicationId");

-- CreateIndex
CREATE INDEX "meeting_rooms_scheduledAt_idx" ON "meeting_rooms"("scheduledAt");

-- CreateIndex
CREATE INDEX "meeting_rooms_status_idx" ON "meeting_rooms"("status");

-- CreateIndex
CREATE INDEX "meeting_rooms_isDeleted_idx" ON "meeting_rooms"("isDeleted");

-- CreateIndex
CREATE INDEX "meeting_rooms_organizationId_idx" ON "meeting_rooms"("organizationId");

-- CreateIndex
CREATE INDEX "meeting_rooms_hostId_idx" ON "meeting_rooms"("hostId");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_uuid_key" ON "organizations"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_code_key" ON "organizations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_taxIdHash_key" ON "organizations"("taxIdHash");

-- CreateIndex
CREATE INDEX "organizations_status_idx" ON "organizations"("status");

-- CreateIndex
CREATE INDEX "organizations_type_idx" ON "organizations"("type");

-- CreateIndex
CREATE INDEX "organizations_isolationTier_idx" ON "organizations"("isolationTier");

-- CreateIndex
CREATE INDEX "tickets_organizationId_idx" ON "tickets"("organizationId");

-- CreateIndex
CREATE INDEX "tickets_creatorId_idx" ON "tickets"("creatorId");

-- CreateIndex
CREATE INDEX "ticket_messages_ticketId_idx" ON "ticket_messages"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "lots_uuid_key" ON "lots"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "lots_lotNumber_key" ON "lots"("lotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "lots_qrCode_key" ON "lots"("qrCode");

-- CreateIndex
CREATE INDEX "lots_batchId_idx" ON "lots"("batchId");

-- CreateIndex
CREATE INDEX "lots_qrCode_idx" ON "lots"("qrCode");

-- CreateIndex
CREATE INDEX "lots_status_idx" ON "lots"("status");

-- CreateIndex
CREATE INDEX "lots_isDeleted_idx" ON "lots"("isDeleted");

-- CreateIndex
CREATE INDEX "lots_organizationId_idx" ON "lots"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "trace_qr_security_qrCode_key" ON "trace_qr_security"("qrCode");

-- CreateIndex
CREATE UNIQUE INDEX "trace_qr_security_publicUrl_key" ON "trace_qr_security"("publicUrl");

-- CreateIndex
CREATE INDEX "trace_qr_security_entityType_entityId_idx" ON "trace_qr_security"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "trace_qr_security_chainHash_idx" ON "trace_qr_security"("chainHash");

-- CreateIndex
CREATE INDEX "trace_qr_security_createdAt_idx" ON "trace_qr_security"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "trace_qr_security_organizationId_idx" ON "trace_qr_security"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "trace_qr_security_entityType_entityId_key" ON "trace_qr_security"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "trace_qr_scans_qrSecurityId_idx" ON "trace_qr_scans"("qrSecurityId");

-- CreateIndex
CREATE INDEX "trace_qr_scans_createdAt_idx" ON "trace_qr_scans"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "trace_qr_scans_organizationId_idx" ON "trace_qr_scans"("organizationId");

-- CreateIndex
CREATE INDEX "consumer_feedback_certificateId_idx" ON "consumer_feedback"("certificateId");

-- CreateIndex
CREATE INDEX "consumer_feedback_status_idx" ON "consumer_feedback"("status");

-- CreateIndex
CREATE INDEX "consumer_feedback_createdAt_idx" ON "consumer_feedback"("createdAt");

-- CreateIndex
CREATE INDEX "consumer_feedback_isDeleted_idx" ON "consumer_feedback"("isDeleted");

-- CreateIndex
CREATE INDEX "consumer_feedback_organizationId_idx" ON "consumer_feedback"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "plant_species_uuid_key" ON "plant_species"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "plant_species_code_key" ON "plant_species"("code");

-- CreateIndex
CREATE INDEX "plant_species_code_idx" ON "plant_species"("code");

-- CreateIndex
CREATE INDEX "plant_species_nameTH_idx" ON "plant_species"("nameTH");

-- CreateIndex
CREATE INDEX "plant_species_isActive_isDeleted_idx" ON "plant_species"("isActive", "isDeleted");

-- CreateIndex
CREATE INDEX "document_requirements_plantCode_requestType_idx" ON "document_requirements"("plantCode", "requestType");

-- CreateIndex
CREATE INDEX "partner_access_logs_partnerId_createdAt_idx" ON "partner_access_logs"("partnerId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "role_groups_code_key" ON "role_groups"("code");

-- CreateIndex
CREATE INDEX "user_group_memberships_userId_idx" ON "user_group_memberships"("userId");

-- CreateIndex
CREATE INDEX "user_group_memberships_groupId_idx" ON "user_group_memberships"("groupId");

-- CreateIndex
CREATE INDEX "user_group_memberships_organizationId_groupId_idx" ON "user_group_memberships"("organizationId", "groupId");

-- CreateIndex
CREATE INDEX "user_permission_grants_userId_idx" ON "user_permission_grants"("userId");

-- CreateIndex
CREATE INDEX "user_permission_grants_organizationId_idx" ON "user_permission_grants"("organizationId");

-- CreateIndex
CREATE INDEX "waiver_reopen_requests_applicationId_idx" ON "waiver_reopen_requests"("applicationId");

-- CreateIndex
CREATE INDEX "waiver_reopen_requests_organizationId_status_idx" ON "waiver_reopen_requests"("organizationId", "status");

-- CreateIndex
CREATE INDEX "work_activities_applicationId_idx" ON "work_activities"("applicationId");

-- CreateIndex
CREATE INDEX "work_activities_assignedUserId_idx" ON "work_activities"("assignedUserId");

-- CreateIndex
CREATE INDEX "work_activities_state_candidateGroup_idx" ON "work_activities"("state", "candidateGroup");

-- CreateIndex
CREATE INDEX "work_activities_workType_state_idx" ON "work_activities"("workType", "state");

-- CreateIndex
CREATE INDEX "work_activities_organizationId_idx" ON "work_activities"("organizationId");

-- CreateIndex
CREATE INDEX "work_activities_completedBy_idx" ON "work_activities"("completedBy");

-- CreateIndex
CREATE INDEX "stage_activity_configs_workflowStage_isActive_idx" ON "stage_activity_configs"("workflowStage", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "stage_activity_configs_workflowStage_workType_key" ON "stage_activity_configs"("workflowStage", "workType");

-- CreateIndex
CREATE UNIQUE INDEX "sla_policies_workType_key" ON "sla_policies"("workType");

-- CreateIndex
CREATE INDEX "assignment_ledger_assignee_org_created_idx" ON "assignment_ledger_entries"("assigneeUserId", "organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "assignment_ledger_assignedby_org_created_idx" ON "assignment_ledger_entries"("assignedByUserId", "organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "assignment_ledger_entity_created_idx" ON "assignment_ledger_entries"("entityType", "entityId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "assignment_ledger_entries_organizationId_createdAt_idx" ON "assignment_ledger_entries"("organizationId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "application_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_healthId_fkey" FOREIGN KEY ("healthId") REFERENCES "users"("canonicalId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_standardCode_fkey" FOREIGN KEY ("standardCode") REFERENCES "certification_standards"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_phase1SlipId_fkey" FOREIGN KEY ("phase1SlipId") REFERENCES "payment_slips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_phase2SlipId_fkey" FOREIGN KEY ("phase2SlipId") REFERENCES "payment_slips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_headAuditorId_fkey" FOREIGN KEY ("headAuditorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_schedulerId_fkey" FOREIGN KEY ("schedulerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "application_bundles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_comments" ADD CONSTRAINT "application_comments_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_comments" ADD CONSTRAINT "application_comments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_drafts" ADD CONSTRAINT "application_drafts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_drafts" ADD CONSTRAINT "application_drafts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_bundles" ADD CONSTRAINT "application_bundles_healthId_fkey" FOREIGN KEY ("healthId") REFERENCES "users"("canonicalId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_bundles" ADD CONSTRAINT "application_bundles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_audit_checklist_items" ADD CONSTRAINT "farm_audit_checklist_items_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audit_checklists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_audit_photos" ADD CONSTRAINT "farm_audit_photos_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audit_checklists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_audit_photos" ADD CONSTRAINT "farm_audit_photos_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "farm_audit_checklist_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_audit_photos" ADD CONSTRAINT "farm_audit_photos_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_verification_logs" ADD CONSTRAINT "gps_verification_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_audit_tasks" ADD CONSTRAINT "post_audit_tasks_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_audit_tasks" ADD CONSTRAINT "post_audit_tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision_deadlines" ADD CONSTRAINT "revision_deadlines_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision_deadlines" ADD CONSTRAINT "revision_deadlines_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_links" ADD CONSTRAINT "identity_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_healthId_fkey" FOREIGN KEY ("healthId") REFERENCES "users"("canonicalId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "payment_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_slips" ADD CONSTRAINT "payment_slips_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_slips" ADD CONSTRAINT "payment_slips_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_slips" ADD CONSTRAINT "payment_slips_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_slips" ADD CONSTRAINT "payment_slips_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_slips" ADD CONSTRAINT "payment_slips_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_originalInvoiceId_fkey" FOREIGN KEY ("originalInvoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_originalInvoiceId_fkey" FOREIGN KEY ("originalInvoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_orders_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_orders_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_orders_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_orders_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "payment_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_orders_remittanceBatchId_fkey" FOREIGN KEY ("remittanceBatchId") REFERENCES "dtam_remittance_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dtam_remittance_batches" ADD CONSTRAINT "dtam_remittance_batches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reminder_logs" ADD CONSTRAINT "payment_reminder_logs_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reminder_logs" ADD CONSTRAINT "payment_reminder_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_documents" ADD CONSTRAINT "checkout_documents_checkoutOrderId_fkey" FOREIGN KEY ("checkoutOrderId") REFERENCES "checkout_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_documents" ADD CONSTRAINT "checkout_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_standardCode_fkey" FOREIGN KEY ("standardCode") REFERENCES "certification_standards"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_revisions" ADD CONSTRAINT "certificate_revisions_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "certificates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_revisions" ADD CONSTRAINT "certificate_revisions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standard_requirements" ADD CONSTRAINT "standard_requirements_standardId_fkey" FOREIGN KEY ("standardId") REFERENCES "certification_standards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_rounds" ADD CONSTRAINT "correction_rounds_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_rounds" ADD CONSTRAINT "correction_rounds_letterId_fkey" FOREIGN KEY ("letterId") REFERENCES "notifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_rounds" ADD CONSTRAINT "correction_rounds_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_submission_versions" ADD CONSTRAINT "correction_submission_versions_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_submission_versions" ADD CONSTRAINT "correction_submission_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planting_cycles" ADD CONSTRAINT "planting_cycles_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planting_cycles" ADD CONSTRAINT "planting_cycles_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planting_cycles" ADD CONSTRAINT "planting_cycles_plantSpeciesId_fkey" FOREIGN KEY ("plantSpeciesId") REFERENCES "plant_species"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planting_cycles" ADD CONSTRAINT "planting_cycles_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "plots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planting_cycles" ADD CONSTRAINT "planting_cycles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planting_cycle_plots" ADD CONSTRAINT "planting_cycle_plots_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "planting_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planting_cycle_plots" ADD CONSTRAINT "planting_cycle_plots_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "plots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planting_cycle_plots" ADD CONSTRAINT "planting_cycle_plots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_units" ADD CONSTRAINT "plant_units_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "planting_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_units" ADD CONSTRAINT "plant_units_cyclePlotId_fkey" FOREIGN KEY ("cyclePlotId") REFERENCES "planting_cycle_plots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_units" ADD CONSTRAINT "plant_units_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "harvest_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_units" ADD CONSTRAINT "plant_units_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_unit_edit_history" ADD CONSTRAINT "plant_unit_edit_history_plantUnitId_fkey" FOREIGN KEY ("plantUnitId") REFERENCES "plant_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_unit_edit_history" ADD CONSTRAINT "plant_unit_edit_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_logs" ADD CONSTRAINT "care_logs_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "planting_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_logs" ADD CONSTRAINT "care_logs_plantUnitId_fkey" FOREIGN KEY ("plantUnitId") REFERENCES "plant_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_logs" ADD CONSTRAINT "care_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cultivation_logs" ADD CONSTRAINT "cultivation_logs_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "planting_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cultivation_logs" ADD CONSTRAINT "cultivation_logs_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "plots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cultivation_logs" ADD CONSTRAINT "cultivation_logs_plantUnitId_fkey" FOREIGN KEY ("plantUnitId") REFERENCES "plant_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cultivation_logs" ADD CONSTRAINT "cultivation_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_context_switches" ADD CONSTRAINT "entity_context_switches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_context_switches" ADD CONSTRAINT "entity_context_switches_fromEntityId_fkey" FOREIGN KEY ("fromEntityId") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_context_switches" ADD CONSTRAINT "entity_context_switches_toEntityId_fkey" FOREIGN KEY ("toEntityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_context_switches" ADD CONSTRAINT "entity_context_switches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_member_permission_grants" ADD CONSTRAINT "entity_member_permission_grants_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "entity_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_member_permission_grants" ADD CONSTRAINT "entity_member_permission_grants_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_membership_events" ADD CONSTRAINT "entity_membership_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_membership_events" ADD CONSTRAINT "entity_membership_events_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_membership_events" ADD CONSTRAINT "entity_membership_events_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_membership_events" ADD CONSTRAINT "entity_membership_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_memberships" ADD CONSTRAINT "entity_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_memberships" ADD CONSTRAINT "entity_memberships_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_memberships" ADD CONSTRAINT "entity_memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farms" ADD CONSTRAINT "farms_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farms" ADD CONSTRAINT "farms_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farms" ADD CONSTRAINT "farms_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_analyses" ADD CONSTRAINT "site_analyses_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_analyses" ADD CONSTRAINT "site_analyses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plots" ADD CONSTRAINT "plots_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plots" ADD CONSTRAINT "plots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "water_sources" ADD CONSTRAINT "water_sources_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "plots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "water_sources" ADD CONSTRAINT "water_sources_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growing_media" ADD CONSTRAINT "growing_media_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "planting_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growing_media" ADD CONSTRAINT "growing_media_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seed_sources" ADD CONSTRAINT "seed_sources_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "planting_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seed_sources" ADD CONSTRAINT "seed_sources_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fertilizer_records" ADD CONSTRAINT "fertilizer_records_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "planting_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fertilizer_records" ADD CONSTRAINT "fertilizer_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controlled_environments" ADD CONSTRAINT "controlled_environments_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "plots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controlled_environments" ADD CONSTRAINT "controlled_environments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_batches" ADD CONSTRAINT "harvest_batches_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "planting_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_batches" ADD CONSTRAINT "harvest_batches_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_batches" ADD CONSTRAINT "harvest_batches_plantCode_fkey" FOREIGN KEY ("plantCode") REFERENCES "plant_species"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_batches" ADD CONSTRAINT "harvest_batches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drying_temperatures" ADD CONSTRAINT "drying_temperatures_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drying_temperatures" ADD CONSTRAINT "drying_temperatures_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drying_humidity" ADD CONSTRAINT "drying_humidity_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drying_humidity" ADD CONSTRAINT "drying_humidity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drying_dark_rooms" ADD CONSTRAINT "drying_dark_rooms_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drying_dark_rooms" ADD CONSTRAINT "drying_dark_rooms_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curing_processes" ADD CONSTRAINT "curing_processes_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curing_processes" ADD CONSTRAINT "curing_processes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_details" ADD CONSTRAINT "packaging_details_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "harvest_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_details" ADD CONSTRAINT "packaging_details_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drying_processes" ADD CONSTRAINT "drying_processes_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "planting_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drying_processes" ADD CONSTRAINT "drying_processes_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "harvest_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drying_processes" ADD CONSTRAINT "drying_processes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "herb_knowledge_entries" ADD CONSTRAINT "herb_knowledge_entries_herbCode_fkey" FOREIGN KEY ("herbCode") REFERENCES "herb_species"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_templates" ADD CONSTRAINT "survey_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "survey_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "survey_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "survey_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "survey_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expert_interviews" ADD CONSTRAINT "expert_interviews_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_submissions" ADD CONSTRAINT "report_submissions_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "certificates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_submissions" ADD CONSTRAINT "report_submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_submissions" ADD CONSTRAINT "report_submissions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sop_documents" ADD CONSTRAINT "sop_documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sop_documents" ADD CONSTRAINT "sop_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scope_of_works" ADD CONSTRAINT "scope_of_works_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scope_of_works" ADD CONSTRAINT "scope_of_works_assignedAuditorId_fkey" FOREIGN KEY ("assignedAuditorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scope_of_works" ADD CONSTRAINT "scope_of_works_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_checklists" ADD CONSTRAINT "audit_checklists_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_checklists" ADD CONSTRAINT "audit_checklists_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_checklists" ADD CONSTRAINT "audit_checklists_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_rooms" ADD CONSTRAINT "meeting_rooms_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_rooms" ADD CONSTRAINT "meeting_rooms_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_rooms" ADD CONSTRAINT "meeting_rooms_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "harvest_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trace_qr_security" ADD CONSTRAINT "trace_qr_security_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trace_qr_scans" ADD CONSTRAINT "trace_qr_scans_qrSecurityId_fkey" FOREIGN KEY ("qrSecurityId") REFERENCES "trace_qr_security"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trace_qr_scans" ADD CONSTRAINT "trace_qr_scans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumer_feedback" ADD CONSTRAINT "consumer_feedback_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumer_feedback" ADD CONSTRAINT "consumer_feedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_plantCode_fkey" FOREIGN KEY ("plantCode") REFERENCES "plant_species"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_group_memberships" ADD CONSTRAINT "user_group_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_group_memberships" ADD CONSTRAINT "user_group_memberships_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "role_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_group_memberships" ADD CONSTRAINT "user_group_memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_grants" ADD CONSTRAINT "user_permission_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_grants" ADD CONSTRAINT "user_permission_grants_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiver_reopen_requests" ADD CONSTRAINT "waiver_reopen_requests_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_activities" ADD CONSTRAINT "work_activities_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_activities" ADD CONSTRAINT "work_activities_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_activities" ADD CONSTRAINT "work_activities_completedBy_fkey" FOREIGN KEY ("completedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_activities" ADD CONSTRAINT "work_activities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_ledger_entries" ADD CONSTRAINT "assignment_ledger_entries_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_ledger_entries" ADD CONSTRAINT "assignment_ledger_entries_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_ledger_entries" ADD CONSTRAINT "assignment_ledger_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

