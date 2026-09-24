# Business Planning — release 1

Implemented in the native Connect interface under Business Planning. Not an uploaded HTML article; saving uses the existing signed-in session and Connect's server-to-Supabase connection.

## Release contents

- Configurable entities: branch, online, coaching and company, with optional parent entity and access board. No fixed branch count. Initial migration adds Aspire Online and AHCI only; real branch names and legal-company assignments must be entered by the administrator.
- Shared versioned prices and teacher shares for A–D, plus Physical Centre A–D, Online A–B and Cold Call A–D commission allocations. Initial, renewal and upsell rates; original unknowns remain blank. Commission inputs step by 1 percentage point.
- Unified price matrix and one commission-set selection for all four Who earns what tables; gross/net-of-teacher preview calculation and retained percentage.
- Entity-specific monthly budgets with arbitrary named P&L lines across revenue, direct costs, operating costs, other income and tax. Formula types: manual monthly amounts, quantity × versioned price, percentage of another line (custom/teacher/commission rate). Formula chains supported; cycles rejected. Maximum 100 lines per budget in this release.
- Blank branch template and Aspire Online 2027 ramp template based on the supplied original management model. The online template's sales and percentages are editable budget-specific inputs, not an automatic breakeven solver. Budget totals use monthly cent rounding and may differ by a few cents from the original full-precision HTML.
- Draft saving, immutable published versions, copying to a new draft, optimistic revision checks, transactional audit history, visible errors and unsaved-change warning.

## Data model

`ao_plan_entities` is the entity directory. `ao_plan_rules` holds each version's structured price rows and commission/teacher maps. `ao_plan_budgets` holds one entity/year/scenario with its P&L lines and a foreign key to a published rules version. `ao_plan_audit` records every save in the same transaction.

Flexible line definitions and monthly drivers are JSONB per budget, independent of the existing whole-workspace record. Money is stored as integer SGD cents; percentages are explicit numbers, with null for unknown. Tables can be queried directly by entity, year and version; JSONB values can be expanded for reporting. This release does not create one SQL column per P&L variable.

Published rules cannot change, so budgets retain their price/commission assumptions. Published budgets cannot change; users copy them into new drafts. There is no automatic switching to the latest price list.

Access: active administrators, Directors and users with Manage access to the Directors board manage all planning. Other users inherit their linked entity board's View/Edit/Manage level. Parent entity relationships do not grant child access. Only planning managers edit shared prices/rates. Entity editors save budget drafts; entity managers publish. PostgreSQL browser roles cannot access planning tables or save RPCs; the server enforces permissions.

## Enable on existing Connect

1. In the existing Supabase project's SQL Editor, run `deployment/supabase-planning.sql` after the existing base setup. The migration is rerunnable and preserves existing records. It adds four tables and one service-role-only function. It does not alter article security or existing task tables.
2. Deploy the updated Connect application using its existing Cloudflare workflow. No new secrets are needed; it reuses SUPABASE_URL and SUPABASE_SECRET_KEY on the server.
3. Sign in as an administrator/Director. Open Business Planning. Add the 17 named branches and company structure; link access boards where appropriate.
4. In Prices & Commissions choose New from 2027 source, review values, save draft and publish the approved version.
5. Create a budget for an entity; select a published price/rule version, edit P&L lines, save and publish when complete.
6. Verify a second account's view/edit restrictions and reopen a saved budget from a second browser.

The SQL migration and production deployment have not been applied by this task. Existing local HTML/browser-saved scenarios are not automatically imported; source defaults are provided for review.

## Validation

78 domain/API/auth tests pass; typecheck and Cloudflare production build pass. Additional isolated PostgreSQL tests using PGlite verify rerunnable migration, atomic save/audit, revision conflicts, immutable publication, entity-cycle rejection, entity reassignment rejection, and denied browser roles. Browser inspection used an isolated local fixture with no live data to check price and budget layouts. Live Supabase end-to-end verification remains pending migration/deployment.

## Next release boundary

Actual-result imports, budget-versus-actual reports, group consolidation and intercompany eliminations, accounting-system integration, cash-flow timing and automatic breakeven/goal seeking are not part of release 1. Parent entities are organisational only: no implicit consolidation or double-counted parent totals. No branch names, actual performance figures or legal company mappings have been invented.
