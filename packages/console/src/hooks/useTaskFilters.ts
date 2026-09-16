import { useState, useMemo } from 'preact/hooks'
import type { CWSession } from '@forge-dev/core'
import { QUICK_TO_SESSION, type QuickType } from '../config/types.js'

interface UseTaskFiltersOptions {
  spaces: CWSession[]
  accounts: string[]
  projects: Record<string, { path: string; account: string }>
}

export function useTaskFilters({ spaces, accounts, projects }: UseTaskFiltersOptions) {
  const [filterAccount, setFilterAccount] = useState<string | null>(null)
  const [filterProject, setFilterProject] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<QuickType | null>(null)
  const [filterHarness, setFilterHarness] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)

  const harnessNames = useMemo(
    () => Array.from(new Set(spaces.map(s => s.harness ?? 'claude'))).sort(),
    [spaces]
  )

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
    // Also include registered projects (filtered by account) so projects
    // with no sessions still appear after being moved to a new account
    for (const [name, p] of Object.entries(projects)) {
      if (filterAccount && p.account !== filterAccount) continue
      names.add(name)
    }
    return Array.from(names).sort()
  }, [spaces, projects, filterAccount])

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
      if (filterHarness && (s.harness ?? 'claude') !== filterHarness) return false
      if (filterType && s.type !== QUICK_TO_SESSION[filterType]) return false
      if (!showDone && s.status === 'done') return false
      return true
    })
  }, [spaces, filterAccount, filterProject, filterType, filterHarness, showDone])

  return {
    filterAccount,
    setFilterAccount: handleFilterAccount,
    filterProject,
    setFilterProject,
    filterType,
    setFilterType,
    filterHarness,
    setFilterHarness,
    showDone,
    setShowDone,
    accountNames,
    projectNames,
    harnessNames,
    filteredSpaces,
  }
}
