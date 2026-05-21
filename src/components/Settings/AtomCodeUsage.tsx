import * as React from 'react'
import { useEffect, useState } from 'react'

import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { Box, Text } from '../../ink.js'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import {
  fetchAtomCodeUsage,
  type AtomCodeUsageData,
} from '../../services/api/atomcodeUsage.js'
import { formatResetText } from '../../utils/format.js'
import { logError } from '../../utils/log.js'
import { ConfigurableShortcutHint } from '../ConfigurableShortcutHint.js'
import { Byline } from '../design-system/Byline.js'
import { ProgressBar } from '../design-system/ProgressBar.js'

const RESET_COUNTDOWN_REFRESH_MS = 30_000

function formatTokens(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`
  }
  if (value >= 1_000) {
    const k = value / 1_000
    return `${Number.isInteger(k) ? k : k.toFixed(1)}K`
  }
  return String(value)
}

export function AtomCodeUsage(): React.ReactNode {
  const [data, setData] = useState<AtomCodeUsageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const { columns } = useTerminalSize()
  const availableWidth = columns - 2
  const maxWidth = Math.min(availableWidth, 80)

  const loadUsage = React.useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      setData(await fetchAtomCodeUsage())
    } catch (err) {
      logError(err as Error)
      setError(
        err instanceof Error ? err.message : 'Failed to load AtomCode usage',
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUsage()
  }, [loadUsage])

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now())
    }, RESET_COUNTDOWN_REFRESH_MS)

    return () => clearInterval(interval)
  }, [])

  useKeybinding(
    'settings:retry',
    () => {
      void loadUsage()
    },
    {
      context: 'Settings',
      isActive: !!error && !isLoading,
    },
  )

  if (error) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="error">Error: {error}</Text>
        <Text dimColor>
          <Byline>
            <ConfigurableShortcutHint
              action="settings:retry"
              context="Settings"
              fallback="r"
              description="retry"
            />
            <ConfigurableShortcutHint
              action="confirm:no"
              context="Settings"
              fallback="Esc"
              description="cancel"
            />
          </Byline>
        </Text>
      </Box>
    )
  }

  if (!data) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>Loading AtomCode usage data…</Text>
        <Text dimColor>
          <ConfigurableShortcutHint
            action="confirm:no"
            context="Settings"
            fallback="Esc"
            description="cancel"
          />
        </Text>
      </Box>
    )
  }

  const usageWindow = data.usageWindow
  const plan = data.plan

  return (
    <Box flexDirection="column" gap={1} width="100%">
      {plan ? (
        <Text>
          <Text bold>Plan: {plan.planName}</Text>
          <Text dimColor>
            {' '}
            ·{' '}
            {plan.remainingDays > 0
              ? `${plan.remainingDays} / ${plan.totalDays} days remaining`
              : 'Expired'}
          </Text>
        </Text>
      ) : null}

      {usageWindow ? (
        <UsageWindowView
          window={usageWindow}
          maxWidth={maxWidth}
          nowMs={nowMs}
        />
      ) : plan ? (
        <Text dimColor>No usage data available for this plan.</Text>
      ) : null}

      {data.windowQuotaExhausted ? (
        <Text color="error">
          Window quota exhausted
          {data.windowQuotaHint ? ` · ${data.windowQuotaHint}` : ''}
        </Text>
      ) : null}

      {!plan && !usageWindow && !data.windowQuotaExhausted ? (
        <Text dimColor>No active CodingPlan found for this account.</Text>
      ) : null}

      <Text dimColor>
        <ConfigurableShortcutHint
          action="confirm:no"
          context="Settings"
          fallback="Esc"
          description="cancel"
        />
      </Text>
    </Box>
  )
}

type UsageWindowViewProps = {
  window: AtomCodeUsageData['usageWindow']
  maxWidth: number
  nowMs: number
}

function UsageWindowView({
  window,
  maxWidth,
  nowMs,
}: UsageWindowViewProps): React.ReactNode {
  if (!window) return null

  const percent = Math.max(0, Math.min(100, Math.floor(window.usagePercent)))
  const usedText = `${percent}% used`

  // Format tokens for the subtext
  const tokenText = `${formatTokens(window.windowTokensUsed)} / ${formatTokens(window.windowTokenLimit)} tokens`

  // Build reset countdown text
  const windowLabel =
    window.windowHours >= 24
      ? `${window.windowHours / 24}d rolling window`
      : `${window.windowHours}h rolling window`

  return (
    <Box flexDirection="column">
      <Text>
        <Text bold>{windowLabel}</Text>
        {window.resetAtDisplay ? (
          <Text dimColor>
            {' '}
            · resets at {window.resetAtDisplay}
          </Text>
        ) : null}
      </Text>
      <Box flexDirection="row" gap={1}>
        <ProgressBar
          ratio={percent / 100}
          width={Math.min(50, Math.max(1, maxWidth))}
          fillColor="rate_limit_fill"
          emptyColor="rate_limit_empty"
        />
        <Text dimColor>
          {usedText}
          {tokenText ? ` · ${tokenText}` : ''}
        </Text>
      </Box>
    </Box>
  )
}
