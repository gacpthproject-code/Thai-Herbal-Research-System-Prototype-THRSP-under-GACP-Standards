<!-- สร้างโดย scripts/docs/generate-architecture-diagrams.js ห้ามแก้ด้วยมือ -->

# แผนภาพข้อมูลตามกลุ่มโดเมน

ที่มา: `apps/backend/prisma/schema/*.prisma` · การจัดกลุ่ม: ตาราง arch:model-groups ใน `docs/architecture/README.md` · ในกล่องแสดงเฉพาะคีย์หลัก (PK) · เส้น = foreign key (ฝั่งที่มี `@relation(fields:)`)

## ความสัมพันธ์ข้ามกลุ่ม

```mermaid
flowchart LR
  g0["ผู้ใช้และตัวตน (7)"]
  g1["องค์กรและผู้ถือใบรับรอง (6)"]
  g2["คำขอและเอกสาร (14)"]
  g3["การตรวจและคิวงาน (11)"]
  g4["ใบรับรองและมาตรฐาน (8)"]
  g5["การเงินและบัญชี (17)"]
  g6["ฟาร์ม การปลูก และการสืบย้อน (28)"]
  g7["แบบสำรวจและวิจัย (5)"]
  g8["ระบบ (12)"]
  g3 -->|3| g2
  g3 -->|5| g0
  g3 -->|1| g6
  g3 -->|7| g1
  g5 -->|5| g2
  g5 -->|1| g0
  g5 -->|8| g1
  g2 -->|8| g0
  g2 -->|1| g8
  g2 -->|12| g1
  g2 -->|1| g4
  g0 -->|5| g1
  g6 -->|1| g0
  g6 -->|25| g1
  g6 -->|3| g4
  g8 -->|2| g2
  g8 -->|5| g0
  g8 -->|6| g1
  g8 -->|1| g4
  g1 -->|4| g0
  g7 -->|5| g1
  g4 -->|1| g2
  g4 -->|1| g0
  g4 -->|1| g6
  g4 -->|2| g1
```

## ผู้ใช้และตัวตน

```mermaid
erDiagram
  User {
    String id PK
  }
  UserConsent {
    String id PK
  }
  UserConsentEvent {
    String id PK
  }
  IdentityLink {
    String id PK
  }
  RoleGroup {
    String id PK
  }
  UserGroupMembership {
    String userId PK
    String groupId PK
  }
  UserPermissionGrant {
    String userId PK
    String permission PK
  }
  User ||--o{ UserConsent : user
  User ||--o{ UserConsentEvent : user
  User ||--o{ IdentityLink : user
  User ||--o{ UserGroupMembership : user
  RoleGroup ||--o{ UserGroupMembership : group
  User ||--o{ UserPermissionGrant : user
```

## องค์กรและผู้ถือใบรับรอง

```mermaid
erDiagram
  Organization {
    String id PK
  }
  Entity {
    String id PK
  }
  EntityMembership {
    String id PK
  }
  EntityMemberPermissionGrant {
    String membershipId PK
    String permission PK
  }
  EntityMembershipEvent {
    String id PK
  }
  EntityContextSwitch {
    String id PK
  }
  Entity ||--o{ EntityContextSwitch : fromEntity
  Entity ||--o{ EntityContextSwitch : toEntity
  Organization ||--o{ EntityContextSwitch : organization
  EntityMembership ||--o{ EntityMemberPermissionGrant : membership
  Organization ||--o{ EntityMemberPermissionGrant : organization
  Entity ||--o{ EntityMembershipEvent : entity
  Organization ||--o{ EntityMembershipEvent : organization
  Organization ||--o{ Entity : organization
  Entity ||--o{ EntityMembership : entity
  Organization ||--o{ EntityMembership : organization
```

## คำขอและเอกสาร

```mermaid
erDiagram
  Application {
    String id PK
  }
  ApplicationComment {
    String id PK
  }
  ApplicationDraft {
    String id PK
  }
  ApplicationBundle {
    String id PK
  }
  ApplicationDocument {
    String id PK
  }
  ApplicationDocumentReview {
    String id PK
  }
  Attachment {
    String id PK
  }
  CorrectionRound {
    String id PK
  }
  CorrectionSubmissionVersion {
    String id PK
  }
  DocumentPrecheck {
    String id PK
  }
  DocumentPrecheckFlag {
    String id PK
  }
  RequirementRule {
    String id PK
  }
  RevisionDeadline {
    String id PK
  }
  WaiverReopenRequest {
    String id PK
  }
  Application ||--o{ ApplicationDocumentReview : application
  DocumentPrecheck ||--o{ ApplicationDocumentReview : precheck
  Application ||--o{ ApplicationDocument : application
  ApplicationDocument ||--o{ ApplicationDocument : supersededBy
  ApplicationBundle ||--o{ Application : bundle
  Application ||--o{ ApplicationComment : application
  Application ||--o{ RevisionDeadline : application
  Application ||--o{ CorrectionRound : application
  Application ||--o{ CorrectionSubmissionVersion : application
  Application ||--o{ DocumentPrecheck : application
  DocumentPrecheck ||--o{ DocumentPrecheckFlag : precheck
  Application ||--o{ WaiverReopenRequest : application
```

## การตรวจและคิวงาน

```mermaid
erDiagram
  FarmAuditChecklistItem {
    String id PK
  }
  FarmAuditPhoto {
    String id PK
  }
  GpsVerificationLog {
    String id PK
  }
  AuditScopeResult {
    String id PK
  }
  PostAuditTask {
    String id PK
  }
  AuditChecklist {
    String id PK
  }
  SiteAnalysis {
    String id PK
  }
  WorkActivity {
    String id PK
  }
  StageActivityConfig {
    String id PK
  }
  SlaPolicy {
    String id PK
  }
  AssignmentLedgerEntry {
    String id PK
  }
  AuditChecklist ||--o{ FarmAuditChecklistItem : audit
  AuditChecklist ||--o{ FarmAuditPhoto : audit
  FarmAuditChecklistItem ||--o{ FarmAuditPhoto : checklistItem
  AuditChecklist ||--o{ AuditScopeResult : audit
```

## ใบรับรองและมาตรฐาน

```mermaid
erDiagram
  Certificate {
    String id PK
  }
  CertificateScope {
    String id PK
  }
  CertificateRevision {
    String id PK
  }
  CertificationStandard {
    String id PK
  }
  StandardRequirement {
    String id PK
  }
  SupplementaryCriterion {
    String id PK
  }
  CertificateValidityRule {
    String id PK
  }
  BlockedCertificateNumber {
    Int year PK
    Int number PK
  }
  CertificationStandard ||--o{ Certificate : certStandard
  Certificate ||--o{ CertificateScope : certificate
  Certificate ||--o{ CertificateRevision : certificate
  CertificationStandard ||--o{ StandardRequirement : standard
```

## การเงินและบัญชี

```mermaid
erDiagram
  Invoice {
    String id PK
  }
  InvoiceLineItem {
    String id PK
  }
  PaymentTransaction {
    String id PK
  }
  BankAccount {
    String id PK
  }
  JournalEntry {
    String id PK
  }
  JournalLine {
    String id PK
  }
  ReceiptSequence {
    String id PK
  }
  Quotation {
    String id PK
  }
  CreditNote {
    String id PK
  }
  DebitNote {
    String id PK
  }
  ManualJournalEntryDraft {
    String id PK
  }
  PeriodClose {
    String id PK
  }
  PurchaseInvoice {
    String id PK
  }
  CheckoutOrder {
    String id PK
  }
  StripeWebhookEvent {
    String id PK
  }
  PaymentReminderLog {
    String id PK
  }
  CheckoutDocument {
    String id PK
  }
  PaymentTransaction ||--o{ Invoice : paymentTransaction
  Invoice ||--o{ InvoiceLineItem : invoice
  JournalEntry ||--o{ JournalLine : entry
  Invoice ||--o{ CreditNote : originalInvoice
  Invoice ||--o{ DebitNote : originalInvoice
  Invoice ||--o{ CheckoutOrder : invoice
  PaymentTransaction ||--o{ CheckoutOrder : paymentTransaction
  CheckoutOrder ||--o{ CheckoutDocument : checkoutOrder
```

## ฟาร์ม การปลูก และการสืบย้อน

```mermaid
erDiagram
  Farm {
    String id PK
  }
  Plot {
    String id PK
  }
  TrainingRecord {
    String id PK
  }
  WaterSource {
    String id PK
  }
  GrowingMedium {
    String id PK
  }
  SeedSource {
    String id PK
  }
  FertilizerRecord {
    String id PK
  }
  ControlledEnvironment {
    String id PK
  }
  PlantingCycle {
    String id PK
  }
  PlantingCyclePlot {
    String id PK
  }
  CareLog {
    String id PK
  }
  CultivationLog {
    String id PK
  }
  HarvestBatch {
    String id PK
  }
  DryingTemperature {
    String id PK
  }
  DryingHumidity {
    String id PK
  }
  DryingDarkRoom {
    String id PK
  }
  CuringProcess {
    String id PK
  }
  PackagingDetail {
    String id PK
  }
  DryingProcess {
    String id PK
  }
  BatchLabResult {
    String id PK
  }
  Lot {
    String id PK
  }
  TraceQrSecurity {
    String id PK
  }
  TraceQrScan {
    String id PK
  }
  ConsumerFeedback {
    String id PK
  }
  PlantSpecies {
    String id PK
  }
  PartnerAccessLog {
    String id PK
  }
  HerbSpecies {
    String id PK
  }
  HerbKnowledgeEntry {
    String id PK
  }
  HarvestBatch ||--o{ BatchLabResult : harvestBatch
  Farm ||--o{ PlantingCycle : farm
  PlantSpecies ||--o{ PlantingCycle : plantSpecies
  Plot ||--o{ PlantingCycle : plot
  PlantingCycle ||--o{ PlantingCyclePlot : cycle
  Plot ||--o{ PlantingCyclePlot : plot
  PlantingCycle ||--o{ CareLog : cycle
  PlantingCycle ||--o{ CultivationLog : cycle
  Plot ||--o{ CultivationLog : plot
  Farm ||--o{ TrainingRecord : farm
  Farm ||--o{ Plot : farm
  Plot ||--o{ WaterSource : plot
  PlantingCycle ||--o{ GrowingMedium : cycle
  PlantingCycle ||--o{ SeedSource : cycle
  PlantingCycle ||--o{ FertilizerRecord : cycle
  Plot ||--o{ ControlledEnvironment : plot
  PlantingCycle ||--o{ HarvestBatch : cycle
  Farm ||--o{ HarvestBatch : farm
  PlantSpecies ||--o{ HarvestBatch : plant
  Farm ||--o{ DryingTemperature : farm
  Farm ||--o{ DryingHumidity : farm
  Farm ||--o{ DryingDarkRoom : farm
  Farm ||--o{ CuringProcess : farm
  HarvestBatch ||--o{ PackagingDetail : batch
  PlantingCycle ||--o{ DryingProcess : cycle
  HarvestBatch ||--o{ DryingProcess : batch
  HerbSpecies ||--o{ HerbKnowledgeEntry : species
  HarvestBatch ||--o{ Lot : batch
  TraceQrSecurity ||--o{ TraceQrScan : qrSecurity
```

## แบบสำรวจและวิจัย

```mermaid
erDiagram
  SurveyTemplate {
    String id PK
  }
  SurveyQuestion {
    String id PK
  }
  SurveyResponse {
    String id PK
  }
  SurveyAnswer {
    String id PK
  }
  ExpertInterview {
    String id PK
  }
  SurveyTemplate ||--o{ SurveyQuestion : template
  SurveyTemplate ||--o{ SurveyResponse : template
  SurveyResponse ||--o{ SurveyAnswer : response
  SurveyQuestion ||--o{ SurveyAnswer : question
```

## ระบบ

```mermaid
erDiagram
  AuditLog {
    String id PK
  }
  Notification {
    String id PK
  }
  SystemConfig {
    String key PK
  }
  WizardStepConfig {
    String id PK
  }
  DocumentTemplate {
    String id PK
  }
  ReportSubmission {
    String id PK
  }
  SOPDocument {
    String id PK
  }
  ScopeOfWork {
    String id PK
  }
  MeetingRoom {
    String id PK
  }
  SpecialHoliday {
    String id PK
  }
  Ticket {
    String id PK
  }
  TicketMessage {
    String id PK
  }
  Ticket ||--o{ TicketMessage : ticket
```
