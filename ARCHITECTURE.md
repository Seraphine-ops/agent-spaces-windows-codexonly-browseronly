# Browser architecture

```text
Codex (agent)
  -> stdio MCP: browser-mcp.mjs
  -> authenticated loopback broker: app/main.cjs
  -> Workspace ownership / pause checks
  -> Electron BrowserAdapter OR WebView2Adapter
  -> browser tab

Human -> isolated app UI -> trusted IPC -> same workspace
```

`app/main.cjs` owns the window, tray, settings, broker and trusted UI routes. `app/workspace.cjs` owns tab/session lifecycle and gates agent actions. `app/browser-adapter.cjs` operates embedded Chromium WebContentsViews. `app/webview2-adapter.cjs` speaks newline-delimited JSON over private process pipes to the C# host in `app/webview2-host/Program.cs`, which embeds Edge WebView2. Neither backend drives the host mouse to perform agent clicks.

`browser-mcp.mjs` exposes browser-only MCP tools; it never exposes arbitrary shell execution or desktop input. `runtime-start.mjs` starts the local app on demand. Source launches locate Electron; installed launches use metadata written by the app's first run. `runtime-path.cjs` gives app and connector the same data location.

Popup events retain the initiating task, parent tab and input ownership. Agents receive child tab IDs plus a sequence cursor; delayed popups can be awaited without repeating a verification link. Human-created popups inherit a pause and can be shown; agent popups do not steal the visible tab.

`credential-observer.cjs` recognizes supported forms and success signals. `credential-capture.cjs` rejects mismatched, failed and incomplete attempts, including linked verification flows. `account-consent.cjs` requests consent for unfamiliar manually entered logins; `accounts.cjs` encrypts persistence. `account-selection.cjs` resolves explicit identities/defaults; `site-identity.cjs` handles platform/domain matching. This is not an independent verification service.

`browser-history.cjs` records redacted action metadata. `help-alerts.cjs` displays branded, non-activating assistance windows. The UI is local HTML/CSS/JavaScript with a restricted preload and no remote scripts.

Windows-only packaging is deliberate. The desktop/VM modules and their tools were excluded from this repository. Future desktop support should be a separate capability boundary rather than reintroducing host-specific project paths into the browser core.
