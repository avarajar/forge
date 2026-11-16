import type { SessionInfo } from '@forge-dev/sdk'

const SLACK = 'mcp__claude_ai_Slack__'
const LINEAR = 'mcp__claude_ai_Linear__'

export const READER_TOOLS: string[] = [
  ...['slack_search_public_and_private', 'slack_read_thread', 'slack_read_user_profile'].map(t => SLACK + t),
  ...['list_issues', 'get_issue', 'list_comments', 'whoami'].map(t => LINEAR + t),
]

export function buildPrompt(o: { since: string; sessions: SessionInfo[]; projects: string[] }): string {
  const sessions = o.sessions.length
    ? o.sessions.map(s => `- ${s.project}::${s.sessionDir}${s.task ? ` (${s.task})` : ''}`).join('\n')
    : '- none'
  return `You read my Linear and Slack and list what needs my attention, since ${o.since}. You only read; never post, comment or change anything.

Open sessions (project::sessionDir):
${sessions}

Known projects: ${o.projects.length ? o.projects.join(', ') : 'none'}

How to read:
- Linear: use whoami, then list_issues for issues assigned to me. list_issues paginates, so follow every page until hasNextPage is false. Use get_issue and list_comments for detail.
- Slack: search messages that mention me or ask me something, and read their threads. Ask for detailed results with a permalink for every message. If a result has no permalink, build one from the channel id and the message ts.

Item kinds (to-task | issue | request | research), exactly one per item:
- to-task: news about an open session listed above; set targetSession to that session.
- issue: a Linear issue assigned to me that has no open session; set issueKey, and project when it clearly belongs to a known project.
- request: a concrete ask for me in Slack that has no issue.
- research: something general I should find out.

Answer with ONLY a JSON object, no prose and no code fence:
{ "items": [ { "source": "linear" | "slack", "kind": "to-task" | "issue" | "request" | "research", "title": string, "who": string, "where": string, "when": ISO time of the latest activity, "quote"?: string, "link": string (permalink or issue URL), "issueKey"?: string, "targetSession"?: { "project": string, "sessionDir": string }, "project"?: string } ] }
Every item needs a link. Use an empty items array when there is nothing new.`
}
