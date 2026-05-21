// src/services/api/atomcodeUsage.ts
//
// AtomCode (GitCode) CodingPlan usage API client.
// Calls GET /api/v5/coding-plan/status-v2 on api.gitcode.com using the
// OPENAI_API_KEY credential.
//
// API shape mirrors the atomcode Rust client at:
//   github.com/Gitlabw/atomcode/crates/atomcode-core/src/coding_plan/types.rs

const API_BASE = 'https://api.gitcode.com/api/v5'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AtomCodePlanInfo = {
  planName: string
  expiresAt: string
  remainingDays: number
  totalDays: number
}

export type AtomCodeUsageWindow = {
  windowTokenLimit: number
  windowTokensUsed: number
  usagePercent: number
  windowHours: number
  resetAtDisplay: string
  secondsUntilReset: number
}

export type AtomCodeUsageData = {
  plan: AtomCodePlanInfo | null
  usageWindow: AtomCodeUsageWindow | null
  windowQuotaExhausted: boolean
  windowQuotaHint: string | null
}

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

type RawStatusResponse = {
  codingplan_free?: {
    plan_name?: string
    expires_at?: string
    remaining_days?: number
    total_days?: number
    [key: string]: unknown
  } | null
  current_usage?: {
    window_token_limit?: number
    window_tokens_used?: number
    usage_percent?: number
    window_hours?: number
    reset_at?: string
    reset_at_display?: string
    seconds_until_reset?: number
    [key: string]: unknown
  } | null
  window_quota_exhausted?: boolean
  window_quota_hint?: string | null
  [key: string]: unknown
}

function normalizePlanInfo(
  raw: RawStatusResponse['codingplan_free'],
): AtomCodePlanInfo | null {
  if (!raw) return null
  return {
    planName: raw.plan_name ?? 'CodingPlan',
    expiresAt: raw.expires_at ?? '',
    remainingDays: raw.remaining_days ?? 0,
    totalDays: raw.total_days ?? 0,
  }
}

function normalizeUsageWindow(
  raw: RawStatusResponse['current_usage'],
): AtomCodeUsageWindow | null {
  if (!raw) return null
  return {
    windowTokenLimit: raw.window_token_limit ?? 0,
    windowTokensUsed: raw.window_tokens_used ?? 0,
    usagePercent: raw.usage_percent ?? 0,
    windowHours: raw.window_hours ?? 0,
    resetAtDisplay: raw.reset_at_display ?? '',
    secondsUntilReset: raw.seconds_until_reset ?? 0,
  }
}

export function normalizeAtomCodeUsagePayload(
  raw: unknown,
): AtomCodeUsageData {
  const body = (raw ?? {}) as RawStatusResponse

  return {
    plan: normalizePlanInfo(body.codingplan_free),
    usageWindow: normalizeUsageWindow(body.current_usage),
    windowQuotaExhausted: body.window_quota_exhausted ?? false,
    windowQuotaHint: body.window_quota_hint ?? null,
  }
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Fetch AtomCode CodingPlan usage from api.gitcode.com.
 *
 * Requires OPENAI_API_KEY to be set. Sends the key as a Bearer token.
 * Throws on network errors, non-2xx responses, or missing API key.
 */
export async function fetchAtomCodeUsage(): Promise<AtomCodeUsageData> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error(
      'AtomCode API key is required. Set the OPENAI_API_KEY environment variable.',
    )
  }

  const url = `${API_BASE}/coding-plan/status-v2`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'openclaude/1.0',
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      throw new Error(
        `AtomCode usage API returned ${response.status}: ${errorBody || 'unknown error'}`,
      )
    }

    const data: unknown = await response.json()
    return normalizeAtomCodeUsagePayload(data)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('AtomCode usage API request timed out after 5 seconds')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
