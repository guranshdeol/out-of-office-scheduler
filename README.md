<div align="center">

<img src="build/icon.png" alt="OOO Scheduler icon" width="128" height="128">

# OOO Scheduler

**Pick your leave days once. Every Microsoft 365 account you work in gets its out-of-office reply and calendar block.**

[![Build](https://github.com/guranshdeol/out-of-office-scheduler/actions/workflows/build.yml/badge.svg)](https://github.com/guranshdeol/out-of-office-scheduler/actions/workflows/build.yml)
[![Latest release](https://img.shields.io/github/v/release/guranshdeol/out-of-office-scheduler?label=download&color=2f6fed)](https://github.com/guranshdeol/out-of-office-scheduler/releases/latest)
![Platforms](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**[⬇️ Download](https://github.com/guranshdeol/out-of-office-scheduler/releases/latest)** · [Website](https://guranshdeol.github.io/out-of-office-scheduler/) · [Install guide](#install) · [Features](#features) · [For IT teams](#for-it-and-security-teams)

<img src="docs/screenshots/calendar.png" alt="Calendar with leave set in Outlook and queued leave" width="820">

</div>

**▶ 72-second walkthrough**

https://github.com/user-attachments/assets/e025628a-dbfd-4e26-8349-5f79feb45055

---

## 💡 Why

If you work across more than one company mailbox, every leave means setting the same out-of-office reply, dates and calendar block in each one, by hand, and it's easy to miss one.

OOO Scheduler does it from one place: **click the days you'll be away, press Apply**, and every connected account is updated.

<a id="features"></a>

## ✨ Features

| | |
|---|---|
| 📬 **Every account at once** | Connect your employer's and clients' Microsoft 365 accounts and apply leave to all of them in one click. |
| 📅 **Separate stretches** | Pick days across different weeks. Days in a row, and the weekends between them, become one period. |
| ⏭️ **Hands-off queue** | Outlook holds one scheduled period at a time, so later leave waits in a queue and goes live after the earlier leave ends, while the app is running. |
| 🔐 **Your company's sign-in** | Okta, Microsoft Entra and other SSO. Sign in once per account; the session is stored encrypted in your OS keychain. |
| 🗓️ **Calendar blocks** | An *Out of office* event is added for each period. Past leave keeps its block. |
| ✍️ **One message, dates filled in** | Write `{end}` (or `{start}`) and each leave fills in its own dates, e.g. *"I'm out of the office until Friday, 24 October."* Give a client its own message if needed. |
| ⏰ **Custom times** | By default 12:00 AM → 12:00 AM local time; switch to custom times, e.g. 12 PM → 12 PM. |
| 🔔 **Update check** | Once a day the app checks for a newer release and links to it. You can switch this off. |
| 🧰 **No admin rights, no server** | The app sets up PowerShell 7 and the Exchange Online module in its own folder, and talks only to Microsoft. |

<table>
  <tr>
    <td><img src="docs/screenshots/accounts.png" alt="Connected accounts"></td>
    <td><img src="docs/screenshots/message.png" alt="Message and settings"></td>
  </tr>
  <tr>
    <td align="center"><sub>Connect as many accounts as you need</sub></td>
    <td align="center"><sub>One message, plus calendar settings</sub></td>
  </tr>
</table>

<a id="install"></a><a id="installing"></a>

## 🚀 Install

### 1. Download

Get the file for your computer from the **[latest release](https://github.com/guranshdeol/out-of-office-scheduler/releases/latest)**:

| Computer | File |
|---|---|
| Mac with Apple Silicon (M1 or newer) | `…-mac-arm64.dmg` |
| Mac with Intel | `…-mac-x64.dmg` |
| Windows | `…-win-x64-setup.exe` (or `…-win-arm64-setup.exe` on ARM) |
| Linux | `.AppImage` or `.deb` (needs GNOME Keyring or KWallet to store sign-ins) |

> [!NOTE]
> The builds aren't code-signed yet, so the **first** launch needs one extra step. It's a one-time thing per install.

### 2. Open it the first time

<a id="opening-it-on-macos"></a>

<details open>
<summary><b>🍎 macOS</b></summary>

<br>

**a. Install.** Open the `.dmg` and drag **OOO Scheduler** into **Applications**.

**b. Without administrator rights only: verify the download, then remove the download flag.**
Skip this if your Mac account is an administrator.

1. From the same release, also download **`SHA256SUMS.txt`** into the folder with the `.dmg` (usually Downloads).
2. In **Terminal**, check the file (on an Intel Mac use `mac-x64.dmg`):

   ```bash
   cd ~/Downloads
   grep "mac-arm64.dmg" SHA256SUMS.txt | shasum -a 256 -c
   ```

   ✅ Continue only if it prints `…mac-arm64.dmg: OK`.<br>
   ❌ If it says `FAILED` or can't find the file, delete the download and download it again.

3. Remove macOS's download flag from the app:

   ```bash
   xattr -d com.apple.quarantine "/Applications/OOO Scheduler.app"
   ```

**c. Open it.** Open **OOO Scheduler** from Applications. When macOS says it *could not verify "OOO Scheduler.app"*:

1. Click **Done** (not *Move to Trash*).
2. Go to **System Settings → Privacy & Security**, scroll down to the message about *OOO Scheduler.app*, and click **Open Anyway**.
3. Enter your password if macOS asks, then click **Open**.

**d. Keychain prompt.** If macOS asks to use *"OOO Scheduler Safe Storage"*, click **Always Allow**. It can come back after updates, because unsigned builds get a new signature each version.

> [!TIP]
> For an extra check that the file was built by this repository's release workflow, run `gh attestation verify <file>.dmg --repo guranshdeol/out-of-office-scheduler` with the [GitHub CLI](https://cli.github.com).

> [!IMPORTANT]
> Only remove the download flag from a file that passed the check. On a company-managed Mac, follow your IT team's policy for installing apps.

</details>

<details>
<summary><b>🪟 Windows</b></summary>

<br>

Run the `-setup.exe`. If **Microsoft Defender SmartScreen** appears, click **More info → Run anyway**.

</details>

<details>
<summary><b>🐧 Linux</b></summary>

<br>

Use the `.AppImage` (make it executable first) or install the `.deb`. A keyring (GNOME Keyring or KWallet) must be available so sign-ins can be stored securely.

</details>

### 3. Set it up

1. On first launch the app sets itself up: it downloads PowerShell 7 if needed and installs the `ExchangeOnlineManagement` module for your user.
2. **Accounts → Connect** each mailbox. Your browser opens once for that company's sign-in.
3. **Message & settings:** write your out-of-office message (use `{end}` for the last day of leave), and keep **Start at login** on so queued leave can go live.
4. **Calendar:** click your leave days and press **Apply**. ✅

## 📌 Good to know

- **Microsoft 365 only.** Works with Exchange Online work and school mailboxes. Gmail and on-premises Exchange aren't supported.
- **Your company still decides.** A tenant can block Exchange Online PowerShell for regular users or force frequent sign-in. **Test connection** shows whether an account works.
- **One period at a time.** Outlook stores one scheduled out-of-office period per mailbox. Later stretches go live once the earlier one ends, so the app needs to be running, in the menu bar, at some point in between.
- **Cancelled leave.** Exchange PowerShell can't delete calendar items. If you cancel leave that's already set and nothing else is queued, the app turns the reply off and gives you a one-click link to delete the block in Outlook.
- **Use your normal mailboxes.** Connect your everyday work accounts, never an administrator account, and check that a company's or client's policies allow it.

<a id="for-it-and-security-teams"></a>

## 🛡️ For IT and security teams

<details>
<summary><b>What the app does, stores and connects to</b></summary>

OOO Scheduler is open source, so everything below can be checked in the code.

- **What it changes.** Only the signed-in user's own automatic replies and the matching *Out of office* calendar block. Each session loads just two cmdlets: `Get-MailboxAutoReplyConfiguration` and `Set-MailboxAutoReplyConfiguration` (with `-CreateOOFEvent` for the calendar block).
- **Permissions.** The user signs in through Microsoft's own Exchange Online PowerShell public client (`fb78d390-0c51-40cd-8e17-fdbfab77341b`) in the system browser, with the company's usual SSO and MFA. There's no app registration and no admin consent. The app acts with the user's own Exchange Online rights. A tenant that blocks Exchange Online PowerShell for users also blocks the app.
- **What's stored.** In the app's data folder (`~/Library/Application Support/OOO Scheduler`, `%APPDATA%\OOO Scheduler` or `~/.config/OOO Scheduler`):
  - the MSAL token cache, encrypted with the OS (Keychain on macOS, DPAPI on Windows, libsecret on Linux) and readable only by the user;
  - a settings file with account addresses, nicknames, the message and leave dates.

  Removing an account deletes its saved sign-in. Sessions follow the tenant's sign-in policies and can be revoked like any other Microsoft 365 session.
- **Network.** `github.com` and its download CDN (first-run PowerShell 7 download), `api.github.com` (daily check for a newer release, which users can switch off), the PowerShell Gallery (`ExchangeOnlineManagement` module), `login.microsoftonline.com` (sign-in) and `outlook.office365.com` (Exchange Online). No other servers, and no telemetry.
- **Processes.** The app runs its bundled scripts in a separate `pwsh` process; on Windows it starts it with `-ExecutionPolicy Bypass` so those scripts can run. The access token is passed over stdin, never on the command line.
- **Builds.** Release builds are made by GitHub Actions from this repository. Each release includes `SHA256SUMS.txt` and a GitHub build attestation, so a download can be checked with `gh attestation verify <file> --repo guranshdeol/out-of-office-scheduler`. The builds aren't code-signed yet, so macOS and Windows show a warning the first time.
- **Updates.** The app never downloads or installs updates by itself. It only tells the user that a newer release exists.

**For users:** connect your normal work mailboxes only, never an administrator account. Before connecting a company's or client's mailbox, check that their policies allow it.

</details>

<a id="how-it-works"></a>

## ⚙️ How it works

<details>
<summary><b>Architecture</b></summary>

```mermaid
flowchart LR
    UI["Calendar UI"] --> Main["Electron main process"]
    Main --> Queue["Leave queue + scheduler"]
    Main --> Auth["Sign-in (MSAL)<br/>tokens in OS keychain"]
    Queue --> PS["PowerShell 7<br/>ExchangeOnlineManagement"]
    Auth -->|access token| PS
    PS -->|Set-MailboxAutoReplyConfiguration| EXO["Exchange Online<br/>(each account)"]
```

- The app uses **Exchange Online PowerShell**, the same supported tool admins use, to set your own mailbox's automatic replies (`Set-MailboxAutoReplyConfiguration`). It works with ordinary user permissions in most companies, even ones that block third-party Microsoft Graph apps.
- Signing in uses the Exchange Online PowerShell public client through MSAL, in your system browser. Only the refresh token is stored, encrypted by the OS: Keychain on macOS, DPAPI on Windows, libsecret on Linux.
- Every request goes straight from your computer to Microsoft. There's no server in between, and no analytics.

</details>

<a id="development"></a>

## 🛠️ Development

```bash
git clone https://github.com/guranshdeol/out-of-office-scheduler.git
cd out-of-office-scheduler
npm install
npm run electron:install   # downloads the Electron binary if npm skipped install scripts
npm run dev                # run with hot reload
```

| Command | What it does |
|---|---|
| `npm run dev` | Start the app in development mode |
| `npm test` | Run unit tests (Vitest) |
| `npm run typecheck` | Type-check the main process and the UI |
| `npm run dist:mac` | Build the macOS `.dmg` files locally |

Behind a corporate TLS-inspecting proxy, prefix npm and build commands with `NODE_USE_SYSTEM_CA=1` so Node trusts your OS certificate store.

### Project layout

```
src/
  main/        Electron main process: sign-in, scheduler, PowerShell runner, tray
  preload/     Safe bridge between the UI and the main process
  renderer/    React UI (calendar, accounts, message)
  shared/      Types and date helpers used by both sides
resources/
  scripts/     PowerShell scripts that talk to Exchange Online
tests/         Unit tests
```

### Releasing

Push a version tag. GitHub Actions builds macOS, Windows and Linux installers and publishes them on the Releases page:

```bash
npm version patch          # or minor / major
git push --follow-tags
```

## 🙏 Credits

- App icon based on [Lucide](https://lucide.dev) *calendar-clock* (ISC License).
- Built with [Electron](https://www.electronjs.org), [React](https://react.dev), [electron-vite](https://electron-vite.org) and [MSAL Node](https://github.com/AzureAD/microsoft-authentication-library-for-js).

## 📄 License

[MIT](LICENSE) © 2026 Guransh Deol
