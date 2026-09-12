# Focused pre-release checks

Checked locally on Windows x64 on September 12, 2026. This is a focused engineering check, not a penetration test or a guarantee that no vulnerabilities exist.

| Check | Result |
| --- | --- |
| npm audit, production and development dependencies | No known vulnerabilities reported for the committed lockfile at review time |
| Source export | Explicit file allowlist; no accounts, browser profile, runtime tokens, downloads or VM modules copied |
| Tracked source scan | No matches for personal development paths, known real account identifiers, private key headers or common GitHub token formats |
| Broker access | Both engines reject missing/wrong authentication, browser Origin headers and mismatched Host headers |
| Untrusted pages | Test pages cannot access Node.js, the UI bridge or readable broker responses |
| Navigation | Both engines reject file:, javascript:, custom OS protocols and URLs with embedded credentials |
| Credentials | Encrypted file does not contain the synthetic password; normal UI state does not contain it; another tab owner and a paused agent cannot retrieve it |
| Signup capture | Failed/incomplete attempts, mismatched identities and unrelated confirmation tabs are rejected by regression tests |
| Packaging | Browser-only tool list; required host and connector bundled; no profile, tests or host debug symbols in packaged app |
| Clean checkout | npm ci, WebView2 build, 44 unit tests and the complete browser/account/security integration suite pass without the original application directory |
| Packaged execution | External Node MCP process launches the packaged app and controls its bundled WebView2 host using a temporary test profile |

The meaningful remaining boundaries are documented in SECURITY.md: trusted local agents can retrieve saved passwords; tabs share website sessions; same-user malware is outside this isolation boundary; account capture is heuristic; this app does not restrict Codex's other host tools. The initial installer is unsigned. No automatic site-protection bypass is provided or claimed.

The missing-prerequisite installer path uses Windows Package Manager and can require Windows approval. It has not been validated on a newly provisioned Windows machine; the existing-prerequisite path and clean source checkout were checked locally.
