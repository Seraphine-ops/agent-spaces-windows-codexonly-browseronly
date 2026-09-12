<img src="app/ui/logo.svg" width="84" alt="Agent Spaces logo">

# Agent Spaces Browser

A home for agents on your computer. Codex works in its own persistent browser tabs while you keep using your personal browser.

This is the **Windows x64 browser-only beta**. It includes no VM, desktop automation, game code, personal accounts, or browser profile. MIT licensed.

## What it does

- Runs multiple agents in separate owned tabs, with persistent cookies and website sessions.
- Lets you watch, take control, complete a CAPTCHA or login, and return control to a waiting agent.
- Gives agents snapshots, screenshots, navigation, clicks, typing, scrolling and popup discovery through MCP.
- Tracks child tabs opened by verification links so agents can continue in the right tab.
- Stores confirmed account credentials locally with Windows-backed encryption; includes named account selection, one default per platform, manual entry, autofill, copy and deletion.
- Captures supported successful account creation automatically. Unfamiliar manual logins/signups offer a local Save login choice. Rejected or incomplete attempts are not automatically saved.
- Keeps searchable activity history by tab, with rename, delete, and delete-with-history controls.
- Shows branded help alerts that open the relevant tab or account choice.
- Registers its MCP connector and browser preference in Codex automatically on first launch. Settings lets you turn the preference off.

## Install from source

Requirements: Windows 10/11 x64, [Node.js 22 or newer](https://nodejs.org/), [Codex CLI](https://developers.openai.com/codex/cli/) on PATH, and Codex desktop or CLI. To build WebView2, install the [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0). Its browser runtime is [Microsoft Edge WebView2 Evergreen](https://developer.microsoft.com/microsoft-edge/webview2/).

```powershell
git clone https://github.com/Seraphine-ops/agent-spaces.git
cd agent-spaces
& '.\setup.ps1'
```

Or download the source ZIP, extract it, and double-click **Setup Agent Spaces.cmd**. Setup installs missing prerequisites through Windows Package Manager, installs the locked npm dependencies, builds the browser host, registers Codex on launch, and opens AS. Windows may ask for installation permission. It does not install a VM. Already have the prerequisites and prefer manual setup?

```powershell
npm ci
npm run build:webview2
npm start
```

Without the WebView2 build, `npm start` uses bundled Electron. With it built, a fresh installation defaults to WebView2. Existing settings take precedence. Both engines keep separate cookies and site storage; Accounts is shared between them.

If the CLI is missing, install it with `npm install -g @openai/codex`, then reopen AS. First launch registers `agent-browser` with `codex mcp add` and adds a marked browser preference to your Codex instructions, preserving unrelated text and backing up changed instruction files. Restart Codex once so it loads the new tools. See [Codex MCP documentation](https://developers.openai.com/codex/mcp).

Ask Codex: **“Use Agent Spaces to open example.com in a new task tab and tell me its heading.”** AS should open automatically when a browser tool is called. The app contains no model/API key: Codex runs the agent using your own Codex access.

## Windows installer

Build it locally with `npm run dist` after the WebView2 build. The installer appears in `dist/`. GitHub Actions also builds an installer artifact after its Windows checks pass. Beta builds are unsigned, so Windows may display an unknown-publisher warning; only install a build whose source and origin you trust.

The installer bundles Electron and the self-contained .NET WebView2 host. **Node.js and Codex CLI are still prerequisites** for the MCP connector; the Edge WebView2 runtime must be installed to use that engine. This beta does not silently install system dependencies.

## Everyday use

- **Take control** pauses that tab's agent input. Finish your step and choose **Return to agent**. A Codex task must still be running and waiting to continue automatically.
- **Pause browser agents** pauses the whole workspace, including new agent tasks. It persists across restarts; click **Resume browser agents** to clear it. Manual browsing remains available.
- **Accounts** lets you add a login without putting it in chat. A named account overrides the default for that request only. Multiple matching accounts without a default require your choice.
- **Saved logins** fills a matching login form during manual control; it does not submit. Cross-origin embedded forms may need manual typing.
- **Close window** keeps the runtime in the system tray. **Quit runtime** stops browser tasks.
- **Settings** contains the Codex preference and engine selector. Restart AS after changing engines.

## Data and boundaries

Data lives in `%LOCALAPPDATA%\Agent Spaces Browser`, outside the checkout and installation. Accounts, cookies and history survive upgrades. Deleting a tab does not sign out a website or delete saved accounts.

Tabs share a browser profile: ownership prevents other agent sessions from issuing tools to your tab, **not** from seeing shared website sessions. This is not a separate identity/container per tab. Saved credentials can be retrieved by trusted connected agents. AS does not restrict Codex's other host tools or turn your laptop into a security sandbox. Read [SECURITY.md](SECURITY.md) before using sensitive accounts.

There is no AS analytics or AS cloud service. Websites receive normal browser traffic; observations and retrieved credentials can enter your agent provider's context. Clipboard copying uses the Windows clipboard. Local tab state can contain full URLs, while the activity history deliberately excludes typed text and URL query strings. See [PRIVACY.md](PRIVACY.md).

## Development

```powershell
npm test
npm run test:all
```

Integration tests use temporary profiles and synthetic local websites. They disable Codex setup and do not use real accounts. Build WebView2 first. See [ARCHITECTURE.md](ARCHITECTURE.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Beta limits

Windows x64 only. No desktop/VM features. Account capture is heuristic and cannot recognize every website; agents must explicitly record a final successful account when automatic capture cannot confirm it. CAPTCHA, MFA, passkeys and site restrictions can require a human. Success on one protected site is not a guarantee on another. Automatic browser routing is an agent instruction, not a security policy that intercepts every possible browser launch.
