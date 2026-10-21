import { useState } from 'react'
import type { AppState } from '@shared/types'

/** Tells the user a newer release is available, with a link to download it. */
export function UpdateBanner({ state }: { state: AppState }): React.JSX.Element | null {
  const [dismissed, setDismissed] = useState<string>()
  const latest = state.update.latest
  if (!latest || dismissed === latest.version) return null
  return (
    <div className="banner info">
      <div>
        <strong>Version {latest.version} is available.</strong> You have {state.version}.
      </div>
      <div className="row" style={{ marginTop: 0 }}>
        <a className="btn small primary" href={latest.url} target="_blank" rel="noreferrer">
          Download
        </a>
        <button className="btn small" onClick={() => setDismissed(latest.version)}>
          Later
        </button>
      </div>
    </div>
  )
}
