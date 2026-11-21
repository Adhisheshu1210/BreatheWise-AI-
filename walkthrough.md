# Security Summary

**Reviewed Files**: 26 (`server.ts`, `server/airQualityProvider.ts`, `server/geminiService.ts`, `src/services/apiClient.ts`, `src/utils/*`, `src/components/*`, `src/features/*`, `package.json`, `.env.example`, `index.html`)  
**Issues Resolved**: 3

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Unbounded API Endpoints | `server.ts` | 43–184 | `/api/ai/*`, `/api/location/search`, and `/api/air-quality*` lacked per-IP request throttling, allowing rapid bursts to exhaust Gemini API quotas or upstream rate limits. | Medium | Fixed | Added sliding-window per-IP rate limiters (30 req/min on `/api/ai/*`, 90 req/min on data endpoints) returning structured `429 RATE_LIMITED` JSON with `Retry-After`. |
| Unhandled Malformed Request Errors | `server.ts` | 177–197 | Malformed JSON bodies and unexpected API errors could fall through to Express's default HTML error handler instead of clean JSON responses. | Low | Fixed | Added structured Express error middleware returning `400 BAD_REQUEST` / `413 PAYLOAD_TOO_LARGE` / `500 INTERNAL_ERROR` JSON without stack traces, plus array-object guards (`isPlainObject`) and control-character stripping on query inputs. |
| Missing `Permissions-Policy` Header | `server.ts` | 64–69 | Express set `X-Content-Type-Options` and `Referrer-Policy` without explicitly restricting browser camera/microphone capabilities. | Low | Fixed | Added `Permissions-Policy: camera=(), microphone=(), geolocation=(self)` across responses while keeping iframe preview compatibility intact. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| API Keys & Secrets | `server/geminiService.ts`, `server.ts` | `GEMINI_API_KEY` is read strictly from server `process.env`, never prefixed with `VITE_`, and never exposed to client bundles or HTTP responses. |
| Outbound Request Targets | `server/airQualityProvider.ts` | Server requests connect only to hardcoded HTTPS Open-Meteo hosts (`geocoding-api.open-meteo.com`, `air-quality-api.open-meteo.com`, `api.open-meteo.com`) with encoded query parameters and 7–8s `AbortController` timeouts. |
| XSS & Unsafe Rendering | `src/features/AssistantView.tsx`, `src/` | Zero instances of `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `new Function`; AI responses are rendered exclusively through React text nodes and structured schema parsing. |
| Client & AI Schema Validation | `server/geminiService.ts`, `src/utils/validation.ts` | Input payloads are depth-limited, length-bounded, and control-char sanitized; Gemini structured JSON responses pass post-normalization field and enum validation before returning to the UI. |
| Dependency Audit | `package.json`, `bun.lock` | `bun audit` checked 312 resolved packages and reported 0 vulnerabilities. |

---

## PoC Verification

### Unhandled Malformed JSON & Array Payload Bypass on AI Endpoints

#### Summary
| Field | Value |
|---|---|
| Issue Type | Request Validation & Error Handling Hardening |
| Impact | Medium |
| Affected File | `server.ts:134-197` |
| Test Scenario | `POST /api/ai/chat` with malformed JSON `"{broken"`, and `POST /api/ai/recommend` with array-typed `context: []` and burst traffic exceeding 30 req/min |

#### How It Was Fixed
Added `isPlainObject` checks rejecting non-plain-object JSON values (such as arrays), sliding-window per-IP rate limiting middleware returning HTTP `429` with `Retry-After`, and Express 4-argument JSON error middleware intercepting `entity.parse.failed` before Express's default HTML error handler runs.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Malformed JSON body arrives at `express.json({ limit: '100kb' })` (`server.ts:62`) | Body parser emits `entity.parse.failed` error |
| 2 | Error middleware (`server.ts:177-182`) catches `entity.parse.failed` | Returns HTTP `400` `{ error: 'BAD_REQUEST', message: 'Invalid JSON request payload.' }` |
| 3 | Rapid burst (>30 req/min) to `/api/ai/chat` or `/api/ai/recommend` enters `aiRateLimiter` (`server.ts:29-56`) | Returns HTTP `429 RATE_LIMITED` with `Retry-After` before `generateChatResponse` or Gemini SDK is invoked |

#### Conclusion
**Fix Verified** — Malformed JSON bodies, array-typed context payloads, and burst AI endpoint traffic are cleanly rejected at the Express middleware boundary without leaking stack traces or invoking the Gemini SDK unnecessarily.
