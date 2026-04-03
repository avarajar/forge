import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { StatusCard, ActionButton } from '@forge-dev/ui'

function PipelinePanel({ moduleId, projectId }: PanelProps) {
  const [platform, setPlatform] = useState<string>('detecting...')
  const [deploying, setDeploying] = useState(false)
  const [deployResult, setDeployResult] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/actions/${moduleId}/detect-platform`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }) })
      .then(r => r.json()).then((res: { output: string }) => setPlatform(res.output.trim() || 'none'))
      .catch(() => setPlatform('unknown'))
  }, [moduleId, projectId])

  const runDeploy = async () => {
    setDeploying(true); setDeployResult(null)
    try {
      const res = await fetch(`/api/actions/${moduleId}/deploy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }) })
      const result = await res.json() as { exitCode: number; output: string }
      setDeployResult(result.exitCode === 0 ? 'Deploy successful' : `Deploy failed: ${result.output.slice(0, 200)}`)
    } catch { setDeployResult('Deploy failed') }
    finally { setDeploying(false) }
  }

  return (
    <div>
      <div class="grid grid-cols-3 gap-4 mb-6">
        <StatusCard icon="cloud" label="Platform" value={platform === 'none' ? 'Not detected' : platform} status={platform !== 'none' && platform !== 'detecting...' ? 'good' : 'neutral'} />
        <StatusCard icon="git-branch" label="Branch" value="current" status="neutral" />
        <StatusCard icon="rocket" label="Last Deploy" value={deployResult ? (deployResult.includes('successful') ? 'Success' : 'Failed') : 'N/A'} status={deployResult ? (deployResult.includes('successful') ? 'good' : 'bad') : 'neutral'} />
      </div>
      <ActionButton label={deploying ? 'Deploying...' : 'Deploy Now'} variant="primary" loading={deploying} onClick={runDeploy} />
      {deployResult && (
        <div class={`mt-4 text-sm px-3 py-2 rounded-lg ${deployResult.includes('successful') ? 'bg-forge-success/10 text-forge-success' : 'bg-forge-error/10 text-forge-error'}`}>{deployResult}</div>
      )}
    </div>
  )
}

export default definePanel({ id: 'pipeline', title: 'Pipeline', component: PipelinePanel })
