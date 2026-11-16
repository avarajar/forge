import { type FunctionComponent } from 'preact'
import { useEffect, useMemo, useState } from 'preact/hooks'
import type { ModuleStatus, PanelConfig, PanelProps } from '@forge-dev/sdk'
import { modules } from '../hooks/useModules.js'
import { ErrorBoundary } from './ErrorBoundary.js'
import { createPanelClient, importPanel } from '../config/moduleClient.js'

const BannerError: FunctionComponent<{ name: string; message: string }> = ({ name, message }) => (
  <div class="mono" style={{ padding: '8px 12px', borderRadius: '10px', fontSize: '11.5px', color: 'var(--red)', background: 'var(--card)', border: '1px solid color-mix(in srgb, var(--red) 45%, var(--hair))' }}>
    {name} banner did not load: {message}
  </div>
)

const Banner: FunctionComponent<{ status: ModuleStatus; banner: { url: string; version: number } }> = ({ status, banner }) => {
  const [loaded, setLoaded] = useState<{ version: number; config?: PanelConfig; error?: string } | null>(null)
  const client = useMemo(() => createPanelClient(status.id, () => status.displayName, () => {}), [status.id])

  useEffect(() => {
    let live = true
    importPanel(banner.url, banner.version).then(
      config => { if (live) setLoaded({ version: banner.version, config }) },
      (err: Error) => { if (live) setLoaded({ version: banner.version, error: err.message }) },
    )
    return () => { live = false }
  }, [banner.url, banner.version])

  if (!loaded || loaded.version !== banner.version) return null
  if (loaded.error) return <BannerError name={status.displayName} message={loaded.error} />
  const Panel = loaded.config?.component as FunctionComponent<PanelProps> | undefined
  if (!Panel) return null
  return (
    <ErrorBoundary key={banner.version} fallback={error => <BannerError name={status.displayName} message={error.message} />}>
      <Panel moduleId={status.id} projectId={null} cwProject={null} forge={client} />
    </ErrorBoundary>
  )
}

// every enabled module that declares a banner renders it at the top of the task list
export const ModuleBanners: FunctionComponent = () => {
  const withBanner = modules.value.filter(m => m.state === 'enabled' && m.banner?.enabled)
  if (withBanner.length === 0) return null
  return (
    <>
      {withBanner.map(m => <Banner key={m.id} status={m} banner={m.banner!} />)}
    </>
  )
}
