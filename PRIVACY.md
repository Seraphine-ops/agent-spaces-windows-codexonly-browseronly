# Local data

Agent Spaces Browser has no built-in telemetry or cloud account service.

The default directory is `%LOCALAPPDATA%\Agent Spaces Browser`:

| Data | Purpose |
| --- | --- |
| accounts.enc | Encrypted saved usernames, emails, passwords, defaults and task/timestamp metadata |
| profile / webview2-profile | Browser profiles, cookies, cache and website storage, separate per engine |
| tabs.json | Restored tabs, including titles and full URLs; may contain sensitive paths/query strings |
| browser-history.json | Searchable tab/action/time/domain activity; no typed field contents or URL query strings |
| downloads | Files explicitly downloaded inside the browser |
| settings.json | Engine, pause and Codex preference settings |
| runtime.json | Temporary local broker port and authentication token |
| launch.json | Installed executable location used by the MCP launcher |

Passwords pending capture/consent are held in application memory and expire; they are not logged as activity. Explicit Copy actions place the selected value on the system clipboard, which other software or clipboard history may access. The app does not automatically clear the clipboard.

Websites receive normal browser requests. Codex and its provider receive whatever observations, screenshots or credentials its tools request; their own retention policies apply. AS is not a way to keep data out of your model provider's context.

Delete accounts in Accounts; delete tab history through the tab confirmation or History. Deleting an account from AS does not sign out website sessions or delete the remote account. For complete local removal, quit AS and delete its data directory yourself after saving anything needed. Uninstalling is not advertised as erasing browser/account data.
