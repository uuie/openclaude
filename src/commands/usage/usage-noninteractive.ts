// src/commands/usage/usage-noninteractive.ts
//
// Non-interactive text version of `/usage` for `openclaude -p "/usage"`.
// Fetches AtomCode usage data when the active provider is the AtomCode gateway,
// or returns a summary of session-wide token/cost totals otherwise.

import {
  getActiveProviderProfile,
} from '../../utils/providerProfiles.js'
import {
  getAPIProvider,
} from '../../utils/model/providers.js'
import {
  getUsageDescriptor,
  resolveActiveUsageId,
} from './index.js'
import {
  fetchAtomCodeUsage,
} from '../../services/api/atomcodeUsage.js'
import {
  getTotalInputTokens,
  getTotalOutputTokens,
  getTotalCacheReadInputTokens,
  getTotalCacheCreationInputTokens,
  getTotalCostUSD,
} from '../../bootstrap/state.js'
import {
  formatTokens,
} from '../../utils/format.js'

export async function formatUsageText(): Promise<string> {
  const provider = getAPIProvider()
  const activeProfile = getActiveProviderProfile()
  const usageDescriptor = getUsageDescriptor(
    resolveActiveUsageId(process.env, {
      activeProfileProvider: activeProfile?.provider,
      providerCategory: provider,
    }),
  )

  if (usageDescriptor.resolvedId === 'atomcode' && usageDescriptor.supported) {
    return formatAtomCodeUsage()
  }

  // Fallback: show session token/cost totals
  return formatSessionUsage()
}

async function formatAtomCodeUsage(): Promise<string> {
  try {
    const data = await fetchAtomCodeUsage()
    const lines: string[] = []

    if (data.plan) {
      const p = data.plan
      const days =
        p.remainingDays > 0
          ? `${p.remainingDays} / ${p.totalDays} days remaining`
          : 'Expired'
      lines.push(`Plan: ${p.planName} · ${days}`)
    }

    if (data.usageWindow) {
      const w = data.usageWindow
      const percent = Math.floor(w.usagePercent)
      const tokenCount = `${formatTokens(w.windowTokensUsed)} / ${formatTokens(w.windowTokenLimit)}`
      const windowLabel =
        w.windowHours >= 24
          ? `${w.windowHours / 24}d rolling window`
          : `${w.windowHours}h rolling window`
      lines.push(
        `${windowLabel} · ${percent}% used (${tokenCount})` +
          (w.resetAtDisplay ? ` · resets at ${w.resetAtDisplay}` : ''),
      )
    }

    if (data.windowQuotaExhausted) {
      lines.push(
        `Quota exhausted${data.windowQuotaHint ? `: ${data.windowQuotaHint}` : ''}`,
      )
    }

    if (!data.plan && !data.usageWindow) {
      lines.push('No active CodingPlan found for this account.')
    }

    return lines.join('\n')
  } catch (err) {
    return `AtomCode usage unavailable: ${err instanceof Error ? err.message : String(err)}`
  }
}

function formatSessionUsage(): string {
  const lines: string[] = []

  lines.push(
    `Total input tokens:  ${formatTokens(getTotalInputTokens())}`,
  )
  lines.push(
    `Total output tokens: ${formatTokens(getTotalOutputTokens())}`,
  )
  lines.push(
    `Cache read tokens:   ${formatTokens(getTotalCacheReadInputTokens())}`,
  )
  lines.push(
    `Cache creation:      ${formatTokens(getTotalCacheCreationInputTokens())}`,
  )

  const cost = getTotalCostUSD()
  if (cost > 0) {
    lines.push(`Total cost:          $${cost.toFixed(4)}`)
  }

  return lines.join('\n')
}

import type { LocalCommandCall } from '../../types/command.js'

export const call: LocalCommandCall = async () => {
  return { type: 'text', value: await formatUsageText() }
}
