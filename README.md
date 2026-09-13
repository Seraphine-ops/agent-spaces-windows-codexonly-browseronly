<img src="app/ui/logo.svg" width="84" alt="Agent Spaces logo">

# Agent Spaces

I built Agent Spaces because I wanted agents to have their own home on my laptop. Their browser work interrupted mine, and their activity felt scattered across chats, tabs and apps. I wanted somewhere I could see what they were doing, which accounts they were using, and what needed my attention, separate from my personal workspace.

Agent Spaces has a built-in browser that connects directly to Codex. Once connected, Codex uses it automatically for browser tasks. You keep prompting in the same Codex task, with its conversation context intact. Crucially, agents don’t need to take over your screen or mouse: they work in their own browser tabs while you use your computer normally.

Here’s what it adds around Codex:

- **Separation:** agents browse independently without interrupting your personal workspace.
- **Accounts:** agents create accounts or use yours, saving and reusing logins across tasks.
- **Verification:** agents independently use saved email inboxes to retrieve codes, follow links and complete supported signups.
- **Alerts:** desktop notifications take you straight to the tab needing input, even while you’re using another app.
- **Handoff:** take control, complete the human step and quickly return control with the session intact.
- **Concurrent work:** different agents work in separate tabs.
- **Visibility:** tabs and searchable history keep agent activity visible.

For example, one agent can create and save an email account. Another can use it to register elsewhere, open the inbox, complete email verification, and save the new login. It can then work inside that account, and future agents can pick up using the saved login.

The GitHub account hosting this project was created through Agent Spaces using that workflow: an agent created the email account, another used it to create and verify the GitHub account, and its credentials were saved for subsequent work.

Some agent products offer overlapping features. Agent Spaces brings these capabilities together in one workspace you can see and manage.

This release supports **Windows x64, Codex, and browser tasks**. I also have prototypes that extend Agent Spaces to desktop apps running inside a virtual machine, so agents can work there without taking over your personal desktop. I’m working toward macOS and Linux support, alongside connections to other agent harnesses, including Claude. Those capabilities are not included in this release.

To get started, clone the repository and run the setup launcher:

```powershell
git clone https://github.com/Seraphine-ops/agent-spaces-windows-codexonly-browseronly.git
cd agent-spaces-windows-codexonly-browseronly
& '.\Setup Agent Spaces.cmd'
```

Alternatively, download the source ZIP, extract it, and double-click **Setup Agent Spaces.cmd**. Setup installs missing prerequisites, builds the browser workspace and opens Agent Spaces. Windows may ask for installation permission. On first launch, Agent Spaces registers its Codex connector and browser preference. Restart Codex so it loads the tools.

**Take control** pauses agent input for one tab. **Return to agent** lets a task that is still running and waiting continue from the updated page. **Pause browser agents** pauses the entire browser workspace, including new tasks, until you resume it. Closing the window keeps Agent Spaces running in the system tray; **Quit runtime** stops it.

Saved credentials are encrypted locally using Windows-backed storage. Connected agents can retrieve them, and information requested by an agent may enter its model provider’s context. Tabs within the same browser engine share website sessions; they are not separate account containers. Agent Spaces does not restrict Codex’s other computer tools. Some websites and verification methods still require human help.

For technical details, see [SECURITY.md](SECURITY.md), [PRIVACY.md](PRIVACY.md), [SECURITY-REVIEW.md](SECURITY-REVIEW.md), [CONTRIBUTING.md](CONTRIBUTING.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

MIT licensed.
