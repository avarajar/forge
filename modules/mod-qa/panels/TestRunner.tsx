import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { ActionButton, ForgeTerminal } from '@forge-dev/ui'

const TEST_ACTIONS = [
  { actionId: 'run-unit', label: 'Unit Tests', icon: 'play' },
  { actionId: 'run-e2e', label: 'E2E Tests', icon: 'monitor-check' },
  { actionId: 'security-scan', label: 'Security Scan', icon: 'shield-alert' },
  { actionId: 'load-test', label: 'Load Test', icon: 'gauge' },
  { actionId: 'visual-regression', label: 'Visual Regression', icon: 'eye' },
  { actionId: 'full-suite', label: 'Full Suite', icon: 'list-checks' },
]

function TestRunnerPanel({ moduleId, projectId }: PanelProps) {
  const [output, setOutput] = useState<string | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [exitCode, setExitCode] = useState<number | null>(null)

  const runTest = async (actionId: string) => {
    setRunning(actionId)
    setOutput(null)
    setExitCode(null)
    try {
      const res = await fetch(`/api/actions/${moduleId}/${actionId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      })
      const result = await res.json() as { output: string; exitCode: number }
      setOutput(result.output)
      setExitCode(result.exitCode)
    } catch { setOutput('Failed to execute test'); setExitCode(1) }
    finally { setRunning(null) }
  }

  return (
    <div>
      <div class="flex flex-wrap gap-2 mb-6">
        {TEST_ACTIONS.map(t => (
          <ActionButton key={t.actionId} label={t.label} icon={t.icon}
            variant={running === t.actionId ? 'primary' : 'secondary'}
            loading={running === t.actionId} disabled={running !== null && running !== t.actionId}
            onClick={() => runTest(t.actionId)} />
        ))}
      </div>
      {exitCode !== null && (
        <div class={`text-sm mb-4 px-3 py-2 rounded-lg ${exitCode === 0 ? 'bg-forge-success/10 text-forge-success' : 'bg-forge-error/10 text-forge-error'}`}>
          {exitCode === 0 ? 'Tests passed' : `Tests failed (exit code ${exitCode})`}
        </div>
      )}
      {output && <ForgeTerminal content={output} height={400} />}
    </div>
  )
}

export default definePanel({ id: 'test-runner', title: 'Test Runner', component: TestRunnerPanel })
