import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { EmptyState, ActionButton, StatusCard } from '@forge-dev/ui'

interface CoverageSummary { lines: number; branches: number; functions: number; statements: number }

function CoveragePanel({ moduleId, projectId }: PanelProps) {
  const [coverage, setCoverage] = useState<CoverageSummary | null>(null)
  const [loading, setLoading] = useState(false)

  const runCoverage = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/actions/${moduleId}/run-unit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      })
      const result = await res.json() as { output: string }
      const lines = result.output.match(/Lines\s*:\s*([\d.]+)%/)
      const branches = result.output.match(/Branches\s*:\s*([\d.]+)%/)
      const functions = result.output.match(/Functions\s*:\s*([\d.]+)%/)
      const stmts = result.output.match(/Statements?\s*:\s*([\d.]+)%/)
      if (lines || stmts) {
        setCoverage({
          lines: lines ? parseFloat(lines[1]) : 0,
          branches: branches ? parseFloat(branches[1]) : 0,
          functions: functions ? parseFloat(functions[1]) : 0,
          statements: stmts ? parseFloat(stmts[1]) : 0
        })
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  if (!coverage) {
    return (<EmptyState icon="bar-chart-3" title="No Coverage Data" description="Run unit tests with coverage enabled to see coverage metrics." action={{ label: loading ? 'Running...' : 'Run with Coverage', onClick: runCoverage }} />)
  }

  const threshold = (val: number): 'good' | 'warn' | 'bad' => val >= 80 ? 'good' : val >= 50 ? 'warn' : 'bad'

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">Coverage Summary</h3>
        <ActionButton label="Refresh" variant="secondary" loading={loading} onClick={runCoverage} />
      </div>
      <div class="grid grid-cols-4 gap-4">
        <StatusCard icon="minus" label="Lines" value={`${coverage.lines}%`} status={threshold(coverage.lines)} />
        <StatusCard icon="git-branch" label="Branches" value={`${coverage.branches}%`} status={threshold(coverage.branches)} />
        <StatusCard icon="braces" label="Functions" value={`${coverage.functions}%`} status={threshold(coverage.functions)} />
        <StatusCard icon="file-code" label="Statements" value={`${coverage.statements}%`} status={threshold(coverage.statements)} />
      </div>
    </div>
  )
}

export default definePanel({ id: 'coverage', title: 'Coverage', component: CoveragePanel })
