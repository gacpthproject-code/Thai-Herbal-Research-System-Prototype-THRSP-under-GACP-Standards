# Naming Audit Report

- Generated: 2026-02-16 21:07:15
- Scope: full repository (`git ls-files`)
- Policy: lowercase kebab-case for files/folders, no spaces, no forbidden tokens, parentheses only in Next app route-groups

## Summary

- Baseline snapshot before cleanup: uppercase=274, spaces=0, invalid-parentheses=0, forbidden-token-names=1 (substring scan)
- Current snapshot after cleanup: uppercase=124, spaces=0, invalid-parentheses=0, forbidden-token-names=0
- Rename operations detected in working tree: 249

## Before/After Rename Table

| Before | After |
|---|---|
| `apps/backend/API_ENDPOINTS.md` | `apps/backend/api-endpoints.md` |
| `apps/backend/controllers/DocumentAnalysisController.js` | `apps/backend/controllers/document-analysis-controller.js` |
| `apps/backend/controllers/JourneyController.js` | `apps/backend/controllers/journey-controller.js` |
| `apps/backend/controllers/masterDataController.js` | `apps/backend/controllers/master-data-controller.js` |
| `apps/backend/controllers/PlantController.js` | `apps/backend/controllers/plant-controller.js` |
| `apps/backend/docs/API.md` | `apps/backend/docs/api-legacy.md` |
| `apps/backend/SERVICE_TESTS_SUMMARY.md` | `apps/backend/service-tests-summary.md` |
| `apps/backend/services/EmailService.js` | `apps/backend/services/email-service.js` |
| `apps/backend/services/EmailTemplateEngine.js` | `apps/backend/services/email-template-engine.js` |
| `apps/backend/services/email/EmailService.js` | `apps/backend/services/email/email-service-legacy.js` |
| `apps/backend/services/email/EmailTemplateEngine.js` | `apps/backend/services/email/email-template-engine-legacy.js` |
| `apps/backend/services/email/README.md` | `apps/backend/services/email/readme.md` |
| `apps/backend/services/FieldAuditService.js` | `apps/backend/services/field-audit-service.js` |
| `apps/backend/services/media/PhotoUploadService.js` | `apps/backend/services/media/photo-upload-service-legacy.js` |
| `apps/backend/services/media/SignatureService.js` | `apps/backend/services/media/signature-service-legacy.js` |
| `apps/backend/TESTING_GUIDE.md` | `apps/backend/testing-guide.md` |
| `apps/backend/TEST_RUN_SUMMARY.md` | `apps/backend/test-run-summary.md` |
| `apps/backend/storage/certificates/certificate_GACP-2025-XX-0001.pdf` | `apps/backend/storage/certificates/certificate-gacp-2025-xx-0001.pdf` |
| `apps/backend/utils/Validators.js` | `apps/backend/utils/validators-legacy.js` |
| `apps/mobile-app/lib/generated/api/auth_health/doc/UserProfile.md` | `apps/mobile-app/lib/generated/api/auth_health/doc/user-profile.md` |
| `apps/web-app/__tests__/__mocks__/fileMock.js` | `apps/web-app/__tests__/__mocks__/file-mock.js` |
| `apps/web-app/__tests__/components/ui/Button.test.tsx` | `apps/web-app/__tests__/components/ui/button-test.tsx` |
| `apps/web-app/__tests__/components/ui/Input.test.tsx` | `apps/web-app/__tests__/components/ui/input-test.tsx` |
| `apps/web-app/docs/archive/AUTH-ANALYSIS.md` | `apps/web-app/docs/archive/auth-analysis-legacy.md` |
| `apps/web-app/docs/archive/COMPLETE-E2E.md` | `apps/web-app/docs/archive/complete-e2-e.md` |
| `apps/web-app/docs/archive/DEVELOPMENT-STATUS.md` | `apps/web-app/docs/archive/development-status-legacy.md` |
| `apps/web-app/docs/archive/E2E-TESTING.md` | `apps/web-app/docs/archive/e2-e-testing.md` |
| `apps/web-app/docs/archive/ENV-SETUP.md` | `apps/web-app/docs/archive/env-setup-legacy.md` |
| `apps/web-app/docs/archive/FINAL-VERIFICATION.md` | `apps/web-app/docs/archive/final-verification-legacy.md` |
| `apps/web-app/docs/archive/PROFILE-ENHANCEMENT.md` | `apps/web-app/docs/archive/profile-enhancement-legacy.md` |
| `apps/web-app/docs/archive/PROFILE-IMPLEMENTATION.md` | `apps/web-app/docs/archive/profile-implementation-legacy.md` |
| `apps/web-app/docs/archive/README.md` | `apps/web-app/docs/archive/readme.md` |
| `apps/web-app/docs/archive/SEO-README.md` | `apps/web-app/docs/archive/seo-readme-legacy.md` |
| `apps/web-app/docs/SHARED_UTILITIES.md` | `apps/web-app/docs/shared-utilities.md` |
| `apps/web-app/src/app/(auth)/login/AccountTypeSelector.tsx` | `apps/web-app/src/app/(auth)/login/account-type-selector.tsx` |
| `apps/web-app/src/app/(auth)/login/LoginOverlays.tsx` | `apps/web-app/src/app/(auth)/login/login-overlays.tsx` |
| `apps/web-app/src/app/health/applications/new/hooks/useAutoSave.ts` | `apps/web-app/src/app/health/applications/new/hooks/use-auto-save.ts` |
| `apps/web-app/src/app/health/applications/new/hooks/useWizardState.ts` | `apps/web-app/src/app/health/applications/new/hooks/use-wizard-state.ts` |
| `apps/web-app/src/app/health/applications/new/hooks/useWizardStore.ts` | `apps/web-app/src/app/health/applications/new/hooks/use-wizard-store.ts` |
| `apps/web-app/src/app/health/applications/new/steps/StepDocuments.tsx` | `apps/web-app/src/app/health/applications/new/steps/step-documents.tsx` |
| `apps/web-app/src/app/health/applications/new/steps/StepFarmInfo.tsx` | `apps/web-app/src/app/health/applications/new/steps/step-farm-info.tsx` |
| `apps/web-app/src/app/health/applications/new/steps/StepGeneral.tsx` | `apps/web-app/src/app/health/applications/new/steps/step-general.tsx` |
| `apps/web-app/src/app/health/applications/new/steps/StepHarvest.tsx` | `apps/web-app/src/app/health/applications/new/steps/step-harvest.tsx` |
| `apps/web-app/src/app/health/applications/new/steps/StepInvoice.tsx` | `apps/web-app/src/app/health/applications/new/steps/step-invoice.tsx` |
| `apps/web-app/src/app/health/applications/new/steps/StepLots.tsx` | `apps/web-app/src/app/health/applications/new/steps/step-lots.tsx` |
| `apps/web-app/src/app/health/applications/new/steps/StepPlantSelection.tsx` | `apps/web-app/src/app/health/applications/new/steps/step-plant-selection.tsx` |
| `apps/web-app/src/app/health/applications/new/steps/StepPlots.tsx` | `apps/web-app/src/app/health/applications/new/steps/step-plots.tsx` |
| `apps/web-app/src/app/health/applications/new/steps/StepPreCheck.tsx` | `apps/web-app/src/app/health/applications/new/steps/step-pre-check.tsx` |
| `apps/web-app/src/app/health/applications/new/steps/StepProductionEstimate.tsx` | `apps/web-app/src/app/health/applications/new/steps/step-production-estimate.tsx` |
| `apps/web-app/src/app/health/applications/new/steps/StepProductionInfo.tsx` | `apps/web-app/src/app/health/applications/new/steps/step-production-info.tsx` |
| `apps/web-app/src/app/health/applications/new/steps/StepQualityControl.tsx` | `apps/web-app/src/app/health/applications/new/steps/step-quality-control.tsx` |
| `apps/web-app/src/app/health/applications/new/steps/StepQuote.tsx` | `apps/web-app/src/app/health/applications/new/steps/step-quote.tsx` |
| `apps/web-app/src/app/health/applications/new/steps/StepReview.tsx` | `apps/web-app/src/app/health/applications/new/steps/step-review.tsx` |
| `apps/web-app/src/app/health/applications/new/steps/StepServiceType.tsx` | `apps/web-app/src/app/health/applications/new/steps/step-service-type.tsx` |
| `apps/web-app/src/app/health/applications/new/steps/StepSubmit.tsx` | `apps/web-app/src/app/health/applications/new/steps/step-submit.tsx` |
| `apps/web-app/src/app/health/applications/new/steps/StepSuccess.tsx` | `apps/web-app/src/app/health/applications/new/steps/step-success.tsx` |
| `apps/web-app/src/app/health/applications/new/steps/StepSupplementary.tsx` | `apps/web-app/src/app/health/applications/new/steps/step-supplementary.tsx` |
| `apps/web-app/src/app/health/applications/renewal/InvoiceStep.tsx` | `apps/web-app/src/app/health/applications/renewal/invoice-step.tsx` |
| `apps/web-app/src/app/health/applications/renewal/PaymentStep.tsx` | `apps/web-app/src/app/health/applications/renewal/payment-step.tsx` |
| `apps/web-app/src/app/health/applications/renewal/QuotationStep.tsx` | `apps/web-app/src/app/health/applications/renewal/quotation-step.tsx` |
| `apps/web-app/src/app/health/applications/renewal/SuccessStep.tsx` | `apps/web-app/src/app/health/applications/renewal/success-step.tsx` |
| `apps/web-app/src/app/health/applications/renewal/UploadStep.tsx` | `apps/web-app/src/app/health/applications/renewal/upload-step.tsx` |
| `apps/web-app/src/app/health/profile/ChangePasswordModal.tsx` | `apps/web-app/src/app/health/profile/change-password-modal.tsx` |
| `apps/web-app/src/app/health/tracking/plants/[qrCode]/page.tsx` | `apps/web-app/src/app/health/tracking/plants/[qr-code]/page.tsx` |
| `apps/web-app/src/app/provider/components/ProviderLayout.tsx` | `apps/web-app/src/app/provider/components/provider-layout.tsx` |
| `apps/web-app/src/app/trace/[qrCode]/page.tsx` | `apps/web-app/src/app/trace/[qr-code]/page.tsx` |
| `apps/web-app/src/app/trace/batch/[qrCode]/page.tsx` | `apps/web-app/src/app/trace/batch/[qr-code]/page.tsx` |
| `apps/web-app/src/app/trace/lot/[lotId]/page.tsx` | `apps/web-app/src/app/trace/lot/[lot-id]/page.tsx` |
| `apps/web-app/src/app/trace/plant/[qrCode]/page.tsx` | `apps/web-app/src/app/trace/plant/[qr-code]/page.tsx` |
| `apps/web-app/src/app/trace/plot-cycle/[qrCode]/page.tsx` | `apps/web-app/src/app/trace/plot-cycle/[qr-code]/page.tsx` |
| `apps/web-app/src/components/AuthHealthIndicator.tsx` | `apps/web-app/src/components/auth-health-indicator.tsx` |
| `apps/web-app/src/components/auth/SimpleRegisterForm.jsx` | `apps/web-app/src/components/auth/simple-register-form.jsx` |
| `apps/web-app/src/components/CultivationMethodSelector.tsx` | `apps/web-app/src/components/cultivation-method-selector.tsx` |
| `apps/web-app/src/components/dashboard/AnalyticsCard.tsx` | `apps/web-app/src/components/dashboard/analytics-card.tsx` |
| `apps/web-app/src/components/dashboard/refactored/DashboardEmptyState.tsx` | `apps/web-app/src/components/dashboard/refactored/dashboard-empty-state.tsx` |
| `apps/web-app/src/components/dashboard/refactored/DashboardHeader.tsx` | `apps/web-app/src/components/dashboard/refactored/dashboard-header.tsx` |
| `apps/web-app/src/components/dashboard/refactored/HealthStageBadge.tsx` | `apps/web-app/src/components/dashboard/refactored/health-stage-badge.tsx` |
| `apps/web-app/src/components/dashboard/refactored/QuickActions.tsx` | `apps/web-app/src/components/dashboard/refactored/quick-actions.tsx` |
| `apps/web-app/src/components/dashboard/refactored/RecentApplications.tsx` | `apps/web-app/src/components/dashboard/refactored/recent-applications.tsx` |
| `apps/web-app/src/components/dashboard/refactored/StatGrid.tsx` | `apps/web-app/src/components/dashboard/refactored/stat-grid.tsx` |
| `apps/web-app/src/components/dashboard/PROVIDERAnalytics.tsx` | `apps/web-app/src/components/dashboard/PROVIDER-analytics.tsx` |
| `apps/web-app/src/components/DocumentUploader.tsx` | `apps/web-app/src/components/document-uploader.tsx` |
| `apps/web-app/src/components/FarmLayoutSelector.tsx` | `apps/web-app/src/components/farm-layout-selector.tsx` |
| `apps/web-app/src/components/FormHint.tsx` | `apps/web-app/src/components/form-hint.tsx` |
| `apps/web-app/src/components/InlineDocumentUpload.tsx` | `apps/web-app/src/components/inline-document-upload.tsx` |
| `apps/web-app/src/components/InteractiveMap.tsx` | `apps/web-app/src/components/interactive-map.tsx` |
| `apps/web-app/src/components/layout/MobileBottomNav.tsx` | `apps/web-app/src/components/layout/mobile-bottom-nav.tsx` |
| `apps/web-app/src/components/PlantQRCalculator.tsx` | `apps/web-app/src/components/plant-qr-calculator.tsx` |
| `apps/web-app/src/components/PlantUnitList.tsx` | `apps/web-app/src/components/plant-unit-list.tsx` |
| `apps/web-app/src/components/PurposeSelector.tsx` | `apps/web-app/src/components/purpose-selector.tsx` |
| `apps/web-app/src/components/StrainSelector.tsx` | `apps/web-app/src/components/strain-selector.tsx` |
| `apps/web-app/src/components/traceability/ConsumerFeedbackForm.tsx` | `apps/web-app/src/components/traceability/consumer-feedback-form.tsx` |
| `apps/web-app/src/components/ui/Alert.tsx` | `apps/web-app/src/components/ui/alert.tsx` |
| `apps/web-app/src/components/ui/BackButton.tsx` | `apps/web-app/src/components/ui/back-button.tsx` |
| `apps/web-app/src/components/ui/Badge.tsx` | `apps/web-app/src/components/ui/badge.tsx` |
| `apps/web-app/src/components/ui/BottomNav.tsx` | `apps/web-app/src/components/ui/bottom-nav-legacy.tsx` |
| `apps/web-app/src/components/ui/Card.tsx` | `apps/web-app/src/components/ui/card.tsx` |
| `apps/web-app/src/components/ui/Checkbox.tsx` | `apps/web-app/src/components/ui/checkbox.tsx` |
| `apps/web-app/src/components/ui/DataTable.tsx` | `apps/web-app/src/components/ui/data-table.tsx` |
| `apps/web-app/src/components/ui/DocumentUploadCard.tsx` | `apps/web-app/src/components/ui/document-upload-card.tsx` |
| `apps/web-app/src/components/ui/Input.tsx` | `apps/web-app/src/components/ui/input.tsx` |
| `apps/web-app/src/components/ui/Modal.tsx` | `apps/web-app/src/components/ui/modal.tsx` |
| `apps/web-app/src/components/ui/NotificationBell.tsx` | `apps/web-app/src/components/ui/notification-bell.tsx` |
| `apps/web-app/src/components/ui/PageSkeleton.tsx` | `apps/web-app/src/components/ui/page-skeleton.tsx` |
| `apps/web-app/src/components/ui/Select.tsx` | `apps/web-app/src/components/ui/select.tsx` |
| `apps/web-app/src/components/ui/Skeleton.tsx` | `apps/web-app/src/components/ui/skeleton.tsx` |
| `apps/web-app/src/components/ui/Spinner.tsx` | `apps/web-app/src/components/ui/spinner.tsx` |
| `apps/web-app/src/components/ui/StatusBadge.tsx` | `apps/web-app/src/components/ui/status-badge.tsx` |
| `apps/web-app/src/components/ui/Textarea.tsx` | `apps/web-app/src/components/ui/textarea.tsx` |
| `apps/web-app/src/components/ui/WizardUI.tsx` | `apps/web-app/src/components/ui/wizard-ui.tsx` |
| `apps/web-app/src/components/wizard/AutoSaveIndicator.tsx` | `apps/web-app/src/components/wizard/auto-save-indicator.tsx` |
| `apps/web-app/src/components/wizard/StepDocumentUploader.tsx` | `apps/web-app/src/components/wizard/step-document-uploader.tsx` |
| `apps/web-app/src/components/wizard/WizardNavigation.tsx` | `apps/web-app/src/components/wizard/wizard-navigation.tsx` |
| `apps/web-app/src/components/wizard/WizardStepWrapper.tsx` | `apps/web-app/src/components/wizard/wizard-step-wrapper.tsx` |
| `apps/web-app/src/contexts/ConfigContext.tsx` | `apps/web-app/src/contexts/config-context.tsx` |
| `apps/web-app/src/features/audit-system/README.md` | `apps/web-app/src/features/audit-system/readme.md` |
| `apps/web-app/src/features/permit-form/README.md` | `apps/web-app/src/features/permit-form/readme.md` |
| `apps/web-app/src/features/traceability/README.md` | `apps/web-app/src/features/traceability/readme.md` |
| `apps/web-app/src/hooks/useAuthHealth.ts` | `apps/web-app/src/hooks/use-auth-health.ts` |
| `apps/web-app/src/hooks/useCultivationConfig.ts` | `apps/web-app/src/hooks/use-cultivation-config.ts` |
| `apps/web-app/src/hooks/useGACPData.ts` | `apps/web-app/src/hooks/use-gacp-data.ts` |
| `apps/web-app/src/hooks/useLogin.ts` | `apps/web-app/src/hooks/use-login.ts` |
| `apps/web-app/src/hooks/useMasterData.ts` | `apps/web-app/src/hooks/use-master-data.ts` |
| `apps/web-app/src/hooks/useRegistration.ts` | `apps/web-app/src/hooks/use-registration.ts` |
| `apps/web-app/src/hooks/usePROVIDERDashboard.ts` | `apps/web-app/src/hooks/use-provider-dashboard.ts` |
| `apps/web-app/src/hooks/useSystemConfig.ts` | `apps/web-app/src/hooks/use-system-config.ts` |
| `apps/web-app/src/lib/i18n/LanguageContext.tsx` | `apps/web-app/src/lib/i18n/language-context.tsx` |
| `apps/web-app/src/lib/roleUtils.ts` | `apps/web-app/src/lib/role-utils.ts` |
| `ARCHITECTURAL_AUDIT_2026.md` | `architectural-audit-2026.md` |
| `ARCHITECTURE.md` | `architecture-legacy.md` |
| `CHANGELOG.md` | `changelog-legacy.md` |
| `CHANGES_SUMMARY.md` | `changes-summary.md` |
| `CODING_RULES.md` | `coding-rules.md` |
| `COMPLETION_SUMMARY_100_PERCENT.md` | `completion-summary-100-percent.md` |
| `DEEP_DIVE_ANALYSIS.md` | `deep-dive-analysis.md` |
| `DEPLOY_MANUAL_COMMANDS.md` | `deploy-manual-commands.md` |
| `DEPLOY_NOW.bat` | `deploy-now.bat` |
| `DEPLOY_STEP_BY_STEP.txt` | `deploy-step-by-step.txt` |
| `DEPLOY_SUMMARY.md` | `deploy-summary.md` |
| `DEPLOY_USING_IP.bat` | `deploy-using-ip.bat` |
| `DEPLOYMENT_CHECKLIST_FINAL.md` | `deployment-checklist-final.md` |
| `DEPLOYMENT_GUIDE.md` | `deployment-guide.md` |
| `DEPLOYMENT.md` | `deployment-legacy.md` |
| `DESIGN_IMPLEMENTATION_SUMMARY.md` | `design-implementation-summary.md` |
| `DESIGN_SYSTEM_AND_REDUX_PLAN.md` | `design-system-and-redux-plan.md` |
| `DOCKER_DEPLOYMENT_GUIDE.md` | `docker-deployment-guide.md` |
| `docs/01_System_Architecture_EN.md` | `docs/01-system-architecture-en.md` |
| `docs/01_System_Architecture_TH.md` | `docs/01-system-architecture-th.md` |
| `docs/02_Business_Workflows_EN.md` | `docs/02-business-workflows-en.md` |
| `docs/02_Business_Workflows_TH.md` | `docs/02-business-workflows-th.md` |
| `docs/03_User_Guide_CheatSheet.md` | `docs/03-user-guide-cheat-sheet.md` |
| `docs/ACTIVE_API_SURFACE.md` | `docs/active-api-surface.md` |
| `docs/API_DOCUMENTATION.md` | `docs/api-documentation.md` |
| `docs/API_PATH_IDENTITY_POLICY.md` | `docs/api-path-identity-policy.md` |
| `docs/APPLICATION_WORKFLOW_CORRECT.md` | `docs/application-workflow-correct.md` |
| `docs/APPLICATION_WORKFLOW_CURRENT.md` | `docs/application-workflow-current.md` |
| `docs/BUSINESS_WORKFLOW.md` | `docs/business-workflow.md` |
| `docs/CHANGES_SUMMARY_SCHEMA_SYNC.md` | `docs/changes-summary-schema-sync.md` |
| `docs/CLEANUP_PHASED_PLAN.md` | `docs/cleanup-phased-plan.md` |
| `docs/CLEANUP_PLAN.md` | `docs/cleanup-plan.md` |
| `docs/CURRENT_SYSTEM_ARCHITECTURE.md` | `docs/current-system-architecture.md` |
| `docs/DEPRECATION_REGISTER.md` | `docs/deprecation-register.md` |
| `docs/DTAM_IMPLEMENTATION_FINAL.md` | `docs/dtam-implementation-final.md` |
| `docs/DTAM_IMPLEMENTATION_PROGRESS.md` | `docs/dtam-implementation-progress.md` |
| `docs/DTAM_IMPLEMENTATION_STATUS.md` | `docs/dtam-implementation-status.md` |
| `docs/DTAM_REQUIREMENTS_ANALYSIS.md` | `docs/dtam-requirements-analysis.md` |
| `docs/ENGINEERING_ROUTE_NAMING.md` | `docs/engineering-route-naming.md` |
| `docs/FINAL_CHANGES.md` | `docs/final-changes.md` |
| `docs/GACP_API_Collection.postman.json` | `docs/gacp-api-collection.postman.json` |
| `docs/GACP_DOCUMENT_REQUIREMENTS_RESEARCH.md` | `docs/gacp-document-requirements-research.md` |
| `docs/IDENTITY_MODEL_EXTERNAL_IDP_ALIGNMENT.md` | `docs/identity-model-external-idp-alignment.md` |
| `docs/IMPLEMENTATION_SUMMARY.md` | `docs/implementation-summary.md` |
| `docs/MEMBERSHIP_SYSTEM_ARCHITECTURE.md` | `docs/membership-system-architecture.md` |
| `docs/MEMBERSHIP_SYSTEM_CURRENT.md` | `docs/membership-system-current.md` |
| `docs/MIGRATION_INSTRUCTIONS.md` | `docs/migration-instructions.md` |
| `docs/OFFICIAL_GACP_REQUIREMENTS_DTAM.md` | `docs/official-gacp-requirements-dtam.md` |
| `docs/OTP_REMOVAL_SUMMARY.md` | `docs/otp-removal-summary.md` |
| `docs/PAYMENT_FIRST_FLOW_IMPLEMENTATION.md` | `docs/payment-first-flow-implementation.md` |
| `docs/PHASE2_QR_TRACKTRACE_SCOPE_PLAN.md` | `docs/phase2-qr-tracktrace-scope-plan.md` |
| `docs/PLANT_DOCUMENT_COMPARISON_MATRIX.md` | `docs/plant-document-comparison-matrix.md` |
| `docs/PLANTING_OPERATION_GUIDE.md` | `docs/planting-operation-guide.md` |
| `docs/PLANTING_RUNTIME_BLUEPRINT.md` | `docs/planting-runtime-blueprint.md` |
| `docs/PLATFORM_URLS.md` | `docs/platform-urls.md` |
| `docs/PRODUCTION_DEPLOYMENT_PLAN.md` | `docs/production-deployment-plan.md` |
| `docs/PRODUCTION_DEPLOYMENT.md` | `docs/production-deployment.md` |
| `docs/README.md` | `docs/readme.md` |
| `docs/REMOVE_OTP_VERIFICATION.md` | `docs/remove-otp-verification.md` |
| `docs/ERP_RBAC_AUDIT_NOTES.md` | `docs/role-access-audit-notes.md` |
| `docs/SCOPE_OF_WORK.md` | `docs/scope-of-work.md` |
| `docs/SECURITY_REVIEW.md` | `docs/security-review.md` |
| `docs/SMART_APPLICATION_FLOW_ANALYSIS.md` | `docs/smart-application-flow-analysis.md` |
| `docs/SMOKE_TEST_EXECUTION_GUIDE.md` | `docs/smoke-test-execution-guide.md` |
| `docs/SMOKE_TEST_PLAN_FULL_WORKFLOW.md` | `docs/smoke-test-plan-full-workflow.md` |
| `docs/SOFTWARE_SAFETY_PLAN.md` | `docs/software-safety-plan.md` |
| `docs/SYSTEM_ANALYSIS_AND_REFINEMENT_PLAN.md` | `docs/system-analysis-and-refinement-plan.md` |
| `docs/SYSTEM_AUDIT_REPORT.md` | `docs/system-audit-report.md` |
| `docs/SYSTEM_MAP.md` | `docs/system-map.md` |
| `docs/TERMINOLOGY_POLICY.md` | `docs/terminology-policy.md` |
| `docs/TRACK_TRACE_PUBLIC_QR_TEST_PLAN.md` | `docs/track-trace-public-qr-test-plan.md` |
| `docs/UAT_CHECKLIST_PLANTING_RUNTIME.md` | `docs/uat-checklist-planting-runtime.md` |
| `DOM_TESTING_GUIDE.md` | `dom-testing-guide.md` |
| `DTAM_REQUIREMENTS_ANALYSIS.md` | `dtam-requirements-analysis.md` |
| `DTAM_SCOPE_AND_LEGAL_PROTECTION.md` | `dtam-scope-and-legal-protection.md` |
| `DTAM_SCOPE_AND_RISK_ASSESSMENT.md` | `dtam-scope-and-risk-assessment.md` |
| `DTAM_SCOPE_QUICK_REFERENCE.md` | `dtam-scope-quick-reference.md` |
| `ELEVATION_SUMMARY.md` | `elevation-summary.md` |
| `EMAIL_SETUP_LATER.md` | `email-setup-later.md` |
| `FINAL_COMPLETION_REPORT.md` | `final-completion-report.md` |
| `FINAL_IMPLEMENTATION_SUMMARY.md` | `final-implementation-summary.md` |
| `FIX_BACKEND.txt` | `fix-backend.txt` |
| `FULL_UAT_CHECKLIST.md` | `full-uat-checklist.md` |
| `HANDOFF.md` | `handoff-legacy.md` |
| `IMPLEMENTATION_FIXES_COMPLETE.md` | `implementation-fixes-complete.md` |
| `IMPLEMENTATION_PHASE_8_COMPLETE.md` | `implementation-phase-8-complete.md` |
| `IMPLEMENTATION_PHASE_9_10_COMPLETE.md` | `implementation-phase-9-10-complete.md` |
| `LOCAL_DEPLOY_GUIDE.md` | `local-deploy-guide.md` |
| `LOCAL_TESTING_GUIDE.md` | `local-testing-guide.md` |
| `NGINX_DEPLOYMENT_GUIDE.md` | `nginx-deployment-guide.md` |
| `PHASE_7_IMPLEMENTATION_COMPLETE.md` | `phase-7-implementation-complete.md` |
| `PHASE_7_READY.md` | `phase-7-ready.md` |
| `PRIORITY_FIX_PLAN.md` | `priority-fix-plan.md` |
| `PRODUCTION_DEPLOYMENT_GUIDE.md` | `production-deployment-guide.md` |
| `QA_DEPLOYMENT_GUIDE.md` | `qa-deployment-guide.md` |
| `QR_CODE_TESTING.md` | `qr-code-testing.md` |
| `QUICK_DEPLOY.txt` | `quick-deploy.txt` |
| `RELEASE_CHECKLIST.md` | `release-checklist.md` |
| `scripts/_erp-test-helpers.js` | `scripts/regression-test-helpers.js` |
| `scripts/README.md` | `scripts/readme.md` |
| `scripts/run-erp-regression-gate.js` | `scripts/run-regression-gate.js` |
| `scripts/test-provider-erp-flow.js` | `scripts/test-provider-regression-flow.js` |
| `scripts/test-PROVIDER-erp-flow.js` | `scripts/test-PROVIDER-regression-flow.js` |
| `scripts/uat/README.md` | `scripts/uat/readme.md` |
| `SECURITY_HARDENING_PLAN.md` | `security-hardening-plan.md` |
| `SECURITY_IMPLEMENTATION_REPORT.md` | `security-implementation-report.md` |
| `SECURITY_QUICK_REFERENCE.md` | `security-quick-reference.md` |
| `SESSION_REPORT.md` | `session-report.md` |
| `SESSION_SUMMARY_SECURITY.md` | `session-summary-security.md` |
| `STRUCTURE_ISSUES_VISUAL.md` | `structure-issues-visual.md` |
| `SYSTEM_AUDIT_REPORT.md` | `system-audit-report.md` |
| `TAILWIND_MIGRATION_PLAN.md` | `tailwind-migration-plan.md` |
| `TAILWIND_SETUP_COMPLETE.md` | `tailwind-setup-complete.md` |
| `TEST_SPECIFICATION_SYSTEM.md` | `test-specification-system.md` |
| `TESTING.md` | `testing-legacy.md` |
| `TESTSPRITE_FULL_SUITE_GUIDE.md` | `testsprite-full-suite-guide.md` |
| `TESTSPRITE_GUIDE.md` | `testsprite-guide.md` |
| `UAT_REPORT_FINAL.md` | `uat-report-final.md` |
| `UAT_TEST_PLAN.md` | `uat-test-plan.md` |
| `UX_IMPROVEMENT_PLAN.md` | `ux-improvement-plan.md` |
| `WORK_COMPLETION_SUMMARY.md` | `work-completion-summary.md` |

## Remaining Violations

### A) Tooling-constrained exceptions (kept intentionally)

| Path | Reason | Proposed compliant path |
|---|---|---|
| `.agent/skills/agent-browser/SKILL.md` | uppercase characters in path segment(s) | `.agent/skills/agent-browser/skill.md` |
| `.agent/skills/find-skills/SKILL.md` | uppercase characters in path segment(s) | `.agent/skills/find-skills/skill.md` |
| `.agent/skills/frontend-design/LICENSE.txt` | uppercase characters in path segment(s) | `.agent/skills/frontend-design/license.txt` |
| `.agent/skills/frontend-design/SKILL.md` | uppercase characters in path segment(s) | `.agent/skills/frontend-design/skill.md` |
| `.agent/skills/remembering-conversations/MCP-TOOLS.md` | uppercase characters in path segment(s) | `.agent/skills/remembering-conversations/mcp-tools.md` |
| `.agent/skills/remembering-conversations/SKILL.md` | uppercase characters in path segment(s) | `.agent/skills/remembering-conversations/skill.md` |
| `.agent/skills/ui-ux-pro-max/SKILL.md` | uppercase characters in path segment(s) | `.agent/skills/ui-ux-pro-max/skill.md` |
| `.agent/skills/vercel-composition-patterns/AGENTS.md` | uppercase characters in path segment(s) | `.agent/skills/vercel-composition-patterns/agents.md` |
| `.agent/skills/vercel-composition-patterns/SKILL.md` | uppercase characters in path segment(s) | `.agent/skills/vercel-composition-patterns/skill.md` |
| `.agent/skills/web-design-guidelines/SKILL.md` | uppercase characters in path segment(s) | `.agent/skills/web-design-guidelines/skill.md` |
| `.agents/skills/agent-browser/SKILL.md` | uppercase characters in path segment(s) | `.agents/skills/agent-browser/skill.md` |
| `.agents/skills/find-skills/SKILL.md` | uppercase characters in path segment(s) | `.agents/skills/find-skills/skill.md` |
| `.agents/skills/frontend-design/LICENSE.txt` | uppercase characters in path segment(s) | `.agents/skills/frontend-design/license.txt` |
| `.agents/skills/frontend-design/SKILL.md` | uppercase characters in path segment(s) | `.agents/skills/frontend-design/skill.md` |
| `.agents/skills/remembering-conversations/MCP-TOOLS.md` | uppercase characters in path segment(s) | `.agents/skills/remembering-conversations/mcp-tools.md` |
| `.agents/skills/remembering-conversations/SKILL.md` | uppercase characters in path segment(s) | `.agents/skills/remembering-conversations/skill.md` |
| `.agents/skills/ui-ux-pro-max/SKILL.md` | uppercase characters in path segment(s) | `.agents/skills/ui-ux-pro-max/skill.md` |
| `.agents/skills/vercel-composition-patterns/AGENTS.md` | uppercase characters in path segment(s) | `.agents/skills/vercel-composition-patterns/agents.md` |
| `.agents/skills/vercel-composition-patterns/SKILL.md` | uppercase characters in path segment(s) | `.agents/skills/vercel-composition-patterns/skill.md` |
| `.agents/skills/vercel-react-best-practices/AGENTS.md` | uppercase characters in path segment(s) | `.agents/skills/vercel-react-best-practices/agents.md` |
| `.agents/skills/vercel-react-best-practices/SKILL.md` | uppercase characters in path segment(s) | `.agents/skills/vercel-react-best-practices/skill.md` |
| `.agents/skills/web-design-guidelines/SKILL.md` | uppercase characters in path segment(s) | `.agents/skills/web-design-guidelines/skill.md` |
| `README.md` | uppercase characters in path segment(s) | `readme.md` |
| `apps/backend/Dockerfile` | uppercase characters in path segment(s) | `apps/backend/dockerfile` |
| `apps/mobile-app/README.md` | uppercase characters in path segment(s) | `apps/mobile-app/readme.md` |
| `apps/mobile-app/android/app/src/debug/AndroidManifest.xml` | uppercase characters in path segment(s) | `apps/mobile-app/android/app/src/debug/android-manifest.xml` |
| `apps/mobile-app/android/app/src/main/AndroidManifest.xml` | uppercase characters in path segment(s) | `apps/mobile-app/android/app/src/main/android-manifest.xml` |
| `apps/mobile-app/android/app/src/main/kotlin/com/example/mobile_app/MainActivity.kt` | uppercase characters in path segment(s) | `apps/mobile-app/android/app/src/main/kotlin/com/example/mobile_app/main-activity.kt` |
| `apps/mobile-app/android/app/src/profile/AndroidManifest.xml` | uppercase characters in path segment(s) | `apps/mobile-app/android/app/src/profile/android-manifest.xml` |
| `apps/mobile-app/ios/Flutter/AppFrameworkInfo.plist` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Flutter/app-framework-info.plist` |
| `apps/mobile-app/ios/Flutter/Debug.xcconfig` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Flutter/debug.xcconfig` |
| `apps/mobile-app/ios/Flutter/Release.xcconfig` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Flutter/release.xcconfig` |
| `apps/mobile-app/ios/Runner.xcodeproj/project.pbxproj` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner.xcodeproj/project.pbxproj` |
| `apps/mobile-app/ios/Runner.xcodeproj/project.xcworkspace/contents.xcworkspacedata` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner.xcodeproj/project.xcworkspace/contents.xcworkspacedata` |
| `apps/mobile-app/ios/Runner.xcodeproj/project.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner.xcodeproj/project.xcworkspace/xcshareddata/ideworkspace-checks.plist` |
| `apps/mobile-app/ios/Runner.xcodeproj/project.xcworkspace/xcshareddata/WorkspaceSettings.xcsettings` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner.xcodeproj/project.xcworkspace/xcshareddata/workspace-settings.xcsettings` |
| `apps/mobile-app/ios/Runner.xcodeproj/xcshareddata/xcschemes/Runner.xcscheme` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner.xcodeproj/xcshareddata/xcschemes/runner.xcscheme` |
| `apps/mobile-app/ios/Runner.xcworkspace/contents.xcworkspacedata` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner.xcworkspace/contents.xcworkspacedata` |
| `apps/mobile-app/ios/Runner.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner.xcworkspace/xcshareddata/ideworkspace-checks.plist` |
| `apps/mobile-app/ios/Runner.xcworkspace/xcshareddata/WorkspaceSettings.xcsettings` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner.xcworkspace/xcshareddata/workspace-settings.xcsettings` |
| `apps/mobile-app/ios/Runner/AppDelegate.swift` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/app-delegate.swift` |
| `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/contents.json` |
| `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/icon-app-1024x1024-1x.png` |
| `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@1x.png` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/icon-app-20x20-1x.png` |
| `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@2x.png` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/icon-app-20x20-2x.png` |
| `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@3x.png` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/icon-app-20x20-3x.png` |
| `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@1x.png` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/icon-app-29x29-1x.png` |
| `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@2x.png` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/icon-app-29x29-2x.png` |
| `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@3x.png` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/icon-app-29x29-3x.png` |
| `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@1x.png` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/icon-app-40x40-1x.png` |
| `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@2x.png` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/icon-app-40x40-2x.png` |
| `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@3x.png` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/icon-app-40x40-3x.png` |
| `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@2x.png` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/icon-app-60x60-2x.png` |
| `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@3x.png` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/icon-app-60x60-3x.png` |
| `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-76x76@1x.png` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/icon-app-76x76-1x.png` |
| `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-76x76@2x.png` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/icon-app-76x76-2x.png` |
| `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-83.5x83.5@2x.png` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/Assets.xcassets/AppIcon.appiconset/icon-app-83-5x83-5-2x.png` |
| `apps/mobile-app/ios/Runner/Assets.xcassets/LaunchImage.imageset/Contents.json` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/Assets.xcassets/LaunchImage.imageset/contents.json` |
| `apps/mobile-app/ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage.png` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/Assets.xcassets/LaunchImage.imageset/launch-image.png` |
| `apps/mobile-app/ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage@2x.png` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/Assets.xcassets/LaunchImage.imageset/launch-image-2x.png` |
| `apps/mobile-app/ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage@3x.png` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/Assets.xcassets/LaunchImage.imageset/launch-image-3x.png` |
| `apps/mobile-app/ios/Runner/Assets.xcassets/LaunchImage.imageset/README.md` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/Assets.xcassets/LaunchImage.imageset/readme.md` |
| `apps/mobile-app/ios/Runner/Base.lproj/LaunchScreen.storyboard` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/Base.lproj/launch-screen.storyboard` |
| `apps/mobile-app/ios/Runner/Base.lproj/Main.storyboard` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/Base.lproj/main.storyboard` |
| `apps/mobile-app/ios/Runner/Info.plist` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/info.plist` |
| `apps/mobile-app/ios/Runner/Runner-Bridging-Header.h` | uppercase characters in path segment(s) | `apps/mobile-app/ios/Runner/runner-bridging-header.h` |
| `apps/mobile-app/ios/RunnerTests/RunnerTests.swift` | uppercase characters in path segment(s) | `apps/mobile-app/ios/RunnerTests/runner-tests.swift` |
| `apps/mobile-app/lib/generated/api/auth_health/.openapi-generator/FILES` | uppercase characters in path segment(s) | `apps/mobile-app/lib/generated/api/auth_health/.openapi-generator/files` |
| `apps/mobile-app/lib/generated/api/auth_health/.openapi-generator/VERSION` | uppercase characters in path segment(s) | `apps/mobile-app/lib/generated/api/auth_health/.openapi-generator/version` |
| `apps/mobile-app/lib/generated/api/auth_health/README.md` | uppercase characters in path segment(s) | `apps/mobile-app/lib/generated/api/auth_health/readme.md` |
| `apps/mobile-app/lib/generated/api/auth_health/doc/AuthenticationApi.md` | uppercase characters in path segment(s) | `apps/mobile-app/lib/generated/api/auth_health/doc/authentication-api.md` |
| `apps/mobile-app/lib/generated/api/auth_health/doc/ErrorResponse.md` | uppercase characters in path segment(s) | `apps/mobile-app/lib/generated/api/auth_health/doc/error-response.md` |
| `apps/mobile-app/lib/generated/api/auth_health/doc/LoginRequest.md` | uppercase characters in path segment(s) | `apps/mobile-app/lib/generated/api/auth_health/doc/login-request.md` |
| `apps/mobile-app/lib/generated/api/auth_health/doc/LoginResponse.md` | uppercase characters in path segment(s) | `apps/mobile-app/lib/generated/api/auth_health/doc/login-response.md` |
| `apps/mobile-app/lib/generated/api/auth_health/doc/LoginResponseData.md` | uppercase characters in path segment(s) | `apps/mobile-app/lib/generated/api/auth_health/doc/login-response-data.md` |
| `apps/mobile-app/lib/generated/api/auth_health/doc/RegisterRequest.md` | uppercase characters in path segment(s) | `apps/mobile-app/lib/generated/api/auth_health/doc/register-request.md` |
| `apps/mobile-app/lib/generated/api/auth_health/doc/RegisterResponse.md` | uppercase characters in path segment(s) | `apps/mobile-app/lib/generated/api/auth_health/doc/register-response.md` |
| `apps/mobile-app/lib/generated/api/auth_health/doc/RegisterResponseData.md` | uppercase characters in path segment(s) | `apps/mobile-app/lib/generated/api/auth_health/doc/register-response-data.md` |
| `apps/mobile-app/lib/generated/api/auth_health/doc/RequestPasswordResetRequest.md` | uppercase characters in path segment(s) | `apps/mobile-app/lib/generated/api/auth_health/doc/request-password-reset-request.md` |
| `apps/mobile-app/lib/generated/api/auth_health/doc/ResetPasswordRequest.md` | uppercase characters in path segment(s) | `apps/mobile-app/lib/generated/api/auth_health/doc/reset-password-request.md` |
| `apps/mobile-app/lib/generated/api/auth_health/doc/UpdateProfileRequest.md` | uppercase characters in path segment(s) | `apps/mobile-app/lib/generated/api/auth_health/doc/update-profile-request.md` |
| `apps/mobile-app/linux/CMakeLists.txt` | uppercase characters in path segment(s) | `apps/mobile-app/linux/cmake-lists.txt` |
| `apps/mobile-app/linux/flutter/CMakeLists.txt` | uppercase characters in path segment(s) | `apps/mobile-app/linux/flutter/cmake-lists.txt` |
| `apps/mobile-app/linux/runner/CMakeLists.txt` | uppercase characters in path segment(s) | `apps/mobile-app/linux/runner/cmake-lists.txt` |
| `apps/mobile-app/macos/Flutter/Flutter-Debug.xcconfig` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Flutter/flutter-debug.xcconfig` |
| `apps/mobile-app/macos/Flutter/Flutter-Release.xcconfig` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Flutter/flutter-release.xcconfig` |
| `apps/mobile-app/macos/Flutter/GeneratedPluginRegistrant.swift` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Flutter/generated-plugin-registrant.swift` |
| `apps/mobile-app/macos/Runner.xcodeproj/project.pbxproj` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Runner.xcodeproj/project.pbxproj` |
| `apps/mobile-app/macos/Runner.xcodeproj/project.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Runner.xcodeproj/project.xcworkspace/xcshareddata/ideworkspace-checks.plist` |
| `apps/mobile-app/macos/Runner.xcodeproj/xcshareddata/xcschemes/Runner.xcscheme` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Runner.xcodeproj/xcshareddata/xcschemes/runner.xcscheme` |
| `apps/mobile-app/macos/Runner.xcworkspace/contents.xcworkspacedata` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Runner.xcworkspace/contents.xcworkspacedata` |
| `apps/mobile-app/macos/Runner.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Runner.xcworkspace/xcshareddata/ideworkspace-checks.plist` |
| `apps/mobile-app/macos/Runner/AppDelegate.swift` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Runner/app-delegate.swift` |
| `apps/mobile-app/macos/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Runner/Assets.xcassets/AppIcon.appiconset/contents.json` |
| `apps/mobile-app/macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_1024.png` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Runner/Assets.xcassets/AppIcon.appiconset/app-icon-1024.png` |
| `apps/mobile-app/macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_128.png` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Runner/Assets.xcassets/AppIcon.appiconset/app-icon-128.png` |
| `apps/mobile-app/macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_16.png` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Runner/Assets.xcassets/AppIcon.appiconset/app-icon-16.png` |
| `apps/mobile-app/macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_256.png` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Runner/Assets.xcassets/AppIcon.appiconset/app-icon-256.png` |
| `apps/mobile-app/macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_32.png` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Runner/Assets.xcassets/AppIcon.appiconset/app-icon-32.png` |
| `apps/mobile-app/macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_512.png` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Runner/Assets.xcassets/AppIcon.appiconset/app-icon-512.png` |
| `apps/mobile-app/macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_64.png` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Runner/Assets.xcassets/AppIcon.appiconset/app-icon-64.png` |
| `apps/mobile-app/macos/Runner/Base.lproj/MainMenu.xib` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Runner/Base.lproj/main-menu.xib` |
| `apps/mobile-app/macos/Runner/Configs/AppInfo.xcconfig` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Runner/Configs/app-info.xcconfig` |
| `apps/mobile-app/macos/Runner/Configs/Debug.xcconfig` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Runner/Configs/debug.xcconfig` |
| `apps/mobile-app/macos/Runner/Configs/Release.xcconfig` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Runner/Configs/release.xcconfig` |
| `apps/mobile-app/macos/Runner/Configs/Warnings.xcconfig` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Runner/Configs/warnings.xcconfig` |
| `apps/mobile-app/macos/Runner/DebugProfile.entitlements` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Runner/debug-profile.entitlements` |
| `apps/mobile-app/macos/Runner/Info.plist` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Runner/info.plist` |
| `apps/mobile-app/macos/Runner/MainFlutterWindow.swift` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Runner/main-flutter-window.swift` |
| `apps/mobile-app/macos/Runner/Release.entitlements` | uppercase characters in path segment(s) | `apps/mobile-app/macos/Runner/release.entitlements` |
| `apps/mobile-app/macos/RunnerTests/RunnerTests.swift` | uppercase characters in path segment(s) | `apps/mobile-app/macos/RunnerTests/runner-tests.swift` |
| `apps/mobile-app/web/icons/Icon-192.png` | uppercase characters in path segment(s) | `apps/mobile-app/web/icons/icon-192.png` |
| `apps/mobile-app/web/icons/Icon-512.png` | uppercase characters in path segment(s) | `apps/mobile-app/web/icons/icon-512.png` |
| `apps/mobile-app/web/icons/Icon-maskable-192.png` | uppercase characters in path segment(s) | `apps/mobile-app/web/icons/icon-maskable-192.png` |
| `apps/mobile-app/web/icons/Icon-maskable-512.png` | uppercase characters in path segment(s) | `apps/mobile-app/web/icons/icon-maskable-512.png` |
| `apps/mobile-app/windows/CMakeLists.txt` | uppercase characters in path segment(s) | `apps/mobile-app/windows/cmake-lists.txt` |
| `apps/mobile-app/windows/flutter/CMakeLists.txt` | uppercase characters in path segment(s) | `apps/mobile-app/windows/flutter/cmake-lists.txt` |
| `apps/mobile-app/windows/runner/CMakeLists.txt` | uppercase characters in path segment(s) | `apps/mobile-app/windows/runner/cmake-lists.txt` |
| `apps/mobile-app/windows/runner/Runner.rc` | uppercase characters in path segment(s) | `apps/mobile-app/windows/runner/runner.rc` |
| `apps/web-app/Dockerfile` | uppercase characters in path segment(s) | `apps/web-app/dockerfile` |
| `apps/web-app/README.md` | uppercase characters in path segment(s) | `apps/web-app/readme.md` |
| `nginx/ssl/README.md` | uppercase characters in path segment(s) | `nginx/ssl/readme.md` |
| `nginx/ssl/README.txt` | uppercase characters in path segment(s) | `nginx/ssl/readme.txt` |
| `openapi/README.md` | uppercase characters in path segment(s) | `openapi/readme.md` |

### B) Active violations (should be zero)

| Path | Reason | Proposed compliant path |
|---|---|---|
| _none_ | - | - |

## Verification Commands and Results

| Command | Result |
|---|---|
| `pnpm --dir apps/web-app build` | pass |
| `pnpm --dir apps/web-app run test -- --runInBand --passWithNoTests` | pass (2 suites / 17 tests) |
| `pnpm --dir apps/backend run test -- --passWithNoTests --ci --forceExit` | pass (31 suites / 318 tests) |
| `pnpm --dir apps/web-app lint` | pass with warnings only |

## Final verification update (2026-02-16)

- Re-ran naming scan on `git ls-files`:
  - uppercase path segments: `124` (platform/tooling constrained set only)
  - spaces: `0`
  - invalid parentheses outside `app/(...)` route groups: `0`
  - forbidden token names (`wallet|erp|sap|crm|bank|kbank|truemoney|paotang`): `0`
- Re-ran production and regression gates:
  - `pnpm --dir apps/web-app build` ✅
  - `pnpm --dir apps/web-app lint` ✅ (warnings only, no errors)
  - `pnpm --dir apps/web-app run test -- --runInBand --passWithNoTests` ✅
  - `pnpm --dir apps/backend run test -- --passWithNoTests --ci --forceExit` ✅
  - `node scripts/run-regression-gate.js` ✅
