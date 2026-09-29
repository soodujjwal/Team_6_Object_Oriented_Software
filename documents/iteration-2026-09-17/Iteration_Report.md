# Personal Finance Manager

## Implementation Iteration Report

**Course:** CSE 3311 - Software Object Oriented

**Team:** Team 6

**Team members:** Ujjwal Sood, Hardik Kari, David Aviles, Ishika Sanghadia

**Instructor:** Christoph Csallner

**Report date:** September 17, 2026

**Iteration label:** Core finance expansion, Split Bill refinement, and session recovery

**Repository:** https://github.com/soodujjwal/Team_6_Object_Oriented_Software

**Baseline:** `6848b58` (September 12, 2026)

**Committed implementation:** `271b5e6` (September 16, 2026), branch `main`

**Report scope:** The September 17 local working tree, including the uncommitted session-recovery fix. This report describes the implementation as inspected, not a claim that every planned feature or quality objective is complete.

**Administrative note:** A professor-provided iteration number, reporting template, deadline, individual work log, and sign-off were not supplied. This document uses an explicitly named implementation iteration rather than inventing those records. The presentation spells one member's name as Ishika Vishal Sanghadia; the cover follows the written inception document. Confirm the preferred form before submission.

## Contents

1. Executive summary and iteration outcome
2. Evidence, repository state, and development history
3. Requirements and traceability
4. Architecture and repository organization
5. Object-oriented design and design patterns
6. Data model and persistence
7. Feature and screen walkthrough
8. Financial rules and worked examples
9. API contracts and integration
10. User interface and accessibility
11. Authentication and the 401 defect
12. Testing and verification evidence
13. Known limitations and risk register
14. Setup, operation, and demonstration
15. Iteration assessment and next iteration
16. Contribution records and submission checklist
17. Glossary and source references
18. Generated appendices: snapshot, API endpoints, database fields, source inventory, and test functions

## 1. Executive summary and iteration outcome

Personal Finance Manager is a local web application intended to help students and young adults record financial activity, manage category budgets, plan savings, track recurring bills, and evaluate planned purchases. A React/TypeScript frontend communicates with a FastAPI backend that stores data through SQLAlchemy in SQLite. The backend separates HTTP routes, validation schemas, application services, financial domain objects, and repositories.

The inception deliverable defined a layered, object-oriented system with accounts, income and expenses, budgets, savings goals, recurring transactions, reports, notifications, and a distinguishing affordability feature. The current repository implements those core areas to varying depths. It also adds receipt/statement import support, onboarding, account transfers, and a restaurant-style Split Bill workflow.

This implementation iteration expands the earlier application and simplifies the Split Bill experience. A user can scan or upload a receipt, select friends, assign shared items, inspect proportional tax/tip allocations, and save a reconciled split. Bank payment and repayment tracking are available in an optional second step. Settings includes Savings-to-Checking transfers recorded in their own ledger. A subsequent local fix handles expired sessions, stops repeated unauthorized finance requests, and returns the user to Login.

The inspected snapshot contains **158 tracked or unignored application/configuration/test/reference files**, **46 explicitly declared application HTTP endpoints**, and **9 ORM tables**. These counts exclude installed dependencies, generated builds, local database contents, and this documentation package. Framework-generated documentation endpoints are not included in the endpoint count. The generated appendices identify every counted file, route, and table.

Verification on September 17 produced **45 passing backend tests**, **13 passing frontend tests**, and a successful TypeScript/Vite production build. These results support specific tested calculations and workflows; they are not evidence of full browser acceptance, complete financial correctness, measured coverage, or production security. The application remains a course prototype. Significant remaining issues include incomplete isolation of financial accounts between users, a development signing secret, inconsistent duplicated calculations, and missing end-to-end UI/OCR validation.

## 2. Evidence, repository state, and development history

### 2.1 Evidence sources and boundaries

The report uses source code, local Git history, package manifests, fresh command output, the supplied `Written Deliverable.docx`, and extracted text from `Team 6 Inception - Presentation.pptx`. The repository also contains `documents/Inception.pdf`. The written deliverable and presentation supplied the original goals, team information, use cases, intended OO principles, risks, and definition of done.

The inception document's competitor comparisons are historical project claims; this report does not revalidate product pricing or competitive claims. It concentrates on the team's own implementation. No live customer data, database rows, credentials, passwords, or bearer tokens were copied into the report.

Source paths in this report are relative to the repository root. Appendices are generated from Python ASTs, TypeScript exports, Git's file inventory, and ORM metadata. SHA-256 digests in `evidence/source-inventory.json` identify the application files inspected. Evidence does not establish who wrote a particular feature or how long it took.

### 2.2 Observed milestones

| Date | Evidence | Observed result |
| --- | --- | --- |
| September 6, 2026 | `544d9c1` | Inception PDF committed; the supplied inception materials describe the initial project vision. |
| September 12, 2026 | `6848b58` | Initial Personal Finance Manager application committed with backend layers, React screens, authentication, and core tests. |
| September 16, 2026 | `271b5e6` | Expanded finance workflows, imports, shared controls, Move Funds, Split Bill, and its simpler page committed. The commit changes 77 files. |
| September 17, 2026 | Local working changes | Session-restoration and 401 recovery fix in App, the shared API client, Login, and a new frontend test file. |
| September 17, 2026 | This report and evidence directory | Repository review, requirement mapping, fresh verification, and iteration documentation. |

These dates are repository milestones, not a reconstructed daily sprint log. Only three commits were visible during inspection. There is no basis for claiming daily standups, exact hours, velocity, or individual task completion dates.

### 2.3 Committed versus local work

The latest committed SHA is `271b5e6f76671cf64b5bf12915d0149a85e0e7c8`. The local session fix changes `frontend/src/App.tsx`, `frontend/src/api/client.ts`, and `frontend/src/pages/LoginPage.tsx`, and adds `frontend/tests/authSession.test.mjs`. These were uncommitted when the evidence snapshot was captured. Consequently, a clean checkout of that SHA will not yet contain the described session fix or all 13 frontend tests.

The documentation files are a new deliverable. Preparing this report does not commit or publish them. Before submission, record the final submitted commit separately if the team commits the local fixes and documentation.

## 3. Requirements and traceability

The IDs below are assigned for this report; the inception document did not provide numbered requirement identifiers. “Implemented” means an executable source path exists. “Partial” means the intended feature has a material limit or inconsistency. It does not mean formal user acceptance has occurred.

| ID / requirement | Current implementation and source | Status / evidence |
| --- | --- | --- |
| FR-01 Register and sign in | `api/auth.py`, `services/auth_service.py`; Login/Register pages | Implemented. Password hashing and bearer tokens; registration validation tests. |
| FR-02 Manage accounts | `api/accounts.py`, `services/account_service.py`; Accounts and Settings | Implemented CRUD and computed balance; ownership isolation remains incomplete. |
| FR-03 Record income/expense | `api/transactions.py`, `services/transaction_service.py`; AddTransactionPage | Implemented single/bulk creation and protected endpoints. |
| FR-04 Categorize and edit transactions | Fixed category catalog; TransactionsPage search/filter/editor | Implemented; generic edit/delete is blocked for Split Bill-linked transactions. |
| FR-05 Create monthly budgets | Budget schemas, repository, service, and BudgetsPage | Implemented; duplicate category/month/year rejected by service. |
| FR-06 Track budget usage | `domain/budget.py`, `frontend/src/domain/budgeting.ts` | Implemented calculation; frontend/backend alert thresholds differ. |
| FR-07 Savings goals | SavingsGoal class/service and SavingsGoalsPage | Implemented CRUD/progress; frontend contribution heuristics differ from backend stored amounts. |
| FR-08 Recurring income/expenses | Recurring model/API; recurring page and matching service | Partial. Schedules and expense matching exist; no background scheduler posts transactions. |
| FR-09 Dashboard | DashboardPage reads accounts, transactions, budgets, goals, schedules | Implemented; some dashboard totals are all-time while budget/report views are monthly. |
| FR-10 Budget/bill alerts | AlertService; budgeting and recurringBills helpers; AppShell | Partial. In-app dynamic alerts exist; three unrelated notifications are mock data. |
| FR-11 Affordability | Backend calculator/API; richer frontend purchaseAnalysis and AffordabilityPage | Partial. Both exist but implement different calculations; the page does not use the simple API calculation. |
| FR-12 Monthly reports | ReportService/FinancialReportBuilder; ReportsPage | Implemented current-month UI and parameterized API; no historical picker/export UI. |
| FR-13 First-use guidance | OnboardingPage and HelpPage | Implemented setup steps and help; setup state/preferences use browser storage. |
| FR-14 Import financial data | TransactionImportPanel and merchantIntelligence | Partial. CSV preview/import works; general image/PDF extraction interfaces remain placeholders. |
| FR-15 Move Funds | MoveFunds component, TransferService, TransferModel | Implemented Savings-to-Checking transfers with balance checks and separate ledger; tested. |
| FR-16 Split receipt by people | SplitBillPage; splitBill.ts; split_bill.py | Implemented shared-item and proportional tax/tip allocation with cent reconciliation; tested. |
| FR-17 Scan Split Bill receipt | `services/splitReceipt.ts`, Tesseract.js | Implemented OCR integration/parser; live OCR accuracy and device capture not tested. |
| FR-18 Track bill payment and repayment | SplitBillService and optional payment dialog | Implemented once-only payment, repayment replacement, partial/overpayment, and undo; tested. |
| FR-19 Handle expired sessions | Local shared-client/App/Login changes | Implemented locally; eight new frontend session tests pass. Not in the recorded committed SHA. |
| NFR-01 Ease of use | Shared controls, onboarding, simplified Split Bill flow | Design implemented; user study and browser acceptance pending. |
| NFR-02 Reliable money calculations | Decimal rules, integer-cent splitting, automated tests | Partial assurance; estimates elsewhere still use JavaScript Number and duplicated logic. |
| NFR-03 Secure data and credentials | Hashing, authentication, some owner filtering | Incomplete. General finance ownership and secure deployment configuration are priorities. |
| NFR-04 Reproducible local execution | README, package manifests, lockfile, tests | Local build verified; clean-machine installation not independently exercised. |

## 4. Architecture and repository organization

### 4.1 Runtime structure

```text
Browser: React screens and shared glass UI
  |  App.tsx session state and page selection
  |  api/*.ts typed calls + bearer token
  v  HTTP JSON to http://127.0.0.1:8000
FastAPI route functions + Pydantic schemas
  |  get_current_user and get_db dependencies
  v
Application services ----> financial domain rules
  |
  v
Repositories / direct SQLAlchemy operations
  |
  v
SQLite: finance_manager.db

Browser-local side paths:
  localStorage -> session, theme, onboarding, preferences
  Tesseract.js -> Split Bill image text -> editable item list
```

FastAPI application creation runs table creation and compatibility migration, configures CORS for localhost/127.0.0.1 development origins on ports 5173 and 5174, registers protected routes, and exposes root/health routes. A dependency-injected SQLAlchemy Session is closed after each request. The SQLite path is relative to the process working directory, so starting the backend from the documented folder matters.

The frontend mounts React in `main.tsx`. `App.tsx` selects pages through a `Page` state union; it is not a full client-router configuration. Only login/register navigation explicitly changes browser history. Refreshing a finance page generally returns to the dashboard/onboarding flow rather than restoring that screen's URL.

### 4.2 Layer responsibilities

| Location | Responsibility | Representative files |
| --- | --- | --- |
| `backend/app/api` | HTTP methods, request dependencies, status codes, response contracts | accounts.py, split_bills.py |
| `backend/app/schemas` | Pydantic field constraints and serialization | account_schema.py, split_bill_schema.py |
| `backend/app/services` | Use-case orchestration and business validation | account_service.py, transfer_service.py |
| `backend/app/domain` | Finance objects and deterministic calculations | budget.py, split_bill.py, money.py |
| `backend/app/repositories` | ORM models and database access | models.py, base.py |
| `backend/app/core` | Infrastructure configuration, database setup, authentication | database.py, security.py |
| `frontend/src/pages` | User-facing screens and their state | SplitBillPage.tsx, BudgetsPage.tsx |
| `frontend/src/components` | Shared UI and application chrome | AppShell.tsx, MoveFunds.tsx, ui/GlassSelect.tsx |
| `frontend/src/api` | Typed network adapters and refresh events | client.ts, transactions.ts |
| `frontend/src/domain` | Client calculations and classification rules | budgeting.ts, purchaseAnalysis.ts |
| `frontend/src/services` | Receipt extraction/parsing integrations | splitReceipt.ts, receiptExtraction.ts |
| `frontend/src/styles`, `theme` | Layout, reusable styling, color variables | tokens.css, components.css |
| `backend/tests`, `frontend/tests` | Automated verification | test_split_bills.py, authSession.test.mjs |

The layering is useful but not absolute. Transfer and Split Bill services use ORM queries directly rather than dedicated repositories. The backend Split Bill calculation imports its schema type. Complex frontend screens also contain business calculations. These are documented architectural tradeoffs, not evidence of a completely isolated domain layer.

### 4.3 Typical mutation and refresh sequence

```text
User submits a form
 -> page validates input
 -> typed API module calls shared client
 -> API validates token and request schema
 -> service validates records and computes changes
 -> database commit
 -> JSON response
 -> frontend dispatches a finance-updated event
 -> mounted listeners reload relevant data
 -> future page mounts also fetch the latest data
```

Transaction, budget, savings-goal, and recurring modules define browser update events. Transfers and Split Bill changes reuse the transaction event. AppShell refreshes relevant notifications and pages reload their own data. Some pages also reload on window focus. This is an in-browser event mechanism, not WebSockets, server push, or cross-device synchronization.

## 5. Object-oriented design and design patterns

### 5.1 Actual class responsibilities

| Class / family | Responsibility and relationships |
| --- | --- |
| User | Frozen domain dataclass containing profile identity fields. The actual persistence user has authentication/profile attributes. |
| Account | Domain name/starting balance and income/expense calculation. Production AccountService additionally applies transfers. |
| Transaction / TransactionType | Frozen financial record plus an income/expense enumeration. Income and Expense subclasses are not implemented. |
| Budget | Encapsulates a category/month limit and usage, remaining amount, and percentage calculations. |
| SavingsGoal | Validates goal amounts and exposes remaining/progress properties with bounds. |
| RecurringTransaction | Describes a repeated finance entry and its frequency/due date. |
| FinancialReportBuilder / MonthlyReport | Constructs income, expense, cash-flow, and expense-category summaries. |
| AffordabilityCalculator / AffordabilityResult | Evaluates the backend's simple purchase-impact rule and returns a value result. |
| Notification / AlertLevel | Represents an alert message, severity, and source. |
| BaseRepository[T] and specialized repositories | Provide reusable CRUD and resource-specific queries. |
| Service classes | Compose repositories and calculation objects to implement application operations. |
| ORMModel and request/read schemas | Reuse Pydantic configuration and resource definitions through inheritance. |
| SQLAlchemy models | Inherit declarative Base and map stored columns/relationships. |

### 5.2 OO principles demonstrated

**Encapsulation:** Budget and SavingsGoal contain calculations associated with their financial state. Services centralize transfer balance validation and Split Bill payment handling. Frozen value dataclasses reduce accidental mutation. Encapsulation is not complete: several dataclasses have public fields, ORM state is mutable, and screens still calculate some derived values directly.

**Abstraction:** Routes call services instead of implementing most database operations themselves. Repositories expose CRUD while hiding query details. Pydantic schemas define the boundary between HTTP JSON and typed application values.

**Inheritance:** Specialized repositories inherit the generic BaseRepository. Read schemas extend creation schemas, and ORM models inherit SQLAlchemy Base. This is the inheritance present in the implementation. The inception's proposed Income/Expense subclass hierarchy was replaced by a single Transaction class with an enum; it should not be claimed as completed inheritance work.

**Composition:** Services hold repository/calculator instances. React pages compose shared cards, inputs, buttons, selectors, and dialogs. Account persistence has a transaction collection relationship. A domain User object does not currently own collections of accounts/goals as the inception's illustrative composition discussion suggested.

**Polymorphism:** Generic repositories reuse the same operations with different model types, and shared React component props allow different use contexts. There is no formal family of interchangeable affordability/budget strategies or extensive overridden transaction methods. This distinction matters when explaining the project to an OO evaluator.

### 5.3 Patterns: proposed versus implemented

| Pattern | Evidence | Assessment |
| --- | --- | --- |
| Repository | BaseRepository plus account, transaction, budget, goal, recurring, and user repositories | Implemented, with direct ORM exceptions in newer services. |
| Observer-style events | `window.dispatchEvent` and `addEventListener` for finance changes | Implemented as browser publish/subscribe behavior. |
| Dependency injection | FastAPI Depends supplies sessions/current users | Implemented infrastructure mechanism. |
| Strategy | Proposed in inception for finance strategies | Not implemented as an interchangeable class/interface hierarchy. |
| Layered architecture | API, schema, service, domain, repository/core directories | Implemented with the coupling exceptions described above. |

## 6. Data model and persistence

### 6.1 Stored entities

| Table | Main stored information | Important relationship or limit |
| --- | --- | --- |
| users | Name, unique email, phone, occupation, password hash | Referenced by friends and split_bills. |
| accounts | Bank/name/type and starting balance | No user_id. Current balance is computed rather than stored. |
| transactions | Account, positive amount, type, category, date, note, optional receipt JSON | Account foreign key; normal transaction types are income/expense. |
| transfers | Source/destination account IDs, amount, date, note | Two account foreign keys; separate from income/expense transactions. |
| budgets | Category, monthly limit, month, year | No user_id; service checks duplicates. |
| savings_goals | Name, target/current amount, monthly income, target date | No user_id or explicit contribution-to-goal relationship. |
| recurring_transactions | Account, amount/category/type, frequency, due date, reminders, payment-match state | Account foreign key; matched transaction ID is stored as an integer. |
| friends | User ID and name | Owner-filtered through the Split Bill API. |
| split_bills | User ID, JSON draft, payment transaction ID, JSON repayment map | Owner-filtered bills; transaction links are logical integer/JSON references. |

```text
users 1 -------- * friends
users 1 -------- * split_bills
accounts 1 ----- * transactions
accounts 1 ----- * recurring_transactions
accounts 1 ----- * transfers (as source)
accounts 1 ----- * transfers (as destination)
split_bills - - -> transactions (logical payment/repayment IDs)
budgets and savings_goals currently stand alone
```

The full field dictionary, nullability, and declared foreign keys appear in the generated appendix. The diagram distinguishes declared relationships from logical references. SQLite foreign-key enforcement is not explicitly enabled in the inspected engine setup. ORM account-to-transaction cascade exists, but it is not a complete deletion policy for all related entities.

### 6.2 Monetary and JSON representation

Persistent monetary columns generally use `Numeric(12, 2)`. Schemas use Decimal with field limits. Backend money helpers round to cents using ROUND_HALF_UP. Decimal representation expresses the intended precision; SQLite's storage behavior is not equivalent to a fully enforced fixed-decimal database constraint. Input validation and tests remain important.

Receipt details and Split Bill drafts/repayments are stored as JSON. A Split Bill draft contains title, people IDs/names, payer identity, item IDs/names/quantities/unit prices/assignments, tax, tip, receipt total, tip method, selected account/category, and bill date. Repayment records map a person ID to the actual amount and linked transaction ID. Bills preserve a person's actual repayment when the calculated share changes.

### 6.3 Migrations and transaction boundaries

Startup uses `Base.metadata.create_all` followed by column-inspection-based migration. Existing account names containing Savings or Checking are classified when the account_type column is introduced. Other migrations add profile, receipt, recurring-match, and goal-income fields. This is an incremental compatibility mechanism rather than an Alembic/versioned migration history.

Transfers lock before reading balances, create one transfer record, and commit or roll back. Split Bill payment/repayment paths likewise serialize their relevant changes and commit atomically. Concurrency tests cover competing transfers and duplicate bill-payment requests. General transaction creation and recurring matching can use separate commits, so atomicity should not be generalized to all workflows.

### 6.4 Browser storage

The browser stores the bearer token and cached user, theme preference, onboarding draft/step/completion, budgeting preferences, import history, and savings completion markers. Some keys are user-email-specific; others are shared across users of the same browser. Browser storage is not a substitute for persisted finance records and is not synchronized across devices. Clearing it may reset setup/preferences, while the backend records remain.

## 7. Feature and screen walkthrough

### 7.1 Authentication, profile, and onboarding

Registration collects a name, email, US-style phone number, and password. The server normalizes email, rejects duplicates, hashes the password, and returns a bearer token with user details. Login verifies the stored password hash. Settings provides profile editing, password change, theme selection, and account deletion. Profile email changes issue a replacement token.

Onboarding offers Welcome, Goals, Account, Income, Budget, Savings, Bills, and Summary steps. It can be skipped. Relevant steps create real API records; local state supports resuming setup. This is not one database transaction across the entire wizard. Help explains major workflows. The Login page's Forgot password control has no implemented recovery workflow.

### 7.2 Accounts and Move Funds

Accounts displays computed balances and account summaries. Settings creates, renames, classifies, and deletes financial accounts. Bank names are labels selected from a catalog; selecting a bank does not connect to a real institution.

Move Funds appears only when at least one account is typed Savings. The source dropdown contains Savings accounts; the destination contains Checking accounts; account name, bank, ID, and balance help distinguish multiple accounts. The user enters a positive amount and optional note. Without a Checking account the form explains why submission is disabled.

The server verifies that both accounts exist, differ, have the required types, and that the transfer is within the current Savings balance. A transfer changes the two computed balances while preserving combined funds and income/expense report totals. Accounts referenced by transfers cannot be deleted through AccountService. This is local financial bookkeeping, not a bank-network payment.

### 7.3 Transactions, imports, and receipt metadata

Add Transaction supports manual income/expense entry with an account, amount, category, date, and note. Transactions lists records by month and supports text search and type/source/month filters. Its editor changes normal records. The API also supports deletion and bulk creation; not every API operation has a dedicated visible control on every screen.

TransactionImportPanel supports CSV header mapping, preview, row selection, duplicate suggestions, and bulk creation. Merchant/category/subscription suggestions are keyword/history heuristics, not an AI model. Receipt item metadata can be captured. The general `extractReceipt` and `extractBankStatement` functions return an unavailable result, so general receipt OCR and PDF bank extraction are not complete. File-name inference is a hint, not scanned receipt evidence.

Split Bill uses a separate real Tesseract.js integration. The report therefore does not describe every image-upload feature as OCR-enabled. Duplicate suggestions in the import panel are not a backend uniqueness guarantee and do not automatically prevent entering the same bill manually and through another workflow.

### 7.4 Budgets and dashboard

Budgets provides month/year selection, category budgets, planned-versus-actual spending, a 50/30/20-style classification plan, editable group preferences, health labels, and projected spending. Preferences are browser-local. The spending projection is available for the current month after at least four elapsed days and incorporates recurring expense estimates.

Dashboard aggregates available balance, income, spending, recent transactions, category budgets, savings goals, and upcoming bills. Income/spent totals use the loaded transaction list rather than a universal current-month filter. A difference from Monthly Report can therefore be a period difference rather than an arithmetic error.

### 7.5 Savings goals

The backend stores goal targets/current amounts and computes remaining/progress. The UI adds monthly targets, progress planning, completion markers, and projected completion. It also infers contributions from expense notes matching the goal name or special savings categories. A generic savings-category expense can match multiple goals; this heuristic needs an explicit contribution model before it can be treated as reliable goal accounting.

Saving money toward a goal is not currently integrated with the Transfer ledger. A Savings-to-Checking transfer changes account balances but does not directly update a goal's stored current_amount.

### 7.6 Recurring bills and notifications

Recurring entries store weekly/monthly schedules, due date, named bill, auto-pay indicator, and reminder settings. A newly recorded expense can match a schedule by account, amount, date window, and descriptive terms. A match records paid information and advances the due date. Default reminder timing includes 7, 3, and 1 days before, the due day, and overdue.

An auto-pay indicator records a status; it does not initiate a bank debit. No background worker executes due payments or sends email/SMS. Notifications are calculated in the browser from records and refresh events. AppShell also starts with mock savings/spending/account-sync notifications; those must not be presented as measured user activity.

### 7.7 Affordability and reports

The frontend compares cash purchase, financing, and leasing using recorded balances, recent transaction history, recurring outflows, goal pacing, and budget headroom. It shows insufficient-information states. Financing uses an amortization formula; leasing uses entered payment/upfront/term/buyout values. These are estimates, and unentered fees are not automatically known.

The backend `/affordability/check` implements a simpler formula with a different recurring horizon and savings deduction. It is exposed but is not the current rich page's calculation source. The two approaches need consolidation and cross-layer tests.

Monthly reports compute income, expenses, net cash flow, and category totals. The API accepts a month/year. The page requests the current month and displays an income/expense donut and net cash flow. There is no implemented report export, historical period picker, or external analytics service.

### 7.8 Split Bill: simplified primary flow

1. Receipt: Scan Receipt opens a camera-oriented file input; Upload Receipt opens an image picker. OCR fills restaurant/title, item lines, subtotal evidence, tax, tip, and total. The receipt and recognized text can be reviewed. Manual entry is available.
2. Who's splitting: The user and saved friends appear as chips. Add Friend persists a friend and includes that person. Removing a selected friend removes that person's item assignments, except where an existing repayment protects the person from removal.
3. Select what you ordered: Each item displays its name/price, quantity control, and person checkboxes. Multiple selected people divide that line equally. An editor handles item name, unit price, quantity, and removal.
4. Tax & Tip: The page displays subtotal, tax, tip, and total. A secondary editor corrects OCR values and offers calculated tip percentages. Allocations update automatically.
5. Everyone's Share: Each person has item names, shared-item annotations, subtotal, tax, tip, and final total. The user's card is identified as Your Share.
6. Split Bill: The large final button is enabled only for a nonempty, positive, fully assigned split whose allocated total equals the entered/extracted receipt total. A new split does not require an account and saving it does not debit a bank balance.

The page reuses the existing theme and shared controls. Its receipt parser treats scanned line totals as quantity 1 instead of guessing a unit price. Quantities/prices remain editable. A scan can miss discounts, lines, handwritten tips, or totals; total reconciliation and human review are still required. The application does not invite friends to a shared live session: assignments are managed on the current user's screen.

### 7.9 Optional Split Bill financial step

After a saved, unchanged split, Payment & repayments opens a secondary dialog. The payer selects an existing account and whether the tip came from that account or cash. Recording payment creates one expense for subtotal + tax + bank-paid tip. Repeating the pay operation on the same saved bill does not create another expense.

A friend's Payment received checkbox opens an actual-amount confirmation. A repayment creates Refund-category income into the original paying account. An override replaces the recorded amount instead of adding the whole amount again. Partial repayments and overpayments are displayed; undo removes the related credit. The full bill expense and repayment income remain separate in reports and budget accounting.

Editing an already paid bill adjusts its original expense after confirmation, preserving actual repayments. The paying account and payer identity cannot be changed after payment. Linked expense/repayment records must be managed through Split Bill, and the paying account is protected from deletion. This prevents ordinary edits from silently breaking the bill ledger.

## 8. Financial rules and worked examples

### 8.1 Account and budget equations

```text
Account balance = starting balance
                + recorded income - recorded expenses
                + incoming transfers - outgoing transfers

Budget used = sum(expense amounts matching category and month/year)
Budget remaining = monthly limit - used
Budget usage % = 100 * used / limit  (0 when limit is zero)

Report net cash flow = monthly income - monthly expenses
Goal remaining = max(target - current, 0)
Goal progress = min(100 * current / target, 100)
              (100 when target is zero)
```

AccountService is the authoritative API balance calculation. The older domain Account method does not include transfers. A zero budget limit producing 0% is the backend's present behavior, not a financial recommendation. Frontend health/progress classifications should be reconciled with that behavior.

### 8.2 Transfer example

Savings has $100 and Checking has $20. Moving $35 produces Savings $65 and Checking $55. Combined funds stay $120; there is no income/expense transaction and report totals do not change. Moving $100.01 from the original $100 Savings account fails. Two concurrent $75 transfers from $100 Savings result in one accepted transfer and one rejection in the tested scenario.

### 8.3 Exact Split Bill allocation

Amounts are converted into integer cents. Each line amount is quantity multiplied by unit price. A shared line is allocated equally to its selected people. Tax and tip are each allocated in proportion to people's allocated item subtotals.

For an amount C cents and nonnegative weights w, first assign `floor(C * w_i / sum(w))`. Then allocate the remaining cents to the largest fractional remainders, breaking ties by person order. This is deterministic and preserves the total. The TypeScript implementation uses BigInt for allocation products; the backend uses Python integers. The remainder rule is applied separately to line amounts, tax, and tip.

| Item | Assignment | Ujjwal | Friend |
| --- | --- | --- | --- |
| Burger $15.00 | Ujjwal | $15.00 | $0.00 |
| Fries $6.00 | Friend | $0.00 | $6.00 |
| Pizza $20.00 | Both equally | $10.00 | $10.00 |
| Items subtotal | $41.00 | $25.00 | $16.00 |
| Tax $4.10 | Proportional | $2.50 | $1.60 |
| Tip $8.20 | Proportional | $5.00 | $3.20 |
| Final amount | $53.30 | $32.50 | $20.80 |

Checks: $25 + $16 = $41; $2.50 + $1.60 = $4.10; $5 + $3.20 = $8.20; $32.50 + $20.80 = $53.30. A $1 shared item among three people allocates $0.34, $0.33, and $0.33. A person with zero weight receives no allocated tax/tip under the normal positive-subtotal rule.

### 8.4 Payment, cash tip, and overrides

With a $100 bank balance and the example bill, bank-paid tip produces a $53.30 expense and a $46.70 balance. Cash-paid tip produces a $45.10 bank expense and a $54.90 bank balance; the $8.20 tip remains part of everyone's share but is not represented as a bank debit.

After the $53.30 bank payment, receiving the friend's $20.80 gives $67.50. Replacing that repayment with $25 gives $71.70, an additional $4.20 rather than another $25 credit. Replacing it with $10 gives $56.70 and shows $10.80 still owed. Undo returns the bank balance to $46.70. Actual cash handling outside the selected bank account is not tracked by a separate cash ledger here.

### 8.5 Affordability and budget estimates

The backend affordability equation is `available - upcoming required - remaining goal target - purchase`. A nonnegative result sets can_afford true. Its service includes recurring expense records due through the current month's day 28, without a lower-date bound, and subtracts full remaining goal targets. The known horizon limitation needs correction rather than being described as a rolling 30-day forecast.

The frontend builds a recent three-calendar-month snapshot, averages over months represented in the transaction data, estimates recurring monthly equivalents, and uses goal pacing. Cash status compares post-purchase balance with a buffer based on known outflows plus monthly goal pacing. A financed payment is `P * r * (1+r)^n / ((1+r)^n - 1)`, or `P/n` at zero interest, with monthly rate r. Missing history produces an unknown result. These frontend functions do not implement a formal Strategy class.

Budget spending projection approximately extrapolates non-recurring spending pace to month end, then includes matched and scheduled recurring costs. It is an estimate requiring explicit boundary/date tests. It should not be confused with actual transaction posting or a guaranteed remaining bank balance.

## 9. API contracts and integration

The API base in the frontend is `http://127.0.0.1:8000`. Protected requests use `Authorization: Bearer <token>`. Login, registration, root, and health are public; finance routes require the current-user dependency. Split Bill and friends also filter by user ID, while general finance resources currently do not.

The 46 declared routes are listed in Appendix B with method, path, handler/source, and authentication requirement. Important groups include accounts, transactions/bulk, budgets/alerts, savings-goals, recurring-transactions, reports/monthly, affordability/check, transfers, and split-bills/friends/payment/repayment. FastAPI provides interactive docs at `/docs` and a generated schema at `/openapi.json`.

| Contract | Significant validation / behavior |
| --- | --- |
| AccountCreate/Update | Name/bank limits, nonnegative starting balance, Savings/Checking/Other type; omitted creation type inferred from name. |
| TransactionCreate/Bulk | Existing account checked by service, money precision, enum type, category/date/note; bulk size bounded. |
| BudgetCreate | Money and calendar limits; duplicate category/month/year checked in service. |
| TransferCreate | Positive source/destination IDs, positive amount with two decimal places, optional 255-character note. |
| SplitBillDraft | People/item list bounds, unique IDs, payer membership, item assignments referring to existing people, quantities/prices/tax/tip limits. |
| RepaymentUpdate | Received boolean; optional positive actual amount. Replaces the previous total for the person. |

Common responses include 201 creation, 204 successful deletion, 400 business-rule rejection, 401 authentication failure, 404 missing resource, 409 conflicting operation, and 422 schema validation. Exact route declarations vary; the generated inventory is the reference. A denied action should not be treated as a successful UI save.

## 10. User interface and accessibility

The frontend uses CSS custom properties for light and dark themes, forest-green accents, translucent surfaces, borders, shadows, and reusable controls. `GlassSelect`, `DatePicker`, `TextField`, `Button`, `IconButton`, `GlassCard`, and `Modal` provide consistent form behavior. `frontend/COMPONENTS.md` explicitly requires shared dropdowns and date pickers.

Navigation consists of a bottom bar and a drawer. Split Bill is in the drawer; previous splits are in a secondary dialog. Its redesigned main flow removes account selection, dates, categories, and repayment checkboxes until an optional step. A large final action replaces multiple competing save/payment actions.

Implemented accessibility measures include labels, native assignment checkboxes, aria-pressed friend chips, descriptive icon-button labels, status/alert messages, visible keyboard focus, dialog roles, focus management, and responsive wrapping. The modal and dropdown components attempt keyboard interactions and focus handling. These are code-level measures, not an accessibility certification.

No runtime screenshots, screen-reader audit, contrast measurements, browser/device test matrix, or observed user-study results are included. The inception presentation contains prototype visuals; they must not be labeled as screenshots of this current build. Camera capture behavior depends on browser/device support. A further UI evaluation should verify dropdown focus within dialogs, mobile scrolling, long names, many friends, and keyboard-only operation.

## 11. Authentication and the 401 defect

### 11.1 Symptom and diagnosis

After successful Uvicorn startup, repeated requests to accounts, budgets, transactions, savings goals, and recurring transactions returned 401. The configuration issues 24-hour tokens. The previous frontend restored a logged-in user solely from cached profile JSON and did not react globally to unauthorized responses. Therefore, an expired or otherwise rejected token could leave finance screens mounted and repeatedly fetching data.

Token expiration is the likely explanation for the reported logs, but the actual browser token was not inspected. A missing token, invalid signature, or removed user can also cause 401. The startup logs themselves do not indicate a server crash.

### 11.2 Local repair

The shared API client checks cached token structure/expiration before protected requests, keeps login/registration public, clears a rejected session, and dispatches a session-expired event. App restores a cached profile only with a current-looking token, handles the event, resets finance page state, and shows Login with an explicit sign-in-again notice. Corrupt profile JSON falls back to Login. An old in-flight 401 must not clear a replacement token from a newer login.

Client token decoding is only a usability check; it does not verify a signature or replace server authentication. Network failures and ordinary 403 responses do not expire a valid session. All five client mutation/read helpers use the shared handling. The change is local and has not been included in the documented commit SHA.

### 11.3 Remaining authentication limitations

The backend uses a development secret in source configuration, manual JWT handling, and localStorage token persistence. It has no refresh-token flow, rate limiting, password reset, or explicit server token revocation. Password change currently returns 401 when the supplied current password is incorrect; the new shared handler treats any protected 401 as session rejection, so that case can log the user out. This is a follow-up API semantics issue, not a passing test claim.

## 12. Testing and verification evidence

### 12.1 Fresh verification results

| Verification | Result on September 17 | Evidence |
| --- | --- | --- |
| Backend `python -m pytest -q` | 45 passed; 2 dependency deprecation warnings | `evidence/backend-tests.txt` |
| Frontend Node tests for authentication and Split Bill | 13 passed (8 authentication, 5 calculation/parser) | `evidence/frontend-tests.txt` |
| `npm run build` | TypeScript and Vite build passed; 1,768 transformed modules | `evidence/frontend-build.txt` |
| Initial sandboxed build | Failed reading Vite configuration because of sandbox filesystem access | `evidence/frontend-build-sandbox.txt` |

The successful build was rerun outside the restrictive sandbox. Both the failed environmental attempt and successful output are retained. Dependency warnings concern Starlette's httpx integration and AnyIO's BlockingPortal alias; they were not assertion failures. Recorded durations are individual local observations, not performance benchmarks.

### 12.2 What the tests establish

Backend tests cover representative affordability decisions; monthly budget/report arithmetic; goal progress and validation; registration/profile schema migration; recurring expense matching; transfers; and Split Bill services/API behavior. Transfer tests include exact-balance movement, unchanged report/budget totals, invalid amounts/accounts/direction, migration classification, protected deletion, and competing withdrawals. Split Bill tests cover shared allocation, odd cents, quantities, bank/cash tips, repeated pay calls, repayment override/undo, paid-bill edits, insufficient funds, ownership checks for bills, linked transaction guards, parallel payment, and API persistence/authentication.

Frontend Split Bill tests verify the worked example, exact allocation for odd/large values, unassigned/mismatched totals, separation of receipt line items from totals/tender, subtotal extraction, and conservative quantity parsing. Authentication tests verify restoration, missing/corrupt storage, pre-request expiry rejection, 401 invalidation, failed login handling, replacement-session protection, preservation on network/403 errors, and successful JSON/delete behavior.

The generated test-function appendix names test definitions, not executed test-case counts. Parameterization expands some backend functions into multiple cases. Do not add the function count to the executed test count or label the 58 automated test executions as 58 user acceptance tests.

### 12.3 Not yet verified

There is no measured coverage percentage, full browser automation, live OCR fixture/device validation, user acceptance sign-off, load test, security penetration test, CI pipeline execution, or clean-machine installation record. Calculation tests do not prove the redesign's keyboard/mobile usability. OCR parser tests operate on text rather than actual photo recognition. Passing current tests does not demonstrate ownership isolation for the general finance endpoints.

### 12.4 Proposed manual acceptance script

The following is a reproducible acceptance plan, not a claim that every step was executed during this report.

1. Start the backend and frontend from the documented folders; verify Login and health/docs access.
2. Register a test profile, complete or skip onboarding, and switch themes.
3. Create Savings $100 and Checking $20. Move $35 and observe $65/$55 with unchanged combined funds and report income/expenses.
4. Confirm Move Funds is absent when no Savings account exists and that an excessive amount cannot be submitted.
5. Create a normal categorized expense and monthly budget; inspect dashboard, budget, and report updates.
6. Create a new Split Bill without choosing a bank account. Enter the burger/fries/pizza example, assign people, tax $4.10, tip $8.20, and receipt total $53.30.
7. Confirm $32.50/$20.80 shares; remove an assignment or alter the receipt total and confirm Split Bill is disabled.
8. Save the split; verify the optional payment step appears. Test bank-tip and cash-tip outcomes on separate fresh bills.
9. Record and override a friend's repayment, then undo it; verify bank balances and no duplicate transactions.
10. Upload a clear receipt photo, inspect extracted fields against the image, and correct any errors before saving.
11. Exercise the flow at phone/tablet/desktop widths, using keyboard-only input and both themes.
12. Log out, simulate a stale session in a test environment, and verify return to Login rather than repeated unauthorized finance requests.

## 13. Known limitations and risk register

Severity below reflects code-review priority for this prototype. It is not a penetration-test rating. Proposed owners should be assigned by the team; no individual is inferred responsible from the repository.

| ID / priority | Evidence-backed issue | Recommended next action |
| --- | --- | --- |
| R-01 High | accounts, budgets, goals, transactions, recurring entries, and transfers lack consistent user ownership/filtering. Authentication alone does not isolate their data. | Add owner relationships, migrate records deliberately, scope all reads/mutations, and test two-user isolation. |
| R-02 High | Development JWT signing secret is defined in config; there is no implemented environment-secret loading path in that Settings class. | Introduce real environment configuration, rotate deployment keys, and test startup validation. |
| R-03 High | Frontend/backend affordability and savings calculations diverge. Domain Account omits transfers that AccountService includes. | Define one financial contract, consolidate calculations or add cross-layer fixtures, and make retained legacy code explicit. |
| R-04 Medium | General image/PDF import extraction is unavailable; Split Bill OCR lacks live-photo tests and depends on OCR resource downloads. | Label supported flows accurately, add representative receipt fixtures and failure tests, and choose a PDF strategy. |
| R-05 Medium | Savings contributions are inferred by notes/category and can match several goals. | Introduce explicit goal contribution records and migration rules. |
| R-06 Medium | User/account deletion is not a complete related-record lifecycle policy; some links are JSON/plain integers and SQLite FK enforcement is not configured. | Define archival/deletion semantics, enforce integrity, and test related entities. |
| R-07 Medium | Backend budget warning starts at 80%; frontend uses 75/90/100% labels. Some generic backend-offline messages can hide unrelated errors. | Align thresholds and centralize accurate user-facing error handling. |
| R-08 Medium | Mock AppShell notifications can appear alongside live financial alerts. | Remove/demo-label mock notifications and persist real read status if needed. |
| R-09 Medium | No recurring posting worker, cross-device push, external bank connection, or real auto-pay execution. | Keep these out of claimed functionality; implement only if in approved scope. |
| R-10 Medium | Concurrent tests cover transfer/pay cases, not every edit/repayment/import interleaving. Duplicate imports remain possible. | Expand tests for actual identified race cases and introduce operation IDs where justified. |
| R-11 Medium | Shared handler expires a session on protected 401, including an incorrect current-password response. Password reset/token revocation are absent. | Separate authentication failures from operation validation; define recovery/revocation behavior. |
| R-12 Medium | Browser storage keys are not uniformly user-scoped; no formal privacy/storage policy. | Scope preferences/history consistently and choose a secure session-storage design. |
| R-13 Medium | Large page/CSS files and duplicate business rules increase maintenance cost; some new services bypass repositories. | Refactor around stable use cases after correctness priorities, preserving tests. |
| R-14 Medium | No browser accessibility/user-study evidence, no CI, no coverage report, and no independent deployment validation. | Add a focused acceptance matrix and an automated test/build workflow. |
| R-15 Low | README/Help wording partly predates the simplified Split Bill workflow; basic report UI has limited period controls. | Update usage documentation alongside the next functional change and prioritize historical reporting if required. |

The inception estimated risk exposures for scope creep, calculation errors, affordability complexity, team availability, and usability. Those original probabilities/hours were planning estimates; this report does not treat them as measured outcomes or fabricate revised numerical exposure. The additional features increase the need to control scope while completing the core data/security/verification work.

## 14. Setup, operation, and demonstration

### 14.1 Local setup

Use Python 3.11 or newer and a Node.js installation compatible with the repository's Vite/tooling versions. The observed Python version is 3.11.8; exact inspected package versions appear in Appendix A. Frontend dependencies have a lockfile; backend dependencies use minimum-version constraints and are not fully locked.

From the repository root, create/activate the backend environment if needed:

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
python -m uvicorn app.main:app --reload
```

In a second terminal from the repository root:

```powershell
cd frontend
npm ci
npm run dev
```

The documented frontend address is http://127.0.0.1:5173 and the backend is http://127.0.0.1:8000. Vite can choose a different port if occupied; only the listed development origins are allowed by backend CORS. API `/docs` exposes interactive contracts and `/health` reports process availability. Running the backend from the wrong working directory can create/use a different relative SQLite file.

### 14.2 Verification commands

```powershell
# From backend
.\.venv\Scripts\python.exe -m pytest -q

# From frontend
node --test tests/authSession.test.mjs tests/splitBill.test.mjs
npm run build
```

The auth test file is part of local uncommitted work at the snapshot. For the committed Split Bill tests alone, `npm run test:split-bill` is available. A Vite filesystem permission failure in the agent sandbox is distinct from an application compilation error; the successful rerun is retained as evidence.

### 14.3 Operational boundaries

`finance_manager.db`, virtual environments, node_modules, build outputs, and environment files are ignored by Git. Back up the local database before destructive manual experiments or migrations. Restarting the backend applies startup migrations/new tables. The frontend development server normally reloads modified source automatically; refresh and sign in again after the session fix.

Receipt scanning initially downloads OCR worker/core/language resources. The implementation passes the image to browser OCR; no application endpoint uploads the image to this backend. This is a code-path description, not an independent network audit. Unsupported images and timeout/error conditions have fallback messaging. External bank transfers, payment collection, and friend messaging are outside the implemented system.

## 15. Iteration assessment and next iteration

### 15.1 Achievements against the inception definition of done

| Inception completion condition | Current evidence | Assessment |
| --- | --- | --- |
| Accounts and categorized income/expense records | CRUD routes, UI flows, balance calculations | Implemented with security/ownership caveat. |
| Accurate budgets and savings progress | Unit tests and code formulas | Partially verified; savings attribution and cross-layer differences remain. |
| Working recurring transactions and alerts | Schedules, expense matching, dynamic reminders | Partial; no automated posting and some mock alerts. |
| Repeatable, documented affordability | Backend tests; frontend/backend equations documented here | Partial; formulas need a unified contract and broader tests. |
| Automated core domain tests | 45 backend executions and 13 frontend executions | Achieved for the tested scenarios, not complete coverage. |
| Runs from clean checkout | Setup instructions and local production build | Local build verified; clean-machine test remains pending and local auth fix must be committed. |

The iteration made tangible functional progress and improved Split Bill's usability structure. It is not ready to be described as a fully secure multi-user financial product. The most useful next iteration should stabilize correctness, user isolation, and evidence before adding further features.

### 15.2 Proposed next-iteration backlog

| Priority | Work item | Proposed acceptance criterion |
| --- | --- | --- |
| 1 | Isolate all financial records by user | Two users cannot list, read, modify, transfer, or repay against one another's records; migration and negative API tests pass. |
| 2 | Deployment/session configuration | Signing key is externally configured; incorrect password-change input does not invalidate a healthy session; session tests cover the agreed semantics. |
| 3 | Unify monetary contracts | Backend/UI fixtures agree for balances, goal contributions, affordability, recurring horizons, and budget thresholds. |
| 4 | Validate the simplified Split Bill UI/OCR | A documented receipt set reconciles after review; mobile/keyboard/light/dark acceptance steps have recorded outcomes. |
| 5 | Add repeatable engineering gates | CI runs backend tests, frontend tests, and production build; dependencies and database migration process are documented. |
| 6 | Finish documentation and submission metadata | Team confirms iteration number, roles/hours, submitted commit, screenshots, and instructor-specific template requirements. |

### 15.3 Retrospective grounded in observed work

Shared UI controls allowed the simpler Split Bill design to preserve theme and interaction conventions. Separate transfer records prevented accidental income/expense inflation, while repeat-payment guards and cent-allocation tests addressed important financial edge cases. The expired-token issue demonstrated that successful backend startup and successful authentication recovery are separate concerns.

The code review also shows the cost of adding functionality quickly: more business logic resides in large frontend files, some calculations differ by layer, and early prototype data remains in live-looking UI. A more disciplined next iteration should choose a small set of explicit acceptance criteria, verify them across layers, and then update the report from observed evidence.

## 16. Contribution records and submission checklist

The written inception document identifies Ujjwal Sood, Hardik Kari, David Aviles, and Ishika Sanghadia as Team 6. It does not provide this iteration's individual task assignments, work hours, meetings, peer-review records, or approvals. These must be supplied by the team rather than inferred from a Git author or generated report.

| Member | Iteration contribution / hours | Confirmation |
| --- | --- | --- |
| Ujjwal Sood | Not supplied; add verified tasks and actual hours if required. | Pending team review. |
| Hardik Kari | Not supplied; add verified tasks and actual hours if required. | Pending team review. |
| David Aviles | Not supplied; add verified tasks and actual hours if required. | Pending team review. |
| Ishika Sanghadia | Not supplied; confirm preferred full name and verified tasks/hours. | Pending team review. |

Before submitting, the team should confirm the requested iteration label/date range, professor's rubric and format, member contributions, final commit SHA, and any required screenshots or diagrams. Review the known-limitations section instead of deleting unresolved items or presenting them as implemented. If the instructor requires an AI-assistance statement, describe assistance accurately under the course policy rather than treating generated documentation as a personal work log.

## 17. Glossary and source references

| Term | Meaning in this repository |
| --- | --- |
| API | HTTP interface connecting browser actions with backend operations. |
| CRUD | Create, read, update, and delete stored records. |
| Domain object | A financial concept and associated rules, such as Budget or SavingsGoal. |
| ORM | SQLAlchemy mapping between Python model objects and database tables. |
| Schema | Pydantic contract for validated request/response data. |
| JWT / bearer token | Signed login token sent in the Authorization header. |
| OCR | Recognition of text from a receipt image; Split Bill uses Tesseract.js. |
| Reconciliation | Checking that allocated shares equal the expected receipt total. |
| Idempotent payment | Repeating the same saved-bill pay request does not charge it again. |
| Transfer | Money movement between accounts that is not income or expense. |
| Refund income | Existing transaction classification used to credit a Split Bill repayment. |

Primary repository references: `README.md`; `backend/app/main.py`; `backend/app/core`; `backend/app/repositories/models.py`; all route/schema/service/domain files; `frontend/src/App.tsx`; `frontend/src/api/client.ts`; `frontend/src/pages`; `frontend/src/domain`; the two extraction services; `frontend/COMPONENTS.md`; dependency manifests; and the tests identified in the appendices. Specific symbols and source line positions are available in the machine-readable evidence files.

Original course materials: the supplied Written Deliverable DOCX and Team 6 Inception presentation. The committed Inception PDF is listed as a repository artifact. Package documentation is not used to assert that unfinished project features are complete. No outside competitive or financial recommendation is required to understand this report.

## 18. Technical appendices

The following appendices are generated from the captured repository evidence. They complete the API, persistence, source-file, and test-definition inventory without reproducing every line of source code. Installed dependencies and generated artifacts are described at the package/build level, not as team-authored files.

## Appendix A. Captured environment

| Property | Value |
| --- | --- |
| Captured UTC | 2026-09-17T17:48:06.380125+00:00 |
| Git commit | 271b5e6f76671cf64b5bf12915d0149a85e0e7c8 |
| Branch | main |
| Python | 3.11.8 |
| fastapi | 0.141.1 |
| pydantic | 2.13.5 |
| sqlalchemy | 2.0.52 |
| uvicorn | 0.52.4 |
| pytest | 9.1.1 |
| httpx | 0.28.1 |
| react | 19.3.0 |
| react-dom | 19.3.0 |
| vite | 7.3.6 |
| typescript | 5.9.3 |
| lucide-react | 0.544.0 |
| tesseract.js | 7.0.0 |

## Appendix B. Complete declared API inventory

Paths below are application endpoints; FastAPI-generated documentation routes are excluded. Authentication does not imply per-user financial isolation.

| Method | Path | Authentication | Source |
| --- | --- | --- | --- |
| GET | /accounts | Bearer token | backend/app/api/accounts.py:12 |
| POST | /accounts | Bearer token | backend/app/api/accounts.py:17 |
| GET | /accounts/{account_id} | Bearer token | backend/app/api/accounts.py:22 |
| PATCH | /accounts/{account_id} | Bearer token | backend/app/api/accounts.py:27 |
| DELETE | /accounts/{account_id} | Bearer token | backend/app/api/accounts.py:32 |
| POST | /affordability/check | Bearer token | backend/app/api/affordability.py:12 |
| POST | /auth/register | Public | backend/app/api/auth.py:13 |
| POST | /auth/login | Public | backend/app/api/auth.py:18 |
| GET | /auth/me | Bearer token | backend/app/api/auth.py:23 |
| PATCH | /auth/me | Bearer token | backend/app/api/auth.py:28 |
| PATCH | /auth/me/password | Bearer token | backend/app/api/auth.py:33 |
| DELETE | /auth/me | Bearer token | backend/app/api/auth.py:38 |
| GET | /budgets | Bearer token | backend/app/api/budgets.py:14 |
| POST | /budgets | Bearer token | backend/app/api/budgets.py:19 |
| GET | /budgets/alerts | Bearer token | backend/app/api/budgets.py:24 |
| GET | /budgets/{budget_id} | Bearer token | backend/app/api/budgets.py:29 |
| PATCH | /budgets/{budget_id} | Bearer token | backend/app/api/budgets.py:34 |
| DELETE | /budgets/{budget_id} | Bearer token | backend/app/api/budgets.py:39 |
| GET | /recurring-transactions | Bearer token | backend/app/api/recurring_transactions.py:16 |
| POST | /recurring-transactions | Bearer token | backend/app/api/recurring_transactions.py:21 |
| GET | /recurring-transactions/{recurring_id} | Bearer token | backend/app/api/recurring_transactions.py:26 |
| PATCH | /recurring-transactions/{recurring_id} | Bearer token | backend/app/api/recurring_transactions.py:31 |
| DELETE | /recurring-transactions/{recurring_id} | Bearer token | backend/app/api/recurring_transactions.py:40 |
| GET | /reports/monthly | Bearer token | backend/app/api/reports.py:12 |
| GET | /savings-goals | Bearer token | backend/app/api/savings_goals.py:12 |
| POST | /savings-goals | Bearer token | backend/app/api/savings_goals.py:17 |
| GET | /savings-goals/{goal_id} | Bearer token | backend/app/api/savings_goals.py:22 |
| PATCH | /savings-goals/{goal_id} | Bearer token | backend/app/api/savings_goals.py:27 |
| DELETE | /savings-goals/{goal_id} | Bearer token | backend/app/api/savings_goals.py:32 |
| GET | /split-bills/friends | Bearer token | backend/app/api/split_bills.py:18 |
| POST | /split-bills/friends | Bearer token | backend/app/api/split_bills.py:23 |
| GET | /split-bills | Bearer token | backend/app/api/split_bills.py:38 |
| POST | /split-bills | Bearer token | backend/app/api/split_bills.py:43 |
| PUT | /split-bills/{bill_id} | Bearer token | backend/app/api/split_bills.py:48 |
| POST | /split-bills/{bill_id}/pay | Bearer token | backend/app/api/split_bills.py:53 |
| PUT | /split-bills/{bill_id}/repayments/{person_id} | Bearer token | backend/app/api/split_bills.py:58 |
| GET | /transactions | Bearer token | backend/app/api/transactions.py:12 |
| POST | /transactions | Bearer token | backend/app/api/transactions.py:17 |
| POST | /transactions/bulk | Bearer token | backend/app/api/transactions.py:22 |
| GET | /transactions/{transaction_id} | Bearer token | backend/app/api/transactions.py:27 |
| PATCH | /transactions/{transaction_id} | Bearer token | backend/app/api/transactions.py:32 |
| DELETE | /transactions/{transaction_id} | Bearer token | backend/app/api/transactions.py:37 |
| POST | /transfers | Bearer token | backend/app/api/transfers.py:13 |
| GET | /transfers | Bearer token | backend/app/api/transfers.py:18 |
| GET | / | Public | backend/app/main.py:50 |
| GET | /health | Public | backend/app/main.py:59 |

## Appendix C. Complete ORM field inventory

This is the declared SQLAlchemy model schema, not an inspection of private database contents. Runtime migration history and SQLite enforcement limitations are discussed in Section 6.

### accounts

| Column | SQL type | Declared constraints |
| --- | --- | --- |
| id | INTEGER | required; primary key |
| bank_name | VARCHAR(100) | required |
| name | VARCHAR(100) | required |
| starting_balance | NUMERIC(12, 2) | required |
| account_type | VARCHAR(20) | required |

### budgets

| Column | SQL type | Declared constraints |
| --- | --- | --- |
| id | INTEGER | required; primary key |
| category | VARCHAR(80) | required |
| monthly_limit | NUMERIC(12, 2) | required |
| month | INTEGER | required |
| year | INTEGER | required |

### savings_goals

| Column | SQL type | Declared constraints |
| --- | --- | --- |
| id | INTEGER | required; primary key |
| name | VARCHAR(100) | required |
| target_amount | NUMERIC(12, 2) | required |
| current_amount | NUMERIC(12, 2) | required |
| monthly_income | NUMERIC(12, 2) | required |
| target_date | DATE | nullable |

### users

| Column | SQL type | Declared constraints |
| --- | --- | --- |
| id | INTEGER | required; primary key |
| name | VARCHAR(100) | required |
| email | VARCHAR(255) | required; unique |
| phone_number | VARCHAR(14) | required |
| occupation | VARCHAR(100) | required |
| password_hash | VARCHAR(255) | required |

### friends

| Column | SQL type | Declared constraints |
| --- | --- | --- |
| id | INTEGER | required; primary key |
| user_id | INTEGER | required; references users.id |
| name | VARCHAR(100) | required |

### recurring_transactions

| Column | SQL type | Declared constraints |
| --- | --- | --- |
| id | INTEGER | required; primary key |
| name | VARCHAR(120) | required |
| account_id | INTEGER | required; references accounts.id |
| amount | NUMERIC(12, 2) | required |
| category | VARCHAR(80) | required |
| transaction_type | VARCHAR(20) | required |
| frequency | VARCHAR(20) | required |
| next_due_date | DATE | required |
| note | VARCHAR(255) | nullable |
| auto_pay_status | BOOLEAN | required |
| reminder_settings | JSON | nullable |
| last_paid_date | DATE | nullable |
| last_matched_transaction_id | INTEGER | nullable |

### split_bills

| Column | SQL type | Declared constraints |
| --- | --- | --- |
| id | INTEGER | required; primary key |
| user_id | INTEGER | required; references users.id |
| data | JSON | required |
| payment_transaction_id | INTEGER | nullable |
| repayments | JSON | required |

### transactions

| Column | SQL type | Declared constraints |
| --- | --- | --- |
| id | INTEGER | required; primary key |
| account_id | INTEGER | required; references accounts.id |
| amount | NUMERIC(12, 2) | required |
| category | VARCHAR(80) | required |
| transaction_type | VARCHAR(20) | required |
| transaction_date | DATE | required |
| note | VARCHAR(255) | nullable |
| receipt_items | JSON | nullable |
| receipt_metadata | JSON | nullable |

### transfers

| Column | SQL type | Declared constraints |
| --- | --- | --- |
| id | INTEGER | required; primary key |
| from_account_id | INTEGER | required; references accounts.id |
| to_account_id | INTEGER | required; references accounts.id |
| amount | NUMERIC(12, 2) | required |
| transfer_date | DATE | required |
| note | VARCHAR(255) | nullable |

## Appendix D. Complete repository file inventory

Each captured application, configuration, test, or reference file appears once. Line counts describe text files; binary files have no text line count. SHA-256 hashes and parsed symbols are preserved in evidence/source-inventory.json. Generated documentation is excluded from this application inventory.

### .

| File | Lines | Responsibility |
| --- | --- | --- |
| .gitignore | 15 | Generated files, local databases, environments, and dependencies excluded from Git. |
| README.md | 102 | Project setup and feature documentation; some Split Bill wording predates the simplified UI. |

### backend/app

| File | Lines | Responsibility |
| --- | --- | --- |
| __init__.py | 1 | Python package marker. |
| main.py | 65 | FastAPI application creation, middleware, route registration, and system endpoints. |

### backend/app/api

| File | Lines | Responsibility |
| --- | --- | --- |
| __init__.py | 1 | Python package marker. |
| accounts.py | 35 | HTTP route definitions: accounts. |
| affordability.py | 14 | HTTP route definitions: affordability. |
| auth.py | 40 | HTTP route definitions: auth. |
| budgets.py | 41 | HTTP route definitions: budgets. |
| recurring_transactions.py | 43 | HTTP route definitions: recurring transactions. |
| reports.py | 18 | HTTP route definitions: reports. |
| savings_goals.py | 35 | HTTP route definitions: savings goals. |
| split_bills.py | 59 | HTTP route definitions: split bills. |
| transactions.py | 39 | HTTP route definitions: transactions. |
| transfers.py | 19 | HTTP route definitions: transfers. |

### backend/app/core

| File | Lines | Responsibility |
| --- | --- | --- |
| __init__.py | 1 | Python package marker. |
| config.py | 15 | Local API, SQLite, signing-key, and token-lifetime settings. |
| database.py | 94 | Database engine, sessions, schema creation, and incremental compatibility migrations. |
| security.py | 96 | Password hashing, JWT creation/verification, and current-user dependency. |

### backend/app/domain

| File | Lines | Responsibility |
| --- | --- | --- |
| __init__.py | 1 | Python package marker. |
| account.py | 26 | Business value objects, calculation rules, or supporting enumerations: account. |
| affordability.py | 46 | Business value objects, calculation rules, or supporting enumerations: affordability. |
| budget.py | 40 | Business value objects, calculation rules, or supporting enumerations: budget. |
| financial_report.py | 41 | Business value objects, calculation rules, or supporting enumerations: financial report. |
| money.py | 17 | Decimal cent rounding and nonnegative monetary validation. |
| notification.py | 16 | Business value objects, calculation rules, or supporting enumerations: notification. |
| recurring_transaction.py | 29 | Business value objects, calculation rules, or supporting enumerations: recurring transaction. |
| savings_goal.py | 31 | Business value objects, calculation rules, or supporting enumerations: savings goal. |
| split_bill.py | 38 | Business value objects, calculation rules, or supporting enumerations: split bill. |
| transaction.py | 27 | Business value objects, calculation rules, or supporting enumerations: transaction. |
| user.py | 9 | Business value objects, calculation rules, or supporting enumerations: user. |

### backend/app/repositories

| File | Lines | Responsibility |
| --- | --- | --- |
| __init__.py | 1 | Python package marker. |
| account_repository.py | 7 | Persistence access for account repository. |
| base.py | 38 | Generic repository CRUD implementation. |
| budget_repository.py | 14 | Persistence access for budget repository. |
| models.py | 117 | SQLAlchemy persistence models for all nine database tables. |
| recurring_transaction_repository.py | 19 | Persistence access for recurring transaction repository. |
| savings_goal_repository.py | 7 | Persistence access for savings goal repository. |
| transaction_repository.py | 17 | Persistence access for transaction repository. |
| user_repository.py | 9 | Persistence access for user repository. |

### backend/app/schemas

| File | Lines | Responsibility |
| --- | --- | --- |
| __init__.py | 1 | Python package marker. |
| account_schema.py | 25 | Pydantic input/output validation contracts: account schema. |
| affordability_schema.py | 17 | Pydantic input/output validation contracts: affordability schema. |
| auth_schema.py | 42 | Pydantic input/output validation contracts: auth schema. |
| budget_schema.py | 26 | Pydantic input/output validation contracts: budget schema. |
| common.py | 11 | Pydantic input/output validation contracts: common. |
| notification_schema.py | 9 | Pydantic input/output validation contracts: notification schema. |
| recurring_transaction_schema.py | 40 | Pydantic input/output validation contracts: recurring transaction schema. |
| report_schema.py | 15 | Pydantic input/output validation contracts: report schema. |
| savings_goal_schema.py | 28 | Pydantic input/output validation contracts: savings goal schema. |
| split_bill_schema.py | 61 | Pydantic input/output validation contracts: split bill schema. |
| transaction_schema.py | 37 | Pydantic input/output validation contracts: transaction schema. |
| transfer_schema.py | 20 | Pydantic input/output validation contracts: transfer schema. |

### backend/app/services

| File | Lines | Responsibility |
| --- | --- | --- |
| __init__.py | 1 | Python package marker. |
| account_service.py | 68 | Application workflow and validation orchestration: account service. |
| affordability_service.py | 36 | Application workflow and validation orchestration: affordability service. |
| alert_service.py | 27 | Application workflow and validation orchestration: alert service. |
| auth_service.py | 62 | Application workflow and validation orchestration: auth service. |
| budget_service.py | 58 | Application workflow and validation orchestration: budget service. |
| converters.py | 14 | Application workflow and validation orchestration: converters. |
| recurring_transaction_service.py | 59 | Application workflow and validation orchestration: recurring transaction service. |
| report_service.py | 17 | Application workflow and validation orchestration: report service. |
| savings_goal_service.py | 50 | Application workflow and validation orchestration: savings goal service. |
| split_bill_service.py | 130 | Application workflow and validation orchestration: split bill service. |
| transaction_service.py | 121 | Application workflow and validation orchestration: transaction service. |
| transfer_service.py | 39 | Application workflow and validation orchestration: transfer service. |

### backend

| File | Lines | Responsibility |
| --- | --- | --- |
| pyproject.toml | 21 | Backend package metadata, Python dependencies, and pytest configuration. |

### backend/tests

| File | Lines | Responsibility |
| --- | --- | --- |
| test_affordability.py | 28 | Automated verification: test affordability. |
| test_budget.py | 29 | Automated verification: test budget. |
| test_recurring_payment_matching.py | 80 | Automated verification: test recurring payment matching. |
| test_registration_profile.py | 83 | Automated verification: test registration profile. |
| test_reports.py | 26 | Automated verification: test reports. |
| test_savings_goal.py | 26 | Automated verification: test savings goal. |
| test_split_bills.py | 213 | Automated verification: test split bills. |
| test_transfers.py | 139 | Automated verification: test transfers. |

### documents

| File | Lines | Responsibility |
| --- | --- | --- |
| Inception.pdf | binary | Committed project inception artifact. |

### frontend

| File | Lines | Responsibility |
| --- | --- | --- |
| COMPONENTS.md | 9 | Shared dropdown/date-picker conventions. |
| index.html | 25 | Browser entry document and initial theme selection. |
| package-lock.json | 1895 | Resolved frontend dependency versions and integrity hashes. |
| package.json | 25 | Frontend dependencies and npm scripts. |
| tsconfig.json | 22 | TypeScript compiler options. |
| vite.config.ts | 10 | Vite development/build configuration. |

### frontend/src

| File | Lines | Responsibility |
| --- | --- | --- |
| App.tsx | 176 | Session restoration and page selection; connects page callbacks and the application shell. |
| main.tsx | 14 | React root mounting and shared stylesheet imports. |

### frontend/src/api

| File | Lines | Responsibility |
| --- | --- | --- |
| accounts.ts | 25 | Typed API calls and, where implemented, refresh events: accounts. |
| affordability.ts | 18 | Typed API calls and, where implemented, refresh events: affordability. |
| auth.ts | 39 | Typed API calls and, where implemented, refresh events: auth. |
| budgets.ts | 35 | Typed API calls and, where implemented, refresh events: budgets. |
| client.ts | 88 | Shared HTTP transport, bearer authorization, cached-session validation, and 401 handling. |
| recurringTransactions.ts | 56 | Typed API calls and, where implemented, refresh events: recurring Transactions. |
| reports.ts | 15 | Typed API calls and, where implemented, refresh events: reports. |
| savingsGoals.ts | 46 | Typed API calls and, where implemented, refresh events: savings Goals. |
| splitBills.ts | 16 | Typed API calls and, where implemented, refresh events: split Bills. |
| transactions.ts | 46 | Typed API calls and, where implemented, refresh events: transactions. |
| transfers.ts | 23 | Typed API calls and, where implemented, refresh events: transfers. |
| types.ts | 49 | Shared TypeScript finance data contracts. |

### frontend/src/components

| File | Lines | Responsibility |
| --- | --- | --- |
| AppChromeContext.tsx | 16 | Reusable presentation component: App Chrome Context. |
| AppShell.tsx | 146 | Reusable presentation component: App Shell. |
| BankSelector.tsx | 42 | Reusable presentation component: Bank Selector. |
| BottomNav.tsx | 45 | Reusable presentation component: Bottom Nav. |
| IncomeExpenseDonut.tsx | 160 | Reusable presentation component: Income Expense Donut. |
| MoneyCard.tsx | 16 | Reusable presentation component: Money Card. |
| MoveFunds.tsx | 84 | Reusable presentation component: Move Funds. |
| NavigationDrawer.tsx | 100 | Reusable presentation component: Navigation Drawer. |
| NotificationsPanel.tsx | 136 | Reusable presentation component: Notifications Panel. |
| PhoneNumberField.tsx | 36 | Reusable presentation component: Phone Number Field. |
| ProgressBar.tsx | 22 | Reusable presentation component: Progress Bar. |
| TopBar.tsx | 33 | Reusable presentation component: Top Bar. |
| TransactionImportPanel.tsx | 456 | Reusable presentation component: Transaction Import Panel. |
| TransactionItem.tsx | 28 | Reusable presentation component: Transaction Item. |

### frontend/src/components/auth

| File | Lines | Responsibility |
| --- | --- | --- |
| AuthHeader.tsx | 22 | Reusable presentation component: Auth Header. |
| AuthLayout.tsx | 16 | Reusable presentation component: Auth Layout. |
| PasswordInput.tsx | 38 | Reusable presentation component: Password Input. |

### frontend/src/components/ui

| File | Lines | Responsibility |
| --- | --- | --- |
| Button.tsx | 15 | Reusable presentation component: Button. |
| CategorySelect.tsx | 25 | Reusable presentation component: Category Select. |
| DatePicker.tsx | 226 | Reusable presentation component: Date Picker. |
| GlassCard.tsx | 16 | Reusable presentation component: Glass Card. |
| GlassSelect.tsx | 252 | Reusable presentation component: Glass Select. |
| IconButton.tsx | 14 | Reusable presentation component: Icon Button. |
| Modal.tsx | 75 | Reusable presentation component: Modal. |
| TextField.tsx | 21 | Reusable presentation component: Text Field. |
| index.ts | 9 | Reusable presentation component: index. |

### frontend/src/domain

| File | Lines | Responsibility |
| --- | --- | --- |
| banks.ts | 16 | Supported bank-name options for user-entered accounts; no bank integration. |
| budgeting.ts | 284 | Monthly budget aggregation, classification, preferences, and spending projection. |
| merchantIntelligence.ts | 143 | Merchant/category and subscription suggestions using local rules. |
| purchaseAnalysis.ts | 205 | Cash, loan, and lease decision-support calculations and financial snapshots. |
| recurringBills.ts | 61 | Due-date status, upcoming bills, and reminder notification construction. |
| splitBill.ts | 47 | Client item allocation and proportional tax/tip calculation using integer cents. |
| transactionCategories.ts | 47 | Fixed income and expense category option catalogs. |

### frontend/src/pages

| File | Lines | Responsibility |
| --- | --- | --- |
| AccountSettingsPage.tsx | 399 | Screen implementation: Account Settings Page. |
| AccountsPage.tsx | 157 | Screen implementation: Accounts Page. |
| AddTransactionPage.tsx | 99 | Screen implementation: Add Transaction Page. |
| AffordabilityPage.tsx | 402 | Screen implementation: Affordability Page. |
| BudgetsPage.tsx | 436 | Screen implementation: Budgets Page. |
| DashboardPage.tsx | 166 | Screen implementation: Dashboard Page. |
| HelpPage.tsx | 315 | Screen implementation: Help Page. |
| LoginPage.tsx | 78 | Screen implementation: Login Page. |
| OnboardingPage.tsx | 458 | Screen implementation: Onboarding Page. |
| PlaceholderPage.tsx | 24 | Placeholder presentation component; not selected by current App navigation. |
| RecurringTransactionsPage.tsx | 207 | Screen implementation: Recurring Transactions Page. |
| RegisterPage.tsx | 115 | Screen implementation: Register Page. |
| ReportsPage.tsx | 82 | Screen implementation: Reports Page. |
| SavingsGoalsPage.tsx | 360 | Screen implementation: Savings Goals Page. |
| SplitBillPage.css | 100 | Styling: SplitBillPage; theme/layout/presentation rules, not business logic. |
| SplitBillPage.tsx | 243 | Screen implementation: Split Bill Page. |
| TransactionsPage.tsx | 271 | Screen implementation: Transactions Page. |

### frontend/src/services

| File | Lines | Responsibility |
| --- | --- | --- |
| receiptExtraction.ts | 38 | Unconfigured extraction interfaces for general receipt and PDF imports. |
| splitReceipt.ts | 46 | Split Bill image OCR, timeout/error handling, and receipt-text parsing. |

### frontend/src/styles

| File | Lines | Responsibility |
| --- | --- | --- |
| base.css | 41 | Styling: base; theme/layout/presentation rules, not business logic. |
| components.css | 4113 | Styling: components; theme/layout/presentation rules, not business logic. |
| layout.css | 117 | Styling: layout; theme/layout/presentation rules, not business logic. |
| ui.css | 601 | Styling: ui; theme/layout/presentation rules, not business logic. |

### frontend/src/theme

| File | Lines | Responsibility |
| --- | --- | --- |
| theme.ts | 3 | Theme constants and types. |
| tokens.css | 143 | Styling: tokens; theme/layout/presentation rules, not business logic. |

### frontend/src/utils

| File | Lines | Responsibility |
| --- | --- | --- |
| format.ts | 16 | Formatting/input helper: format. |
| phoneNumber.ts | 12 | Formatting/input helper: phone Number. |

### frontend/tests

| File | Lines | Responsibility |
| --- | --- | --- |
| authSession.test.mjs | 92 | Automated verification: auth Session.test. |
| splitBill.test.mjs | 49 | Automated verification: split Bill.test. |

## Appendix E. Test definitions

Backend function definitions are listed below; parametrized functions can produce multiple executed cases. The authoritative executed count is 45 in backend-tests.txt. Frontend cases are listed separately from their actual test runner output (13 executed cases).

### backend/tests/test_affordability.py

- test_affordability_allows_purchase_when_projection_is_non_negative
- test_affordability_warns_when_purchase_interferes_with_plan

### backend/tests/test_budget.py

- test_budget_calculates_used_remaining_and_percent
- test_budget_rejects_invalid_month

### backend/tests/test_recurring_payment_matching.py

- test_matching_transaction_marks_recurring_bill_paid_and_advances_due_date
- test_due_date_alone_does_not_mark_recurring_bill_paid

### backend/tests/test_registration_profile.py

- test_registration_persists_phone_number_on_user_profile
- test_registration_rejects_malformed_phone_number
- test_financial_account_creation_needs_no_phone_number
- test_migration_adds_user_phone_column_and_drops_account_phone_column

### backend/tests/test_reports.py

- test_monthly_report_totals_income_expenses_and_categories

### backend/tests/test_savings_goal.py

- test_savings_goal_progress_and_remaining_amount
- test_savings_goal_progress_is_capped_at_one_hundred_percent

### backend/tests/test_split_bills.py

- test_example_fair_tax_tip_and_shared_items
- test_pennies_and_quantities_always_reconcile
- test_payment_debits_bank_once_and_cash_tip_is_excluded
- test_repayments_override_partial_overpayment_and_undo_are_idempotent
- test_editing_paid_bill_adjusts_charge_and_preserves_actual_repayment
- test_invalid_payment_cannot_change_balance
- test_ownership_and_linked_transaction_guards
- test_parallel_payment_requests_only_charge_once
- test_paid_bill_cannot_drop_repaid_person_or_overdraw_with_edits
- test_api_persists_friends_and_split_bill_and_requires_login

### backend/tests/test_transfers.py

- test_transfer_moves_only_selected_balances_and_preserves_reports_and_budgets
- test_invalid_amounts_are_rejected
- test_invalid_transfers_leave_no_partial_changes
- test_transfer_account_rename_preserves_type_and_delete_preserves_ledger
- test_migration_classifies_existing_accounts_and_is_repeatable
- test_competing_transfers_cannot_overdraw_savings

### Frontend executed cases

- restore requires both a valid cached profile and an unexpired token
- missing token and corrupt storage return Login without crashing
- expired sessions stop all protected request methods before fetching
- backend 401 clears an apparently current session once
- failed login is reported without expiring a session
- an old in-flight 401 cannot log out a newly signed-in user
- network errors and forbidden requests preserve a valid session
- successful requests retain the existing JSON and DELETE behavior
- example assigns shared pizza and proportional tax and tip
- odd cents and large allocations reconcile exactly
- unassigned items and receipt mismatch prevent reconciliation
- receipt parsing separates items, tax and totals without counting tender twice
- receipt quantity text preserves the printed line total for review
