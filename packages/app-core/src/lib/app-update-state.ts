import { useCallback, useEffect, useState } from 'react'
import type { AppUpdateState } from '@shared/ipc'
import { getZenBridge } from '@zennotes/bridge-contract/bridge'

/**
 * Remembers the last update version the user dismissed from the notice banner.
 * Stored as a plain version string so the banner stays hidden for that version
 * but reappears once a newer one is published.
 */
const DISMISSED_UPDATE_KEY = 'zen:app-update-dismissed:v1'

export function loadDismissedUpdateVersion(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(DISMISSED_UPDATE_KEY)
  } catch {
    return null
  }
}

export function saveDismissedUpdateVersion(version: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DISMISSED_UPDATE_KEY, version)
  } catch {
    // Persistence is best-effort (private mode / quota); ignore failures.
  }
}

/**
 * Tracks whether the update notice for `availableVersion` has been dismissed.
 * Dismissal is keyed to the version, so publishing a newer release brings the
 * banner back.
 */
export function useUpdateNoticeDismissal(availableVersion: string | null | undefined): {
  dismissed: boolean
  dismiss: () => void
} {
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() =>
    loadDismissedUpdateVersion()
  )

  const dismissed = availableVersion != null && dismissedVersion === availableVersion

  const dismiss = useCallback(() => {
    if (availableVersion == null) return
    saveDismissedUpdateVersion(availableVersion)
    setDismissedVersion(availableVersion)
  }, [availableVersion])

  return { dismissed, dismiss }
}

export function useAppUpdateState(): AppUpdateState | null {
  const [state, setState] = useState<AppUpdateState | null>(null)

  useEffect(() => {
    const zen = getZenBridge()
    let cancelled = false

    void zen.getAppUpdateState().then(
      (next) => {
        if (!cancelled) setState(next)
      },
      () => {
        if (!cancelled) setState(null)
      }
    )

    const unsubscribe = zen.onAppUpdateState((next) => {
      if (!cancelled) setState(next)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return state
}

export function appUpdateBadgeLabel(state: AppUpdateState | null): string | null {
  switch (state?.phase) {
    case 'available':
      return 'Update'
    case 'downloaded':
      return 'Ready'
    case 'downloading':
      return `${Math.round(state.progressPercent ?? 0)}%`
    default:
      return null
  }
}

export function appUpdateNoticeLabel(state: AppUpdateState | null): string | null {
  switch (state?.phase) {
    case 'available':
      return `ZenNotes ${state.availableVersion ?? 'update'} is available`
    case 'downloaded':
      return `ZenNotes ${state.availableVersion ?? 'update'} is ready`
    case 'downloading':
      return `Downloading ZenNotes ${state.availableVersion ?? 'update'}`
    default:
      return null
  }
}

export function appUpdatePrimaryActionLabel(state: AppUpdateState | null): string | null {
  switch (state?.phase) {
    case 'available':
      return 'Download'
    case 'downloaded':
      return 'Relaunch'
    default:
      return null
  }
}
