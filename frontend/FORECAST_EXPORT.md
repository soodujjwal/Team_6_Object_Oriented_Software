# Cash-flow forecast and transaction export

Hardik's `hardik/cash-flow-forecast` and `hardik/transaction-export` branches are integrated with the existing authenticated account, transaction, and recurring-activity APIs. Neither feature creates transactions or changes account balances.

## Cash-Flow Outlook

Open **Dashboard**. The card projects the estimated balance using saved weekly and monthly income and bills for 30 calendar days, including today. It shows scheduled income, bills, projected balance, and shortfall risk. Unscheduled spending is excluded. On the same day, expenses are considered before income because payment times are unknown.

The forecast waits for both accounts and schedules, reports failed reads as unavailable, and refreshes when recurring activity or transactions change. Already-paid occurrences are skipped. An empty schedule links to **Recurring Transactions**.

## Export visible transactions

Open **Transactions**, set search/type/source/month filters, then select **Export visible transactions**. The CSV contains exactly the visible records in their displayed order, with account/bank information and personal/reporting amounts. Quotes and newlines are escaped, formula-like text is neutralized, and UTF-8 with a BOM preserves names in spreadsheet applications. No matches disables export.

Browsers start a `.csv` download. Newly built Android apps use the system **Save as** picker without requesting broad storage access. Cancellation and write failures do not report a successful export. Older installed APKs need an updated build to gain native export; pushing this source does not update an installed APK or replace the published release.

## Verification

- `npm test` covers the new calculations, CSV formatting, filter interactions, refresh/loading/failure states, and native bridge results alongside the existing frontend suite.
- `npm run build` verifies the production website.
- `./build-android.ps1 -Mode VerifyUnsigned` verifies mobile assets and Android compilation. Its APK is for verification only and must not be published as an official release.
- Run `python -m pytest -q` from `backend` for the existing backend regression suite. Optional live database tests remain opt-in.

Native picker behavior is covered through mocked bridge outcomes and Android compilation; an on-device save/cancel test is still required before publishing a new APK.
