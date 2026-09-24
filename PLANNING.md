# Business Planning

Native Connect module: `/?planning=prices`, `/?planning=commissions`, or `/?planning=budgets`.

## Current release

- Two entities: Physical Centre and Aspire Online. No AHCI or individual branch setup in the interface.
- Prices and Commissions are separate tabs and separate Supabase tables. Prices use the supplied 22 September 2027 workbook, with Product A–D navigation, tier columns, package totals, calculated savings and 2026 comparisons where available. The HTML supplies the presentation structure, not the amounts.
- The workbook sheet is named `Price List 2026`, but columns I–L are explicitly 2027. `lib/price-source.json` preserves cell provenance. Monetary values are integer SGD cents. Mixed IP/IB labels are simplified and standalone IP/IB rows are omitted, following the earlier request. The two Primary 1–2 four-subject packages are unavailable, matching the HTML and prior-year data despite workbook zeros. Pre-school 2027 prices are not supplied. GST treatment is not stated in the sources.
- Commission tab shows teacher shares by product, Physical Centre A–D, Aspire Online A–B, and Cold Call A–D allocations. Initial, renewal and upsell sets preserve blanks. Increment controls step by 1 percentage point. One commission selection governs all Who earns what tables. Default quantities: 1 student, 12 lessons; D uses one subject-year. Administrator preview uses saved draft prices; other users use published prices.
- Flexible entity/year budgets retain arbitrary P&L lines, monthly values, quantity × price and percentage formulas. Aspire Online starts from the supplied ramp assumptions. Saved budgets retain their price/commission snapshot to prevent later settings changes silently repricing them.

## Access and publishing

Active invited Connect users can read the last published prices, commissions and budgets. Director and Senior Manager business roles can change inputs in memory for analysis. Board permissions do not grant planning edit/save rights. Administrators can edit, save drafts and publish. Server authorization is checked for every save. Anonymous, inactive, deleted and onboarding users cannot access planning data.

Save draft updates working values only. Publish replaces the shared snapshot on the same record. There is no new-version/copy-version workflow. Existing publication remains visible while an administrator edits or saves another draft. Directors and Senior Managers cannot persist changes, even through direct API calls. Unpublished draft contents and metadata are not returned to nonadministrators. Concurrent saves use revisions and return a conflict without overwriting another administrator's changes.

Open Business Planning in the sidebar, then choose Prices, Commissions or Budgets & Scenarios. Administrators use View published values to see the reader view. Source imports initially remain drafts until the administrator publishes each table. Signed-in readers then see the published values automatically when opening/reloading the module.

## Storage and deployment

Run `deployment/supabase-planning.sql`, then `deployment/supabase-planning-v2.sql`. Both preserve existing records on rerun. Release 2 adds `ao_plan_prices` and `ao_plan_commissions`, each with working payload and independent published snapshot. Budgets have their own publication and calculation-assumption snapshot. `ao_plan_audit` keeps transactional before/after history. Legacy `ao_plan_rules` is retained for existing references/history. No records are deleted.

RLS is enabled; browser roles have no direct table or save-function privileges. The authenticated Connect server accesses Supabase through the existing service connection. No new secrets or weaker HTML article sandbox are needed.

## Validation

80 domain/API/auth tests pass. Separate PGlite tests cover rerunnable migration/import, two entities, preservation of draft/publication separation, republishing the same record, stale-revision conflicts, transactional audit, budget snapshots and denied direct browser access. TypeScript and Cloudflare production build pass. Local native UI checks cover workbook values, recalculating package totals, three commission tables, default quantities and one-point commission steps.

## Scope

Actual-result imports, budget-versus-actual reporting, group consolidation, intercompany eliminations, accounting-system integration, cash-flow timing and automatic breakeven are future work. No actual performance figures or individual branches have been invented. Original spreadsheets and HTML remain unchanged.
