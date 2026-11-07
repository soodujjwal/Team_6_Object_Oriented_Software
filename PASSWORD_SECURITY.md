# Password security

Email ownership verification and email password reset are deferred at the owner's request until a sending domain and provider exist. Registration still activates an account immediately; this release must not be described as verified email authentication.

## Policy and interface

New registrations and password changes require 15–128 Unicode code points, a local zxcvbn score of 3 or 4, and a successful uncompromised-password check. Spaces and Unicode are accepted exactly as entered, without normalization or truncation. Existing passwords remain usable at login; no periodic changes are imposed. Confirmation is validated when supplied and required by the new website/Android form; the API field stays optional for compatibility with the previous APK.

The browser uses `@zxcvbn-ts/core`, common dictionaries, and English dictionaries, with names/email/phone as personal inputs. The debounced strength meter labels scores 0–4 and supports password-manager autocomplete, paste, and show/hide. Dictionaries are confined to the lazy registration/settings chunk. The Python backend independently uses `zxcvbn`, including personal inputs. Its extended 128-character limit is protected by endpoint throttling, a two-slot nonblocking expensive-work limit, and serialization of the Python library's mutable personal dictionary; the dictionary is removed after each estimate.

The backend queries HIBP Pwned Passwords only after local validation, using a five-hex-character SHA-1 prefix and `Add-Padding: true`. SHA-1 is a lookup fingerprint, never the password storage format. Neither plaintext, the full hash, nor the hash suffix leaves the backend. Zero-count padding is ignored. Timeout, redirects, invalid/empty/oversized responses, and provider errors fail closed with HTTP 503 and a retry message; they never create an unchecked account. This service needs no API key. Existing-account login does not depend on HIBP availability.

## Storage and sessions

New hashes use Argon2id with random salts, 19,456 KiB memory, two iterations, one lane, a 32-byte hash, and a 16-byte salt. At most two expensive password operations run concurrently per backend process. Historical 120,000-round PBKDF2-SHA256 hashes are verified and upgraded on successful login without changing their passwords or financial records. Hash upgrades and password changes use the existing database write-conflict protection.

A nullable `users.session_version` field treats absent historical values as zero. JWTs carry `sv`; historical tokens without it remain version zero. Password changes atomically replace the hash and increment this version, revoking existing sessions across devices. The changing client clears its secure/browser session and returns to login. The existing JWT expiration remains 24 hours. No financial records or ownership IDs are migrated. The SQL test adapter adds an integer field with default zero; Mongo needs no bulk backfill. Historical Mongo documents without revision metadata receive an atomic first revision on update.

`auth_rate_limits` is a new, separate collection with an `expires_at` TTL index. Atomic Mongo counters persist independently of failed authentication transactions and across workers. Keys are purpose-separated HMACs; raw addresses and emails are not stored. Fixed-window limits: registration 20/IP/hour and 5/account/hour; login 120/IP/minute and 30/account/15 minutes; password changes 30/IP/15 minutes and 10/user/15 minutes. Login failures add progressive delays after three failures, up to 60 seconds. Unknown and known accounts share generic login failures. Security logs contain event names only. Authentication validation responses remove rejected input values, preventing FastAPI from echoing passwords.

## Render configuration

Keep the existing `MONGODB_URI`, `MONGODB_DATABASE`, HTTPS API URL, and CORS/native origins. Set a private `JWT_SECRET_KEY` of at least 32 UTF-8 bytes in Render; the insecure development fallback was removed. Reuse the existing valid production secret for this rollout. **Do not casually rotate it:** existing Plaid credential encryption also depends on it and needs a planned re-encryption migration. No new Vercel variables or email provider credentials are required. Never copy backend secrets into the APK.

IP throttling uses ASGI `request.client.host`, not arbitrary forwarded headers read by application code. Keep Uvicorn/Render's trusted-proxy configuration restricted to the actual proxy hop. A misconfigured proxy can aggregate users under one IP; per-account limits still apply. No rate-limit in-memory fallback is used in production.

## Validation

Backend: 145 passed, 39 skipped in the existing full suite, including weak/common passwords, strong/Unicode passphrases, private validation errors, confirmation, duplicates, prefix privacy, compromised-password rejection, fail-closed provider errors, legacy hash migration, session revocation, concurrent rate limits, and generic login throttling. All records are disposable local test data; external I/O is mocked in the regression suite. Frontend form tests check estimator behavior, mismatch rejection, visibility, autocomplete, meter labels, and duplicate-submit prevention.

Email delivery, OTPs, reset emails, physical-device installation, and a fresh full Android navigation/Plaid matrix are not tested or claimed by this password release. See `frontend/ANDROID_PUBLISHED_RELEASE.md` for exact APK and publication evidence.

References: [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [zxcvbn-ts](https://github.com/zxcvbn-ts/zxcvbn), [zxcvbn Python](https://github.com/dwolfhub/zxcvbn-python), [HIBP Pwned Passwords](https://haveibeenpwned.com/API/v3#PwnedPasswords).
