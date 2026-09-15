> **Design revision:** The user subsequently rejected the original flat Notion direction. The current UI intentionally supersedes the visual restrictions below with a modern SaaS design: dark navigation, light workspace, rounded surfaces, stronger type hierarchy and restrained gold accents. The four-status workflow and stored data model remain unchanged.

# The One Tracker — consistency review and implementation decisions

Reviewed 10 September 2026. Sources: DESIGN.md, DESIGN_1.md, THE-ONE-TRACKER-Prompts.md and THE-ONE-TRACKER-Stitch-Kit.md supplied by the user. The source documents were not modified.

## Verdict

The four documents are not a single consistent specification. They contain two internally related pairs with incompatible product scope. This build uses DESIGN_1.md and THE-ONE-TRACKER-Prompts.md as its baseline because they explicitly simplify both the workflow and interface. This is an implementation decision, not a claim about file chronology.

| Issue | Evidence in the supplied files | Decision applied |
|---|---|---|
| Wrong companion reference | Simplified Prompts introduction calls DESIGN.md its companion, but its four-color tokens and four statuses match DESIGN_1.md. | DESIGN_1.md is the visual source of truth for the simplified app. |
| 13 vs 60 screens | Prompts screen index lists 13 screens; Stitch Kit lists 60 including contracts, printing, time tracking and permissions. | Implement the smaller coherent workflow; the expanded suite is a separate future scope. |
| Incompatible statuses | DESIGN.md and Kit use nine workflow statuses plus flags; DESIGN_1.md and Prompts use four. “En cours” is blue in one system and yellow in the other; “À valider” changes from yellow to orange. | Exactly À faire, En cours, À valider, Validé. Returns move to En cours. Archive is a boolean, not a fifth status. |
| Four vs seven interface tokens | DESIGN.md uses #F4F4F4, #E3E3E3, #8C8C8C and #FBEFD8; simplified files use #EDECEA and prohibit gray text. | Black #111111, white #FFFFFF, gray #EDECEA, gold #E5A93C. Pastels are reserved for chips. |
| Calendar color leakage | Simplified P3 and P6 prescribe status-colored left edges, contradicting DESIGN_1.md and PZ's chip-only rule. | Neutral calendar entries with a status chip inside, no colored borders. |
| Gold exceptions | “Don’t colour anything but the status chip” contradicts gold buttons, marks, counters and navigation. P4 adds a second gold comment button; P7 gives every card a gold CTA. | Treat the documented gold brand/action elements as explicit exceptions. Comment buttons and repeated review CTAs are neutral; final approval is the primary action. |
| Four-color claim vs emoji | Both design files require page emoji, which contain colors beyond the palette. | Emoji are explicit page-header exceptions. All functional colors obey the tokens. |
| Task field count | Simplified workflow says six fields, but P2 has client, sub-project and description; P4 adds creator/date/history. | Six core business fields plus parent relationships, description and system metadata. Editorial channel/time are optional task metadata, not separate content records. |
| Ambiguous hierarchy | “Client → Brief → Sous-projet → Tâche” can imply Brief is another entity; later text permits only one level between client and task. | Brief belongs to the client record. Client → sub-project → task is the entity hierarchy. |
| One primary per screen | Client gallery and detail prompts conflict with the global primary-action rule. | One primary button per active view or modal; list navigation uses neutral buttons. |
| Calendar count | September 2026 fits into five Monday-first weeks, while P3 specifies six rows. | Keep a consistent six-week month grid with adjacent-month dates, and a week view. |
| Incorrect example weekday | Simplified P1 says “Mercredi 10 septembre”; 10 September 2026 is Thursday. | Calculate dates and counts from actual state rather than copy example labels. |
| Unspecified archival cascade | Archive instead of delete is specified, but child visibility and restoration are not. | Archived parents hide descendant tasks from active views. Restore the parent to resume work. Keep data and history. |
| Table density conflict | 40px rows plus two lines, 24px avatar and padding can clip content. | Slightly taller content-driven rows and responsive overflow retain legibility. |
| Missing supplied assets | Prompts ask for five SVG assets, but only four Markdown files were attached. | Use the specified TOC text mark and neutral document previews; do not invent client artwork. |
| Authentication not implementable from a design prompt | P1 specifies Google login without OAuth configuration, client memberships or an invitation model. | Use private platform sign-in. No fake Google button. The client portal is clearly an owner-operated preview, not externally accessible client authentication. |
| Expanded approval assumptions | Kit introduces automatic acceptance, review allowances and print production; simplified files do not define them. | Explicit manual validation only, with a deliverable required. No automatic approval, publishing, email or production dispatch. |

## Working build

French responsive studio workspace with home, task table, searchable/filterable/sortable views, four-column drag-and-drop board, month/week calendar, task creation and editing, deliverable links, comments and history, clients and briefs, sub-projects, editorial calendar, archive/restore, global search and client-review preview. Data is persisted in the private Site database and scoped to the signed-in user. Concurrent updates are rejected instead of silently replacing newer changes.

The first visit opens an empty workspace. “Explorer avec des exemples” explicitly adds four fictional clients, four sub-projects and twelve tasks; the seed is idempotent. No actual client data or deliverables were supplied or invented as real.

## Deliberate limits

- Google OAuth, invitations, shared team membership, external client authentication and RTL localization are not enabled in this build.
- Approval in the preview is a studio action; it is not a legally attributed external-client sign-off.
- Editorial dates organize tasks; they do not publish to social networks.
- External deliverables open at their original link. The app does not upload, proxy or silently fetch those documents.
- The 60-screen modules (contracts management, workload, timers, printing/BAT, quotas and recurring jobs) are excluded from this simplified scope.

## Validation

TypeScript and production build checks; focused API tests cover invalid dates and links, required deliverables, parent ownership, approval, changed deliverables reopening work, stale-edit rejection, archived parents, comments, idempotent demo data, cross-origin writes and unauthenticated/other-owner access. Browser/visual QA and live WebMCP invocation were not performed because this turn did not request a browser test.
