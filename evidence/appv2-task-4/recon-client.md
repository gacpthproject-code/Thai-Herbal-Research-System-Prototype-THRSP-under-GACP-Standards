## 1. House pattern for a typed service client

**Wrapper:** every client in `src/lib/services/` goes through the singleton `apiClient` in `apps/web-app/src/lib/api/api-client.ts`. No client calls bare `fetch` for JSON (only two blob/download paths do: `certificate-service.ts:137` and `apiClient.getBlob` at `api-client.ts:564`).

**Method signatures** (`api-client.ts:529-559`, verbatim):
```ts
async get<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>>
async post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>>
async put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>>
async patch<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>>
async delete<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>>
async getBlob(endpoint: string, options?: RequestOptions): Promise<Blob | null>
```

**Envelope type** (`api-client.ts:32-65`):
```ts
export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;      // Thai, already user-friendly (toUserFriendlyError)
    message?: string;
    code?: string;       // raw backend identifier, captured BEFORE the Thai rewrite
    meta?: Record<string, unknown>;  // sibling fields alongside `data`
    status?: number;     // HTTP status, set on error responses only
}
```
`RequestOptions` (`api-client.ts:120-130`) = `Omit<RequestInit,'body'>` plus `body?: unknown`, `skipAuth?: boolean`, `timeout?: number`, `suppressAuthRedirect?: boolean`.

**Unwrapping — yes, and this is the single most load-bearing fact for T4.** `api-client.ts:501-505`:
```ts
const meta = extractEnvelopeMeta(data);
return {
    success: true,
    data: ((data as Record<string, unknown>)?.data ?? data) as T,
    ...(meta !== undefined ? { meta } : {}),
};
```
So for the planned route body `{ success:true, data:{ dims, slots, missingRequired, complete } }`, `apiClient.get<RequirementsPayload>(...)` returns `res.data === { dims, slots, missingRequired, complete }`. Declare `get<RequirementsPayload>`, **not** `get<{data: RequirementsPayload}>`.

**Path handling** (`api-client.ts:302-312`): an endpoint not starting with `http` and not starting with `/api` is auto-prefixed with `/api`. Both spellings exist in the codebase (`'/applications/draft-documents'` in `draft-document-upload.ts:28` vs `'/api/pdpa/erasure/request'` in `pdpa-erasure-service.ts:73`). Either works; the services directory leans to the unprefixed form.

**Error handling — the wrapper never throws.** Non-2xx returns `{success:false, error, status, code?, meta?}` (`:473-479`); network/abort return `{success:false, error:'Request timeout…'|'Unable to connect to server'}` (`:506-523`); a 200 with an unparseable body returns `{success:false, error:'Invalid server response'}` (`:482-487`). A 401 on a non-auth endpoint clears the session and hard-redirects to login (`:384-405`) unless `suppressAuthRedirect: true` is passed.

Two client styles exist, both live:
- **envelope-tolerant** (dominant, and what T4 should copy given T6/T9 render error strips): return the `ApiResponse` unchanged — `pdpa-erasure-service.ts`, `application-service.ts`, `planting-service.ts:66-68`.
- **throw-on-failure**: `subscription-service.ts:78-84` — `if (!res.success || !res.data) throw new Error(res.error || '…'); return res.data;`. Note the plan's stated FE signature `fetchApplicationRequirements(appId): Promise<RequirementsPayload>` (plan line 284) is the *throwing* shape.

**Complete small client, end to end** — `apps/web-app/src/lib/services/pdpa-erasure-service.ts` (105 lines; header comment trimmed):
```ts
import { apiClient, type ApiResponse } from '@/lib/api/api-client';

export interface RequestErasureResponse {
    requestId: string;
    expiresAt: string;
    _testToken?: string;
}
export interface ErasureSummary { /* … */ }
export interface CancelErasureResponse { ok: boolean; requestId: string; status: string; }

export const PdpaErasureService = {
    async requestErasure(
        params: { reason?: string } = {},
    ): Promise<ApiResponse<RequestErasureResponse>> {
        const body: { reason?: string } = {};
        if (typeof params.reason === 'string' && params.reason.trim().length > 0) {
            body.reason = params.reason;
        }
        return apiClient.post<RequestErasureResponse>('/api/pdpa/erasure/request', body);
    },

    async confirmErasure(
        params: { requestId: string; token: string },
    ): Promise<ApiResponse<ErasureSummary>> {
        return apiClient.post<ErasureSummary>('/api/pdpa/erasure/confirm',
            { requestId: params.requestId, token: params.token });
    },

    async cancelErasure(requestId: string): Promise<ApiResponse<CancelErasureResponse>> {
        return apiClient.post<CancelErasureResponse>(
            `/api/pdpa/erasure/${encodeURIComponent(requestId)}/cancel`);
    },
};
```
Note `encodeURIComponent` on every path parameter — universal in this directory (`certificate-service.ts:96,100,112,138`, `subscription-service.ts:106`).

**Test pattern** for such a client — `src/lib/services/__tests__/pdpa-erasure-service.test.ts:18-29`:
```ts
import { apiClient } from '@/lib/api/api-client';
jest.mock('@/lib/api/api-client', () => ({
    apiClient: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));
const mockedPost = apiClient.post as jest.MockedFunction<typeof apiClient.post>;
```
(Its header explicitly says mock the full get/post/delete surface even if the SUT uses one.) Other clients split their types into a sibling `*.types.ts` and re-export them from the client (`planting-service.ts:1-29`) — a reasonable option for `RequirementsPayload` if it grows.

## 2. Exact import for the new client

```ts
import { apiClient, type ApiResponse } from '@/lib/api/api-client';
```
`apiClient` is the singleton exported at `api-client.ts:626`; `api` at `:630` is an alias of the same object. 112 files import from `'@/lib/api/api-client'`; only 13 use the barrel `'@/lib/api'` (`src/lib/api/index.ts:2-5`, which re-exports `apiClient`, `ApiClient`, `type ApiResponse`, and `apiClient as api`). Inside `src/lib/services/` both `'@/lib/api/api-client'` and the relative `'../api/api-client'` appear; the `@/`-aliased form is the majority. `@/*` → `./src/*` (`apps/web-app/tsconfig.json:30-33`).

Call, for the planned route:
```ts
const res = await apiClient.get<RequirementsPayload>(
    `/applications/${encodeURIComponent(appId)}/requirements`);
```

## 3. What the browser computes today

### `review-completeness.ts` (79 lines, read in full)
It computes **nothing about which documents are required** — it is a pure set-difference over a requirement list handed to it. Two exported functions plus two structural types:

```ts
export interface RequirementLike { id: string; required: boolean; }
export interface UploadedLike { type?: string; id?: string; uploaded?: boolean; }

export function missingRequiredDocumentIds(
    requirements: ReadonlyArray<RequirementLike> | null | undefined,
    uploaded: ReadonlyArray<UploadedLike> | null | undefined,
    alsoSatisfied?: ReadonlySet<string>,
): string[]

export function documentsChecklistDone(
    requirements: ReadonlyArray<RequirementLike> | null | undefined,
    uploaded: ReadonlyArray<UploadedLike> | null | undefined,
    alsoSatisfied?: ReadonlySet<string>,
): boolean
```
Rules, exactly (`:52-63`, `:77-78`): an upload with `uploaded === false` is skipped; its satisfying id is `doc.type || doc.id`; `alsoSatisfied` ids are seeded into the supplied set first; missing = required requirements whose id is not in the supplied set. `documentsChecklistDone` returns **`false` when `requirements` is empty or nullish** — a deliberate refusal to treat "requirement list not yet resolved" as complete. Optional requirements count for nothing in either direction.

**The "required set" it knows comes from elsewhere**: `getDocumentRequirements()` in `documents-step-config.tsx:166-467`, a pure browser-side table, called identically by the review step (`review-step.tsx:101-109`) and the documents step (`documents-step.tsx:59-64`):
```ts
export const getDocumentRequirements = (
    purpose?: string | string[],
    cultivationMethods?: string[],
    landOwnership?: string,
    applicantType?: ApplicantType,          // 'INDIVIDUAL' | 'COMMUNITY' | 'JURISTIC'
): DocumentRequirement[]
```
It concatenates applicant-type docs (`INDIVIDUAL_DOCS` :136-139, `COMMUNITY_DOCS` :141-148, `JURISTIC_DOCS` :150-157) with a 25-entry `baseRequirements` array (:175-441), runs each through `resolveRequirementState` (:98-124 — conditional visibility/required promotion via `conditionalFor.{purposes,cultivationMethods,landOwnership}` and `conditionalBehavior ∈ 'REQUIRE_WHEN_MATCHED'|'SHOW_OPTIONAL_WHEN_MATCHED'`), and finally overwrites `type` from the shared slot table (`acceptedTypeForSlot(req.id)`, :463-466). Ids, in file order:

- applicant/INDIVIDUAL: `IND_ID_CARD`*, `IND_HOUSE_REG`*
- applicant/COMMUNITY: `COM_SVC01`*, `COM_TVC03`*, `COM_MEMBER_LIST`*, `COM_PRESIDENT_ID`*, `COM_MEETING_DOC`*, `COM_HOUSE_CODE`
- applicant/JURISTIC: `JUR_COMPANY_REG`*, `JUR_DIRECTOR_LIST`*, `JUR_DIRECTOR_ID`*, `JUR_POA`, `JUR_TAX_REG`, `JUR_COMPANY_CERT`
- license: `LICENSE_PT11`*, `LICENSE_PT9` (→required when purpose RESEARCH/EXPORT), `LICENSE_PT10` (→required when EXPORT), `CRIMINAL_BG`
- basic: `REG_FORM`*, `LAND_TITLE`*, `LAND_CONSENT` (→required when landOwnership ∈ RENT/CONSENT)
- location: `SITE_MAP`*, `BUILDING_PLAN` (→required when cultivation INDOOR/GREENHOUSE/INDOOR_CONTROLLED), `EXTERIOR_PHOTOS`*
- production: `PRODUCTION_PLAN`, `SECURITY_PLAN`, `INTERIOR_PHOTOS`
- quality: `SOP_MANUAL`*, `CP_CCP_TABLE`*, `INPUT_REPORT`*, `EQUIPMENT_CALIBRATION`*
- training: `GACP_CERTIFICATE`*, `STRAIN_CERTIFICATE`*, `PROVIDER_TRAINING`, `PROVIDER_TEST`
- lab: `SOIL_TEST` (→required for OUTDOOR/GREENHOUSE/INDOOR/VERTICAL_RACK), `NUTRIENT_SPEC` (→required for HYDROPONIC/AEROPONIC), `WATER_TEST`*, `FLOWER_TEST`
- export/other: `LAB_CERTIFICATE` (→required when EXPORT), `DESTINATION_CERT` (show-optional when EXPORT), `VIDEO_LINK`, `ADDITIONAL_DOCS`

(`*` = `required: true` unconditionally.) These are SCREAMING_SNAKE and **do not match the plan's snake_case server slot ids** (`land_rights`, `landlord_consent`, `water_test`, `controlled_herb_license`, …). Whatever mapping bridges the two must be explicit; nothing in the web app does it today. `@gacp/validation/upload-rules` (`packages/validation/src/upload-rules.js`) already carries a `SLOT_ALIAS_GROUPS` / `SLOT_ALIAS_LOOKUP` canonical-fold machinery (`:242,419,438,442,511`) plus `acceptedTypeForSlot(slotId)` (`:728`) and `MAX_UPLOAD_BYTES = 20*1024*1024` (`:589`) — it is a `.js` CommonJS file with no `.d.ts`, so it is untyped from TS. I did not read it in full; if the new payload needs the alias table, verify its exact export list before importing.

Consumption sites (only two, both in the wizard):
- `review-step.tsx:155` — `done: documentsChecklistDone(documentRequirements, uploadedDocuments, satisfiedRequirementIds(state))`, one item of a 7-item `checklist` (`:117-157`); `canProceed = missingChecklist.length === 0` (`:159-160`). `uploadedDocuments` = `documents.filter(d => d.uploaded)` where `documents = mergeDocuments(state, previewDocuments, snapshot)` (`:96-97`) — already a merge of wizard store + the server preview payload from `GET /preview/applications/${id}/preview` (`:74`).
- `documents-step.tsx:75-88` — the step-8 progress bar, which uses `satisfiedRequirementIds` for filtering but computes its own percentage without `review-completeness`.

### `documents-step-dedupe.ts` (98 lines, read in full)
```ts
export interface WizardDocumentLike { id?: string|undefined; type?: string|undefined; uploaded?: boolean|undefined; }
export interface LandDocumentLike { type?: string|undefined; name?: string|undefined; fileName?: string|undefined; fileUrl?: string|undefined; }
export interface DedupeStateLike {
    documents?: WizardDocumentLike[] | undefined;
    farmData?: {
        landDocuments?: { files?: LandDocumentLike[] | undefined } | undefined;
        waterSourceDetail?: { hasWaterTest?: boolean; waterTestFileName?: string; waterTestFileUrl?: string } | undefined;
    } | null | undefined;
}
export function satisfiedRequirementIds(state: DedupeStateLike): Set<string>
```
It answers "which requirement ids may step 8 hide, given evidence the bytes reached the server". Its whole invariant: **a filename is never evidence; only `uploaded === true` or a non-empty `fileUrl` is** (`hasUrl` at `:65-67` requires a trimmed non-empty string).

Body (`:74-97`): for each `state.documents` entry with `uploaded` truthy, take `doc.type || doc.id`, skip falsy and skip `'VIDEO_LINK'` (never hidden, by design), add it, and also add its step-2→step-8 alias from `STEP2_TO_STEP8_DOC_ID` (`:58-62`) — `M1_PT09→LICENSE_PT9`, `M1_PT10→LICENSE_PT10`, `M1_PT11→LICENSE_PT11`.

**The land-document rule, `:88-91` verbatim:**
```ts
    const landFiles = state.farmData?.landDocuments?.files || [];
    if (landFiles.some((file) => hasUrl(file?.fileUrl))) {
        satisfied.add('LAND_TITLE');
    }
```
Read precisely: **any one** land file with a real `fileUrl` satisfies `LAND_TITLE`, regardless of that file's own `type`. The step-5 land pickers upload under slot ids from `LAND_DOCUMENT_OPTIONS` (`src/constants/options.ts:50-55`): `CHANOTE` (required), `NS3`, `SPK`, `OTHER`; each is posted via `uploadDraftDocument({ file, slotId, stepKey: 'farm_info' })` (`farm-info-step.tsx:177-192`), and the URL is only recorded on success (`:182-191` deliberately drops the `File` on failure). So the browser's current rule is "a `CHANOTE` **or** an `NS3` **or** an `SPK` **or** an `OTHER` upload ⇒ `LAND_TITLE` is satisfied" — the server's `land_rights` satisfaction (plan line 281: `collectServerDocumentEvidence`) must reproduce that breadth or the review page will start reporting incomplete for farmers who uploaded an `NS3`.

Immediately below, `:93-95` — `waterTestFileUrl` non-empty ⇒ `WATER_TEST` (slotId literally `'WATER_TEST'` at `farm-info-step.tsx:209`).

**Second upload door — the web app is not a caller.** `grep` over `apps/web-app/src` for `'/wizard`, `` `/wizard ``, `"/wizard` returns zero hits. The backend `wizard.js` upload route (`apps/backend/routes/api/applications/wizard.js:178-180`) is mounted at `/wizard` (`apps/backend/routes/api/index.js:371`), i.e. `/api/wizard/draft-documents` — not `/api/applications/wizard/…`, which is what the plan's grep string `wizard/draft-documents` would look for and which matches nothing in the repo. Every live web-app upload goes to the surviving door `/applications/draft-documents`: `draft-document-upload.ts:28`, `documents-step.tsx:120` (+ `apiClient.delete('/applications/draft-documents/:id')` at `:148`), `components/feature/document-uploader.tsx:113`, `components/feature/inline-document-upload.tsx:98`, `app/health/planting/[id]/activities/use-planting-activities-page.ts:106,138`. Deleting the wizard door is invisible to the front end.

## 4. Existing types the new `RequirementsPayload` should align with

Ranked by how directly they collide.

1. **`DocumentRequirement`** — `apps/web-app/src/app/health/applications/new/_steps/steps/documents-step-config.tsx:13-26`. This is the web app's existing "requirement / slot" type and the closest analogue to the planned `slots[i]`:
```ts
export interface DocumentRequirement {
    id: string;
    label: string;
    description?: string;
    required: boolean;
    type: 'PDF' | 'IMAGE' | 'BOTH' | 'LINK';
    category: 'license' | 'basic' | 'location' | 'production' | 'quality'
            | 'training' | 'lab' | 'other' | 'applicant';
    conditionalBehavior?: 'REQUIRE_WHEN_MATCHED' | 'SHOW_OPTIONAL_WHEN_MATCHED';
    conditionalFor?: { purposes?: string[]; cultivationMethods?: string[]; landOwnership?: string[] };
}
```
Field-name mapping to the planned server slot: `id`↔`slotId`, `label`↔`labelTH`, `description`↔`description`, `required`↔`required`; the server adds `sourceHint, requiredReason, satisfied, fileUrl, fileName, uploadedAt` and drops `type`/`category`/`conditional*`. Two things the existing UI reads that the planned payload does **not** carry: `type` (drives `checkUploadInBrowser({slotType})` at `documents-step.tsx:105` and the file-picker `accept`) and `category` (drives `CATEGORY_LABELS` at `documents-step-config.tsx:469-479`). If T6's `RequirementSlotCard` is to replace those screens, either the server payload gains them or the card resolves `type` locally via `acceptedTypeForSlot(slot.slotId)`.

2. **`RequirementLike`** — `review-completeness.ts:28-31` (`{id, required}`). Structurally a subset of both `DocumentRequirement` and the planned slot; the new `RequirementSlot` should be assignable to it so the two functions the plan moves into the T4 client (plan line 370) keep compiling unchanged. Note the field is `id`, not `slotId` — if `RequirementSlot` names it `slotId`, `RequirementLike` compatibility breaks and every caller must be touched.

3. **`UploadedDocumentState`** and **`DraftDocumentUploadResponse`** — `documents-step-config.tsx:28-38`:
```ts
export interface UploadedDocumentState { documentId?: string; name: string; url?: string; }
export interface DraftDocumentUploadResponse { documentId: string; fileUrl: string; fileName?: string; }
```
The planned per-slot `{ fileUrl, fileName, uploadedAt }` triple should use these exact spellings — `fileUrl`/`fileName` already match the upload door's response and `LandDocumentLike`.

4. **`StepDocument`** — `apps/web-app/src/app/health/applications/new/hooks/domain-types.ts:465-472`. The nearest existing "server-persisted slot" shape and the one whose vocabulary the payload most nearly matches:
```ts
export interface StepDocument {
    stepNumber: number; docType: string; fileName?: string;
    fileUrl?: string; uploadedAt?: string; required: boolean;
}
```
It is already in the wizard store as `stepDocuments: StepDocument[]` (`use-application-flow-store.state-types.ts:49`). `docType`/`fileName`/`fileUrl`/`uploadedAt`/`required` is five of the planned slot's seven non-id fields under identical names — reuse these names rather than inventing `url`/`name`.

5. **`DocumentUpload`** — `domain-types.ts:474-481`: `{ id: string; name?: string; type?: string; url?: string; uploaded: boolean; metadata?: unknown }`. This is the store's `documents: DocumentUpload[]` (`state-types.ts:38`) and the concrete type behind `UploadedLike`/`WizardDocumentLike`. **Trap:** a second, unrelated `DocumentUpload` exists at `_steps/hooks/use-wizard-state.ts:103-107` (`{id, file?: File, url?: string}`) — the legacy one. The canonical one is `new/hooks/domain-types.ts`, re-exported to the `_steps` tree by `_steps/hooks/use-application-flow-store.domain-types.ts:5` (`export * from '../../hooks/domain-types';`). Import from the canonical path.

6. **`LandDocumentLike`** — `documents-step-dedupe.ts:32-37` — and the store's real land-file shape at `domain-types.ts:180-190` (`landDocuments?: { checks?: Record<string,boolean>; otherName?: string; files?: Array<{type: string; name?: string; fileName?: string; fileUrl?: string}> }`). Relevant because `land_rights` satisfaction on the server has to cover these `type` values (`CHANOTE|NS3|SPK|OTHER`).

7. **`DraftUploadArgs` / `DraftUploadResult`** — `draft-document-upload.ts:36-52`. Not a requirement type, but the T6 slot card uploads through this and the plan's `slotId = slot.slotId` feeds `args.slotId` directly:
```ts
export interface DraftUploadArgs { file: File; slotId: string; stepKey?: string;
    draftId?: string|undefined; applicationId?: string|undefined; maxSizeMB?: number; }
export interface DraftUploadResult { url: string | null; error: string | null; }
export async function uploadDraftDocument(args: DraftUploadArgs, deps?: UploadDeps): Promise<DraftUploadResult>
```

Nothing named `RequirementsPayload`, `RequirementSlot`, `slotId`-as-a-type, or `requiredReason` exists anywhere in the web app today — the whole payload vocabulary is new. `apps/web-app/src/config/document-config.ts:148-154` defines an unrelated `DocumentConfig` (กทล.1 print-header metadata: `{formType, title, subtitle?, org, badgeVariant}`) — despite the name it is not a document-slot type and should not be aligned with.