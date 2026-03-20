-- CreateEnum
CREATE TYPE "GlobalRole" AS ENUM ('SUPER_ADMIN', 'OPS_ADMIN', 'SUPPORT_READONLY');

-- CreateEnum
CREATE TYPE "TenantOnboardingStatus" AS ENUM ('PENDING', 'ACTIVE', 'REQUIRES_ACTION', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "BotProvisioningState" AS ENUM ('NOT_STARTED', 'PROVISIONING', 'CONFIGURING', 'DEPLOYING', 'LIVE', 'DEGRADED', 'FAILED');

-- CreateEnum
CREATE TYPE "IntegrationHealth" AS ENUM ('UNKNOWN', 'HEALTHY', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "InboundSourceType" AS ENUM ('SLACK', 'EMAIL');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('CRASH_IMAGE');

-- CreateEnum
CREATE TYPE "AnalysisJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'RATE_LIMITED');

-- CreateEnum
CREATE TYPE "OutboundChannelType" AS ENUM ('SLACK', 'EMAIL');

-- CreateEnum
CREATE TYPE "ImageAnalysisStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailTemplateVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "JobEventType" AS ENUM ('JOB_QUEUED', 'JOB_STARTED', 'JOB_SUCCEEDED', 'JOB_FAILED', 'WEBHOOK_RECEIVED', 'WEBHOOK_VERIFIED', 'WEBHOOK_REJECTED', 'ATTACHMENT_STORED', 'ANALYSIS_REQUESTED', 'ANALYSIS_NORMALIZED', 'MESSAGE_RENDERED', 'OUTBOUND_SENT');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "onboardingStatus" "TenantOnboardingStatus" NOT NULL DEFAULT 'PENDING',
    "defaultAnalysisStrategy" TEXT NOT NULL DEFAULT 'analyze_all_and_aggregate',

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "globalRole" "GlobalRole" NOT NULL DEFAULT 'OPS_ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "GlobalRole" NOT NULL DEFAULT 'OPS_ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Firm" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "counselorType" TEXT NOT NULL,
    "lawFirmName" TEXT NOT NULL,
    "billingEmail" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "streetAddress" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zipCode" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Firm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "billingEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'trial',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClawdbotInstance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalInstanceId" TEXT,
    "provisioningState" "BotProvisioningState" NOT NULL DEFAULT 'NOT_STARTED',
    "errorMessage" TEXT,
    "lastStateChangeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClawdbotInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_document_versions" (
    "id" TEXT NOT NULL,
    "memoryDocumentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "contentMarkdown" TEXT NOT NULL,
    "sourceProvenance" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "memory_document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlackConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "channelId" TEXT,
    "botUserId" TEXT,
    "signingSecretEncrypted" TEXT NOT NULL,
    "botTokenEncrypted" TEXT NOT NULL,
    "verificationStatus" "IntegrationHealth" NOT NULL DEFAULT 'UNKNOWN',
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlackConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "inboundRouteKey" TEXT,
    "settingsJson" JSONB,
    "verificationStatus" "IntegrationHealth" NOT NULL DEFAULT 'UNKNOWN',
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceType" "InboundSourceType" NOT NULL,
    "externalSourceId" TEXT NOT NULL,
    "threadRef" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "dedupeHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadedAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inboundMessageId" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT,
    "mimeType" TEXT,
    "sizeBytes" BIGINT,
    "sha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inboundMessageId" TEXT NOT NULL,
    "strategy" TEXT NOT NULL DEFAULT 'analyze_all_and_aggregate',
    "status" "AnalysisJobStatus" NOT NULL DEFAULT 'QUEUED',
    "providerBaseUrl" TEXT,
    "dedupeKey" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerImageAnalysisResult" (
    "id" TEXT NOT NULL,
    "analysisJobId" TEXT NOT NULL,
    "uploadedAssetId" TEXT NOT NULL,
    "status" "ImageAnalysisStatus" NOT NULL DEFAULT 'QUEUED',
    "confidence" TEXT,
    "normalizedResult" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerImageAnalysisResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AggregatedCaseSummary" (
    "id" TEXT NOT NULL,
    "analysisJobId" TEXT NOT NULL,
    "summaryJson" JSONB,
    "provenanceJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AggregatedCaseSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundResponse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inboundMessageId" TEXT NOT NULL,
    "channelType" "OutboundChannelType" NOT NULL,
    "recipientRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "renderedSubject" TEXT,
    "renderedHtmlPreview" TEXT,
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "EmailTemplateVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "htmlBody" TEXT NOT NULL,
    "cssStyles" TEXT,
    "placeholdersDetected" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "actorUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobEventHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "actorUserId" TEXT,
    "correlationId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "eventType" "JobEventType" NOT NULL,
    "detailsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobEventHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tenant_onboardingStatus_idx" ON "Tenant"("onboardingStatus");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_globalRole_idx" ON "User"("globalRole");

-- CreateIndex
CREATE INDEX "TenantMember_role_idx" ON "TenantMember"("role");

-- CreateIndex
CREATE UNIQUE INDEX "TenantMember_tenantId_userId_key" ON "TenantMember"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Firm_tenantId_key" ON "Firm"("tenantId");

-- CreateIndex
CREATE INDEX "Subscription_tenantId_status_idx" ON "Subscription"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClawdbotInstance_tenantId_key" ON "ClawdbotInstance"("tenantId");

-- CreateIndex
CREATE INDEX "ClawdbotInstance_provisioningState_idx" ON "ClawdbotInstance"("provisioningState");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryDocument_tenantId_key" ON "MemoryDocument"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryDocument_currentVersionId_key" ON "MemoryDocument"("currentVersionId");

-- CreateIndex
CREATE INDEX "memory_document_versions_tenantId_versionNumber_idx" ON "memory_document_versions"("tenantId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "memory_document_versions_memoryDocumentId_versionNumber_key" ON "memory_document_versions"("memoryDocumentId", "versionNumber");

-- CreateIndex
CREATE INDEX "SlackConfig_tenantId_verificationStatus_idx" ON "SlackConfig"("tenantId", "verificationStatus");

-- CreateIndex
CREATE INDEX "EmailConfig_tenantId_enabled_verificationStatus_idx" ON "EmailConfig"("tenantId", "enabled", "verificationStatus");

-- CreateIndex
CREATE INDEX "InboundMessage_tenantId_receivedAt_idx" ON "InboundMessage"("tenantId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboundMessage_tenantId_dedupeHash_key" ON "InboundMessage"("tenantId", "dedupeHash");

-- CreateIndex
CREATE INDEX "UploadedAsset_tenantId_assetType_idx" ON "UploadedAsset"("tenantId", "assetType");

-- CreateIndex
CREATE INDEX "UploadedAsset_inboundMessageId_idx" ON "UploadedAsset"("inboundMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisJob_dedupeKey_key" ON "AnalysisJob"("dedupeKey");

-- CreateIndex
CREATE INDEX "AnalysisJob_tenantId_status_createdAt_idx" ON "AnalysisJob"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PerImageAnalysisResult_analysisJobId_uploadedAssetId_idx" ON "PerImageAnalysisResult"("analysisJobId", "uploadedAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "AggregatedCaseSummary_analysisJobId_key" ON "AggregatedCaseSummary"("analysisJobId");

-- CreateIndex
CREATE INDEX "OutboundResponse_tenantId_channelType_status_createdAt_idx" ON "OutboundResponse"("tenantId", "channelType", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_tenantId_name_key" ON "EmailTemplate"("tenantId", "name");

-- CreateIndex
CREATE INDEX "EmailTemplateVersion_templateId_status_versionNumber_idx" ON "EmailTemplateVersion"("templateId", "status", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplateVersion_templateId_versionNumber_key" ON "EmailTemplateVersion"("templateId", "versionNumber");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_eventType_idx" ON "AuditLog"("eventType");

-- CreateIndex
CREATE INDEX "JobEventHistory_tenantId_createdAt_idx" ON "JobEventHistory"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "JobEventHistory_correlationId_idx" ON "JobEventHistory"("correlationId");

-- AddForeignKey
ALTER TABLE "TenantMember" ADD CONSTRAINT "TenantMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMember" ADD CONSTRAINT "TenantMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Firm" ADD CONSTRAINT "Firm_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClawdbotInstance" ADD CONSTRAINT "ClawdbotInstance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryDocument" ADD CONSTRAINT "MemoryDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryDocument" ADD CONSTRAINT "MemoryDocument_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "memory_document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_document_versions" ADD CONSTRAINT "memory_document_versions_memoryDocumentId_fkey" FOREIGN KEY ("memoryDocumentId") REFERENCES "MemoryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_document_versions" ADD CONSTRAINT "memory_document_versions_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackConfig" ADD CONSTRAINT "SlackConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailConfig" ADD CONSTRAINT "EmailConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundMessage" ADD CONSTRAINT "InboundMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedAsset" ADD CONSTRAINT "UploadedAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedAsset" ADD CONSTRAINT "UploadedAsset_inboundMessageId_fkey" FOREIGN KEY ("inboundMessageId") REFERENCES "InboundMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisJob" ADD CONSTRAINT "AnalysisJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisJob" ADD CONSTRAINT "AnalysisJob_inboundMessageId_fkey" FOREIGN KEY ("inboundMessageId") REFERENCES "InboundMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerImageAnalysisResult" ADD CONSTRAINT "PerImageAnalysisResult_analysisJobId_fkey" FOREIGN KEY ("analysisJobId") REFERENCES "AnalysisJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerImageAnalysisResult" ADD CONSTRAINT "PerImageAnalysisResult_uploadedAssetId_fkey" FOREIGN KEY ("uploadedAssetId") REFERENCES "UploadedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AggregatedCaseSummary" ADD CONSTRAINT "AggregatedCaseSummary_analysisJobId_fkey" FOREIGN KEY ("analysisJobId") REFERENCES "AnalysisJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundResponse" ADD CONSTRAINT "OutboundResponse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundResponse" ADD CONSTRAINT "OutboundResponse_inboundMessageId_fkey" FOREIGN KEY ("inboundMessageId") REFERENCES "InboundMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplateVersion" ADD CONSTRAINT "EmailTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplateVersion" ADD CONSTRAINT "EmailTemplateVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobEventHistory" ADD CONSTRAINT "JobEventHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobEventHistory" ADD CONSTRAINT "JobEventHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
