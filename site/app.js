const REPO = 'guranshdeol/out-of-office-scheduler'
const LATEST = `https://github.com/${REPO}/releases/latest`

const PLATFORMS = [
  { os: 'mac', group: 'macOS', label: 'Apple Silicon', ext: '.dmg', match: /mac-arm64\.dmg$/ },
  { os: 'mac', group: 'macOS', label: 'Intel', ext: '.dmg', match: /mac-x64\.dmg$/ },
  { os: 'win', group: 'Windows', label: 'x64', ext: '.exe', match: /win-x64-setup\.exe$/ },
  { os: 'win', group: 'Windows', label: 'ARM64', ext: '.exe', match: /win-arm64-setup\.exe$/ },
  { os: 'linux', group: 'Linux', label: 'AppImage · x86_64', ext: '.AppImage', match: /linux-x86_64\.AppImage$/ },
  { os: 'linux', group: 'Linux', label: 'AppImage · arm64', ext: '.AppImage', match: /linux-arm64\.AppImage$/ },
  { os: 'linux', group: 'Linux', label: 'Debian · amd64', ext: '.deb', match: /linux-amd64\.deb$/ },
  { os: 'linux', group: 'Linux', label: 'Debian · arm64', ext: '.deb', match: /linux-arm64\.deb$/ }
]

const NAMES = { mac: 'macOS', win: 'Windows', linux: 'Linux' }

async function detectPlatform() {
  const ua = navigator.userAgent
  const os = /Mac/i.test(ua) ? 'mac' : /Win/i.test(ua) ? 'win' : /Linux|X11/i.test(ua) && !/Android/i.test(ua) ? 'linux' : null
  let arm = os === 'mac'
  try {
    const hints = await navigator.userAgentData?.getHighEntropyValues(['architecture'])
    if (hints?.architecture) arm = hints.architecture === 'arm'
  } catch {
    // Safari and Firefox don't expose architecture; Apple Silicon is the safe default on macOS
  }
  if (os === 'win' && /ARM64/i.test(ua)) arm = true
  return { os, arm }
}

function pick(entries, { os, arm }) {
  if (!os) return undefined
  const candidates = entries.filter((e) => e.os === os)
  if (os === 'mac') return candidates.find((e) => e.label === (arm ? 'Apple Silicon' : 'Intel')) ?? candidates[0]
  if (os === 'win') return candidates.find((e) => e.label === (arm ? 'ARM64' : 'x64')) ?? candidates[0]
  return candidates.find((e) => e.label.includes(arm ? 'arm64' : 'x86_64')) ?? candidates[0]
}

const mb = (bytes) => `${Math.round(bytes / 1048576)} MB`

function renderDownloads(entries, recommended) {
  const root = document.querySelector('[data-downloads]')
  if (!root) return
  const groups = ['macOS', 'Windows', 'Linux']
  root.innerHTML = groups
    .map((g) => {
      const items = entries.filter((e) => e.group === g)
      if (items.length === 0) return ''
      const links = items
        .map(
          (e) =>
            `<a class="dl${e === recommended ? ' recommended' : ''}" href="${e.url}">${e.label}<span class="mono">${e.ext} · ${mb(e.size)}</span></a>`
        )
        .join('')
      return `<div class="dl-group"><h3>${g}</h3>${links}</div>`
    })
    .join('')
}

async function init() {
  const platform = await detectPlatform()
  const buttons = document.querySelectorAll('[data-primary-download]')
  const note = document.querySelector('[data-primary-note]')
  if (platform.os) buttons.forEach((b) => (b.textContent = `Download for ${NAMES[platform.os]}`))

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' }
    })
    if (!res.ok) throw new Error(`GitHub API ${res.status}`)
    const release = await res.json()
    const entries = PLATFORMS.flatMap((p) => {
      const asset = release.assets.find((a) => p.match.test(a.name))
      return asset ? [{ ...p, url: asset.browser_download_url, size: asset.size }] : []
    })
    const recommended = pick(entries, platform)
    renderDownloads(entries, recommended)

    if (recommended) {
      buttons.forEach((b) => (b.href = recommended.url))
      if (note) note.textContent = `${release.tag_name} · ${recommended.group} ${recommended.label} · ${mb(recommended.size)}`
    } else {
      buttons.forEach((b) => (b.href = '#download'))
    }

    const date = new Date(release.published_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    const meta = document.querySelector('[data-release-meta]')
    if (meta) meta.innerHTML = `<span class="mono">${release.tag_name}</span> · released ${date} · <a href="${release.html_url}">release notes</a>`
    document.querySelectorAll('[data-version]').forEach((el) => (el.textContent = `${release.tag_name} · free & open source`))
  } catch {
    buttons.forEach((b) => (b.href = LATEST))
  }
}

init()
