import { useState, useMemo } from 'preact/hooks'
import type { CWSession } from '@forge-dev/core'

interface UseTaskFiltersOptions {
  spaces: CWSession[]
  accounts: string[]
  projects: Record<string, { path: string; account: string }>
}

export function useTaskFilters({ spaces, accounts, projects }: UseTaskFiltersOptions) {
  const [filterAccount, setFilterAccount] = useState<string | null>(null)
  const [filterProject, setFilterProject] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)

  const accountNames = useMemo(() => {
    if (accounts.length > 0) return accounts
    const names = new Set<string>()
    for (const s of spaces) if (s.account) names.add(s.account)
    return Array.from(names).sort()
  }, [accounts, spaces])

  const projectNames = useMemo(() => {
    const names = new Set<string>()
    for (const s of spaces) {
      if (filterAccount && s.account !== filterAccount) continue
      names.add(s.project)
    }
    return Array.from(names).sort()
  }, [spaces, filterAccount])

  const handleFilterAccount = (account: string | null) => {
    setFilterAccount(account)
    if (account && filterProject) {
      const proj = projects[filterProject]
      if (proj && proj.account !== account) setFilterProject(null)
    }
  }

  const filteredSpaces = useMemo(() => {
    return spaces.filter(s => {
      if (filterAccount && s.account !== filterAccount) return false
      if (filterProject && s.project !== filterProject) return false
      if (filterType) {
        if (filterType === 'dev' && s.type !== 'task') return false
        if (filterType === 'review' && s.type !== 'review') return false
        if (filterType === 'design' || filterType === 'plan') return false
      }
      if (!showDone && s.status === 'done') return false
      return true
    })
  }, [spaces, filterAccount, filterProject, filterType, showDone])

  return {
    filterAccount,
    setFilterAccount: handleFilterAccount,
    filterProject,
    setFilterProject,
    filterType,
    setFilterType,
    showDone,
    setShowDone,
    accountNames,
    projectNames,
    filteredSpaces,
  }
}
