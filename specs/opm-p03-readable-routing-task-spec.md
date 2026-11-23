# P03 readable canvas and editable routes

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change
Risk Level: L3
Task Type: feature
Active Playbooks: none (primary); this repository has no .harness playbooks.

## Goal and scope
Implement the approved readable-canvas proposal: refinement parent envelopes, wrapped names, topology-based preview layout, rounded obstacle-avoiding routes, editable per-occurrence/per-segment paths, durable draft/history/exchange support. No business names or model IDs in implementation.

Allowed: apps/web canvas/store/types, local-runtime semantic/layout application code, contract generator and generated schemas/types, contract docs, focused tests, workbench packaging. Host opm-platform changes are limited to the workbench dependency/vendor integration. API additive layout fields are necessary for durable routes and are in scope. Existing unrelated changes are preserved.

Forbidden: business data deletion, domain/endpoint semantic rewrites, new dependencies, unrelated assistant changes, new database tables. Existing JSON document storage is reused. Verification found a frozen save-digest contract and database digest-version constraint: add Digest/3 for route-bearing documents and one additive V2 constraint migration; old Digest/1 and /2 bytes remain unchanged.

## Contract decision
Add optional `edge_routes` to an occurrence layout. Each entry addresses a render segment by stable suffix (`main`, `input`, `output`, etc.), has style STRAIGHT/ROUNDED/CURVE, mode AUTO/MANUAL and finite ordered points. Optional fields preserve legacy documents and old layout constructors. Layout batch authorization accepts owned FACT occurrences in the active context, without granting semantic edits. Plain node geometry edits preserve routes.

## Acceptance
- A1: Ordinary links default to rounded obstacle-avoiding orthogonal paths. Parallel links separate. Special symbols and endpoints retain semantics.
- A2: Selected editable edges expose drag/add/remove vertex controls plus style and reset actions. Readonly/preview blocks edits; undo/redo and save failure preserve draft changes.
- A3: Per-occurrence and multi-segment routes survive save/reopen, exact projection, revision serialization and package exchange. Malformed/oversized routes are rejected. The V2 migration only expands the digest-version constraint.
- A4: Moving endpoints preserves manually routed interiors; moving both endpoints together translates a route. Opening a model does not globally rearrange nodes.
- A5: Refinement parent envelopes are identified from context refinee identity, drawn behind children with an unobstructed header. Names wrap; preview layout excludes the envelope and optimizes layer ordering. Layout applies only on confirmation.
- A6: Focused frontend and backend tests, type checks, generated contract consistency, builds, browser checks and actual host integration pass. Business records are untouched by automated mutation checks.

## Plan and rollback
Implement compatible layout storage first, canvas routing/editor second, envelope and ordering third; validate and package platform.10 and install in host. Before rolling back the backend, use the updated runtime to clear saved edge_routes (route-bearing documents use Digest/3, which older runtimes cannot read). Then revert only this task's source/contract/package changes and reinstall platform.9. The additive digest-version constraint may remain.

## Verification and integration (2026-10-20)
- Frontend: 224 targeted Vitest checks passed, including route history, retry, movement, readonly/preview guards, envelope containment and existing state/feature behavior.
- Backend: 29 distinct targeted checks passed across SemanticRevisionReaderTest (3), SemanticLayoutEditorTest (2), SaveContentDigestV1Test (7), DraftWorkspaceContractTest (5), DraftWorkspaceControllerTest (3) and ExchangePackageReaderWriterTest (9). Draft HTTP tests use isolated PostgreSQL schemas.
- Node contract/digest suite: 25 checks passed; all four generation checks passed, including frozen legacy Digest/1 and /2 compatibility.
- Browser: 4 component regressions passed. The isolated editable runtime browser flow passed selection without writes, curve style, undo/redo, control-point add/drag/delete, save/reopen, restore-auto and readonly checks. Dragged point (176,144) survived exact projection and reopening; no browser errors.
- Real model: read-only browser validation on the user's imported context checked 24 nodes, 21 edges, 8 contained states and all content corners inside the parent ellipse; no model mutations.
- ESLint, diagram/host TypeScript checks, library packaging, Maven packaging and host production build passed. Host build retains existing third-party annotation and chunk-size warnings.
- Host dependency installed as 0.2.2-platform.10; installed index.js matches the built library SHA256. Local frontend remains on port 3000; updated runtime remains on port 17850, health UP. Its existing Flyway flow applied V2 to opm_diagram successfully. No new tables or business-data cleanup.
- Existing assistant changes, earlier canvas fixes and untracked IDE files were preserved.

## Complete source change inventory for this task
Paths below are relative to opm-diagram (some test mocks also retain earlier task changes).
```text
apps/web/scripts/package-workbench.mjs
apps/web/src/modules/workbench/OpdCanvas.vue
apps/web/src/modules/workbench/OpdCanvas.spec.ts
apps/web/src/modules/workbench/WorkbenchSurface.vue
apps/web/src/modules/workbench/WorkbenchView.spec.ts
apps/web/src/modules/workbench/opd/useBlankCanvasPan.ts
apps/web/src/modules/workbench/opd/useRelationRouteEditor.ts
apps/web/src/modules/workbench/opd/core/canvas-scene.ts
apps/web/src/modules/workbench/opd/core/refinement-envelope.ts
apps/web/src/modules/workbench/opd/core/relation-routing.ts
apps/web/src/modules/workbench/opd/core/relation-routing.spec.ts
apps/web/src/modules/workbench/opd/core/relation-render-spec.ts
apps/web/src/modules/workbench/opd/core/x6-node-layer.ts
apps/web/src/modules/workbench/opd/core/x6-relation-adapter.ts
apps/web/src/modules/workbench/opd/core/x6-relation-adapter.spec.ts
apps/web/src/shared/types/modeling.ts
apps/web/src/shared/api/localRuntimeApi.ts
apps/web/src/shared/api/generated/draftWorkspaceContract.ts
apps/web/src/stores/workbench/autoLayout.ts
apps/web/src/stores/workbench/autoLayout.spec.ts
apps/web/src/stores/workbench/projectionMapping.ts
apps/web/src/stores/workbench/relationLayout.ts
apps/web/src/stores/workbench/relationLayout.spec.ts
apps/web/src/stores/workbench/workbenchLayout.ts
apps/web/src/stores/workbenchRuntime.ts
docs/contracts/edge-route-layout.md
docs/contracts/openapi/opm-draft-workspace-v02.json
docs/contracts/schemas/opm-draft-workspace-v02.schema.json
docs/contracts/schemas/opm-revision.schema.json
docs/contracts/schemas/opm-revision-v0.2.schema.json
docs/contracts/schemas/opm-revision-v0.3.schema.json
docs/contracts/schemas/opm-revision-v0.4.schema.json
docs/contracts/schemas/opm-revision-v0.5.schema.json
docs/contracts/schemas/opm-save-content-v3.schema.json
docs/contracts/schemas/opm-save-content-v3-refinement.schema.json
docs/contracts/schemas/opm-save-content-v3-method.schema.json
docs/contracts/schemas/opm-save-content-v3-trace.schema.json
scripts/generate-draft-workspace-contract.mjs
scripts/generate-opd-refinement-contract.mjs
scripts/generate-save-content-contract.mjs
scripts/generate-route-layout-contract.mjs
scripts/save-content-digest-v1.test.mjs
scripts/save-content-digest-v3.mjs
scripts/save-content-digest-v3.test.mjs
services/local-runtime/src/main/java/org/opm/localruntime/api/generated/DraftWorkspaceContract.java
services/local-runtime/src/main/java/org/opm/localruntime/application/DraftCapabilityQuery.java
services/local-runtime/src/main/java/org/opm/localruntime/application/DraftOwnedConstructEdits.java
services/local-runtime/src/main/java/org/opm/localruntime/application/OpdProjectionQuery.java
services/local-runtime/src/main/java/org/opm/localruntime/application/SemanticCommandEditor.java
services/local-runtime/src/main/java/org/opm/localruntime/application/SemanticLayoutEditor.java
services/local-runtime/src/main/java/org/opm/localruntime/semantic/SaveContentDigestV1.java
services/local-runtime/src/main/java/org/opm/localruntime/semantic/SaveContentSchemaV1.java
services/local-runtime/src/main/java/org/opm/localruntime/semantic/SemanticRevision.java
services/local-runtime/src/main/java/org/opm/localruntime/semantic/SemanticRevisionReader.java
services/local-runtime/src/main/java/org/opm/localruntime/semantic/SemanticRevisionJsonWriter.java
services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftJournalRepository.java
services/local-runtime/src/main/resources/db/migration/postgresql/V2__edge_route_digest.sql
services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json
services/local-runtime/src/main/resources/draftsave/save-content-v3.schema.json
services/local-runtime/src/main/resources/draftsave/save-content-v3-refinement.schema.json
services/local-runtime/src/main/resources/draftsave/save-content-v3-method.schema.json
services/local-runtime/src/main/resources/draftsave/save-content-v3-trace.schema.json
services/local-runtime/src/test/java/org/opm/localruntime/api/DraftWorkspaceControllerTest.java
services/local-runtime/src/test/java/org/opm/localruntime/exchange/ExchangePackageReaderWriterTest.java
services/local-runtime/src/test/java/org/opm/localruntime/semantic/SaveContentDigestV1Test.java
services/local-runtime/src/test/java/org/opm/localruntime/semantic/SemanticRevisionReaderTest.java
tests/e2e/workbench-route-layout.mjs
tests/fixtures/hybrid-save/route-layout-v3-vector.json
specs/opm-p03-readable-routing-task-spec.md
specs/opm-p03-readable-routing-checklist.md
```
Host integration under opm-platform:
```text
apps/web-console/package.json
apps/web-console/vendor/opm-workbench-0.2.2-platform.10.tgz
```
Local generated bundles, package-lock.json (already ignored), runtime JAR backup and browser screenshots/reports remain outside the source inventory.
