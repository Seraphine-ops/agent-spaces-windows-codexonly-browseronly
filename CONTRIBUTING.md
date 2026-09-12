# Contributing

Use Windows x64, Node.js 22+ and .NET 8 SDK. Run `npm ci` and `npm run build:webview2` before integration tests. Run `npm test` for pure unit checks, `npm run test:all` for both browser engines, and `npm run dist` for a Windows installer.

Tests must set AGENT_SPACES_TEST=1 and a unique AGENT_SPACES_DATA temporary directory. That disables Codex registration and keeps real accounts and sessions out of fixtures. Do not run tests against an existing user's data directory. Use synthetic credentials and local fixture sites, never real login flows.

Keep ownership and human-control checks in the shared workspace. Do not add a personal-browser or host mouse fallback. Preserve default account semantics, popup linkage, encrypted storage and manual save consent. Browser-only changes should not add VM dependencies.

Include the concrete before/after behavior and relevant test results in pull requests. Do not include runtime files, local paths, real user identifiers or private screenshots. Current automated tests supplement, rather than replace, a manual review of keyboard access, notifications and both browser engines.
