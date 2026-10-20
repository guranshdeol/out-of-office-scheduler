import type { RuntimeStatus } from '@shared/types'

export function SetupBanner({ runtime }: { runtime: RuntimeStatus }): React.JSX.Element | null {
  if (runtime.phase === 'ready') return null
  if (runtime.phase === 'error') {
    return (
      <div className="banner error">
        <div>
          <strong>Setup failed.</strong> {runtime.message}
        </div>
        <button className="btn small" onClick={() => void window.ooo.retrySetup()}>
          Retry
        </button>
      </div>
    )
  }
  return (
    <div className="banner info">
      <div>
        <strong>Setting up (first run only):</strong> {runtime.message}
        {runtime.progress !== undefined && ` ${Math.round(runtime.progress * 100)}%`}
      </div>
      {runtime.progress !== undefined && (
        <div className="progress">
          <div style={{ width: `${Math.round(runtime.progress * 100)}%` }} />
        </div>
      )}
    </div>
  )
}
