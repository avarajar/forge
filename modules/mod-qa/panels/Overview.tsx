import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { StatusCard, ActionButton } from '@forge-dev/ui'

function OverviewPanel({ moduleId, projectId }: PanelProps) {
  const [runner, setRunner] = useState<string>('detecting...')
  const [lastUnit, setLastUnit] = useState<{ exitCode: number } | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    fetch(`/api/actions/${moduleId}/detect-runner`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId })
    })
      .then(r => r.json())
      .then((res: { output: string }) => setRunner(res.output.trim() || 'none'))
      .catch(() => setRunner('unknown'))
  }, [moduleId, projectId])

  const runQuickCheck = async () => {
    setRunning(true)
    try {
      const res = await fetch(`/api/actions/${moduleId}/run-unit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      })
      const result = await res.json() as { exitCode: number }
      setLastUnit(result)
    } catch { setLastUnit({ exitCode: 1 }) }
    finally { setRunning(false) }
  }

  const unitStatus = lastUnit === null ? 'neutral' : lastUnit.exitCode === 0 ? 'good' : 'bad'

  return (
    <div>
      <div class="grid grid-cols-3 gap-4 mb-6">
        <StatusCard icon="test-tube" label="Test Runner" value={runner === 'none' ? 'Not found' : runner} status={runner !== 'none' && runner !== 'detecting...' ? 'good' : 'neutral'} />
        <StatusCard icon="check-circle" label="Unit Tests" value={lastUnit === null ? 'Not run' : lastUnit.exitCode === 0 ? 'Passing' : 'Failing'} status={unitStatus as 'good' | 'bad' | 'neutral'} />
        <StatusCard icon="shield-check" label="Security" value="Not scanned" status="neutral" />
      </div>
      <ActionButton label={running ? 'Running...' : 'Quick Check'} variant="primary" loading={running} onClick={runQuickCheck} />
    </div>
  )
}

export default definePanel({ id: 'overview', title: 'Overview', component: OverviewPanel })
