import { Component, type ComponentChildren, type FunctionComponent } from 'preact'
import { useEffect, useMemo, useState } from 'preact/hooks'
import type { ModuleStatus, PanelConfig, PanelProps } from '@forge-dev/sdk'
import { modules } from '../hooks/useModules.js'
import { createPanelClient, importPanel } from '../config/moduleClient.js'

// a broken banner shows one quiet line and never takes the task list with it
class BannerBoundary extends Component<{ name: string; children: ComponentChildren }, { error: Error | null }> {
  state = { error: null as Error | null }
  componentDidCatch(error: Error) {
    this.setState({ error })
  }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return <BannerError name={this.props.name} message={error.message} />
  }
}

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
    <BannerBoundary key={banner.version} name={status.displayName}>
      <Panel moduleId={status.id} projectId={null} cwProject={null} forge={client} />
    </BannerBoundary>
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
