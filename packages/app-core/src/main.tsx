import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'

const FloatingNoteApp = lazy(async () => {
  const module = await import('./components/FloatingNoteApp')
  return { default: module.FloatingNoteApp }
})

const QuickCaptureApp = lazy(async () => {
  const module = await import('./components/QuickCaptureApp')
  return { default: module.QuickCaptureApp }
})

const ExternalFileApp = lazy(async () => {
  const module = await import('./components/ExternalFileApp')
  return { default: module.ExternalFileApp }
})

const FloatingHtmlApp = lazy(async () => {
  const module = await import('./components/FloatingHtmlApp')
  return { default: module.FloatingHtmlApp }
})

export function renderZenNotesApp(root: HTMLElement): void {
  const params = new URLSearchParams(window.location.search)
  const isFloating = params.get('floating') === '1'
  const isQuickCapture = params.get('quickCapture') === '1'
  const isExternalFile = params.get('externalFile') !== null
  const floatingNotePath = params.get('note')
  const isHtmlFloat = params.get('htmlAsset') === '1'
  const htmlUrl = params.get('htmlUrl')
  const htmlTitle = params.get('htmlTitle')
  const htmlNet = params.get('net') === '1'

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <Suspense fallback={null}>
        {isQuickCapture ? (
          <QuickCaptureApp />
        ) : isExternalFile ? (
          <ExternalFileApp />
        ) : isFloating && isHtmlFloat && htmlUrl ? (
          <FloatingHtmlApp
            assetUrl={htmlUrl}
            title={htmlTitle ?? 'HTML attachment'}
            allowNetwork={htmlNet}
          />
        ) : isFloating && floatingNotePath ? (
          <FloatingNoteApp notePath={floatingNotePath} />
        ) : (
          <App />
        )}
      </Suspense>
    </React.StrictMode>
  )
}
