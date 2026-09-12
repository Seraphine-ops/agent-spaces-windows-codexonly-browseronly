# Security boundaries

This is an early, unaudited beta. Report security issues privately to the repository owner; do not post passwords, tokens, full auth URLs, runtime files, or browser profiles in public issues.

## Trusted parties

The app and its MCP connector run as the current Windows user. The broker binds only to 127.0.0.1, uses a random bearer token stored in the user's data directory, rejects requests with an Origin header, validates its Host header and strictly validates operations. Browser pages have Node integration disabled, context isolation enabled and Chromium sandboxing enabled. Browser permission requests are denied by default.

Processes with access to the same Windows user's files can access the local runtime token. This is not protection against malware running as that user. The connector is intended for trusted local agents. Do not expose the broker over the network or copy runtime.json into a repository.

Accounts use Electron safeStorage and Windows-backed encryption. Storage fails closed if encryption is unavailable. This does not isolate credentials from the running application or an authorized agent: retrieving a saved account explicitly returns its password to that agent. Page content is untrusted; agent hosts must handle prompt injection and approval requirements.

Tab ownership is an input coordination boundary, not an account isolation boundary. All tabs in one engine share website cookies and local storage. An agent can use an already-authenticated website without retrieving a saved password. Use accounts intended for agents.

Automatic capture requires observed success, but is heuristic. A malicious website can lie about its own login state. Agents must only record accounts after verified successful creation. Unknown manual accounts require local save consent; agent-created accounts save after success. Never use account capture as proof of a site's authenticity.

## Codex setup

Enabling the browser preference installs/updates the `agent-browser` MCP entry and a marked section in the current Codex user's AGENTS.md (or existing AGENTS.override.md). Other instructions are preserved and modified files backed up. This may replace an existing connector with that name. Disabling the preference removes the marked instruction block but leaves the connector installed. To remove it: `codex mcp remove agent-browser`.

AS's browser preference does not remove Codex's filesystem, terminal or other tool access. This browser-only release has no VM or OS isolation layer.

## Release hygiene

Do not distribute state/, encrypted vaults, runtime metadata, downloaded files, browser profiles, local setup scripts, .env files or private signing credentials. Publish source from the tracked-file allowlist and package only declared application assets. Keep Electron, WebView2 and MCP dependencies updated. Release binaries should eventually be signed; initial beta builds are not signed.
