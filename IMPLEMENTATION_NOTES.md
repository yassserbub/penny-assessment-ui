# Implementation Notes

## 1. What I changed

- **Bug Fixes**:
  - `src/components/diff.util.ts`: Corrected `computeDiff` to inspect line item `quantity`, `unitPrice`, and `description` differences between baseline and proposed items so quantity/description-only changes are properly flagged as `'changed'`.
  - `src/components/cr-detail/cr-detail.component.ts`: Updated `canApprove` and `canReject` getters to enforce both Change Request status (`PENDING_APPROVAL`) and user policy permission checks (`canApprovePolicy(user)`), preventing unauthorized users from accessing approve/reject controls.

- **List Component (`CrListComponent`)**:
  - `cr-list.component.ts`: Implemented `visibleRows` filter getter to narrow the Change Requests rendered in the table based on the selected `statusFilter` (`'ALL'` or specific `CrStatus`).
  - `cr-list.component.html`: Ensured robust loading, loaded, empty (both no-CRs and no-matching-filter results), and error states with retry functionality.

- **Detail Component (`CrDetailComponent`)**:
  - `cr-detail.component.ts`:
    - Chronologically ordered approval timeline entries (`oldest-first` based on ISO timestamp `at`).
    - Gated `canApprove` and `canReject` using `canApprovePolicy(user)` and CR status.
    - Added form validation for `rejectControl` requiring a non-empty, non-whitespace reason (`Validators.required`, `Validators.pattern(/.*\S.*/)`).
    - Implemented `approve()` and `reject()` actions with state updates, loading indicator (`submitting`), error propagation (`actionError`), and form reset.
    - Emits `@Output() crUpdated = new EventEmitter<void>();` upon successful action completion to trigger parent state synchronization.
  - `cr-detail.component.html`: Wired up loading, error retry, diff preview table, chronological timeline, reject reason validation feedback, and disabled states during submitting / unauthorized user access.

- **State Synchronization (`AppComponent`)**:
  - Wired `(crUpdated)="onCrUpdated()"` event binding in `app.component.html`.
  - On `crUpdated` event emission, parent container calls `this.crList?.load()` to re-fetch the latest Change Request statuses into `CrListComponent`.

- **Testing (`*.spec.ts`)**:
  - Extended Jest unit & component DOM tests covering diff calculation edge cases, status filter narrowing, empty/error states, permission gating, timeline sorting, approve/reject action flows, rejection validation, network errors, and slow network double-click prevention.

## 2. Component & state model

The application exposes two main standalone components managed via explicit `ViewState<T>` objects (`idle`, `loading`, `loaded`, `empty`, `error`):

1. **`CrListComponent`**:
   - Holds `state: ViewState<CrSummary[]>`.
   - Exposes `statusFilter: CrStatus | 'ALL'`.
   - Computes `visibleRows` synchronously based on `state.data` and `statusFilter`.
   - Triggers `select` EventEmitter on row click.

2. **`CrDetailComponent`**:
   - Receives `@Input() id: string`.
   - Holds `state: ViewState<CrDetail>`, `submitting: boolean`, `actionError?: string`, and `rejectControl: FormControl<string>`.
   - Derives `diff` (`DiffRow[]`), `timeline` (`TimelineEntry[]`), `canApprove` (`boolean`), and `canReject` (`boolean`) dynamically from state and `SessionService`.

## 3. Invariants I keep

| Invariant | How / where |
|---|---|
| Read-only users cannot act | `canApprove` & `canReject` evaluate `canApprovePolicy(user)`; buttons disabled and forms hidden when false. |
| Double-submission prevention | `submitting` flag is set to `true` during async actions and disables action buttons. |
| Rejection reason required | `rejectControl` is validated against empty/whitespace strings before enabling Reject button or sending payload. |
| Cross-component state sync | `CrDetailComponent` emits `crUpdated` on action success; parent invokes `crList.load()` to refresh list data. |
| No stale view data on error | API errors retain existing `state.data` and set `actionError` cleanly without wiping the view. |
| Chronological audit timeline | `timeline` getter sorts audit array by timestamp `at` ascending. |

## 4. Testing strategy

- **Pure Unit Tests (`diff.spec.ts`)**: Fast tests verifying diff logic for added, removed, changed (quantity, unit price, description), and unchanged items.
- **Component DOM Tests (`cr-list.component.spec.ts` & `cr-detail.component.spec.ts`)**: Async TestBed tests using `detectChanges()` and Promise flushing to verify rendered DOM elements across loading, loaded, empty, filtered, and error states, as well as button disabled attributes and event emissions.
- **Unhappy & Network Failure Paths**: Tested `api.failNext = true` and `api.latencyMs` to verify error banners, retry flows, and double-click prevention.

## 5. Assumptions & Non-Trivial Architectural Decisions

- **Non-Trivial Decision — Event-Driven State Synchronization**:
  - *Problem*: Approving or rejecting a Change Request in `CrDetailComponent` mutates data on `CrApiService`. While `CrDetailComponent` updates its local state immediately, sibling `CrListComponent` held stale summary data, causing list items to disappear or show outdated status badges when filtered.
  - *Architectural Choice*: Implemented custom event bubbling via `@Output() crUpdated = new EventEmitter<void>();` in `CrDetailComponent`, handled by the parent container (`AppComponent`) to invoke `crList.load()`.
  - *Trade-off & Rationale*: Instead of introducing heavyweight state management frameworks (such as NgRx or Akita) or polling timers, we chose standard Angular `EventEmitter` patterns. This satisfies Non-Functional Requirement #5 (avoiding heavy external dependencies) while ensuring immediate UI consistency across components following a successful API transaction.

- **Assumptions**:
  - Approvers have policies such as `cr_a_o`, `cr_a_w`, or `cr_a_u` as defined in `permissions.ts`. Both Approve and Reject actions are restricted to users with approve policy.
  - An empty rejection reason or one containing only whitespace is invalid.
  - Audit timeline sorting handles ISO 8601 string comparison ascending (oldest first).

## 6. Where I used AI

- Used AI for planning task breakdown, reviewing Angular 15 & Jest best practices, drafting implementation notes, and generating comprehensive test cases for DOM assertion and error paths.

## 7. What I'd improve with more time

- Add optimistic UI updates with automatic rollback on server error.
- Implement pagination and search keyword filtering for the list table.
- Introduce accessible ARIA live regions for screen-reader announcements on state changes.
