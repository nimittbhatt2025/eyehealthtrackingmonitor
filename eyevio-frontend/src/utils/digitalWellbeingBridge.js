/**
 * Digital Wellbeing bridge
 *
 * Browsers cannot read iOS Screen Time or Android Digital Wellbeing.
 * When EyeVio runs inside a Capacitor (or RN WebView) shell that registers
 * the EyevioWellbeing plugin, this module requests permission and pulls
 * daily aggregates, then POSTs them to /api/wellbeing/sync.
 */

import { wellbeingAPI } from '../services/api'

const PLUGIN_NAME = 'EyevioWellbeing'

function getCapacitor() {
  return typeof window !== 'undefined' ? window.Capacitor : null
}

export function isNativeShell() {
  const cap = getCapacitor()
  return Boolean(cap?.isNativePlatform?.())
}

export function getNativePlatform() {
  const cap = getCapacitor()
  if (!cap?.getPlatform) return 'web'
  return cap.getPlatform() // 'ios' | 'android' | 'web'
}

async function callPlugin(method, options = {}) {
  const cap = getCapacitor()
  if (!cap?.Plugins?.[PLUGIN_NAME] && !cap?.registerPlugin) {
    throw new Error('Native wellbeing plugin is not available in this build')
  }

  // Capacitor 3+ registerPlugin pattern
  let plugin = cap.Plugins?.[PLUGIN_NAME]
  if (!plugin && cap.registerPlugin) {
    plugin = cap.registerPlugin(PLUGIN_NAME)
  }
  if (!plugin?.[method]) {
    throw new Error(`Wellbeing plugin missing method: ${method}`)
  }
  return plugin[method](options)
}

export async function getWellbeingCapability() {
  if (!isNativeShell()) {
    return {
      available: false,
      platform: 'web',
      reason: 'OS screen-time APIs require the EyeVio native app shell (Capacitor).',
    }
  }

  try {
    const info = await callPlugin('getCapability')
    return { available: true, platform: getNativePlatform(), ...info }
  } catch (error) {
    return {
      available: false,
      platform: getNativePlatform(),
      reason: error.message,
    }
  }
}

export async function requestWellbeingPermission() {
  return callPlugin('requestPermission')
}

export async function fetchScreenTimeRange({ startDay, endDay } = {}) {
  // Days as YYYY-MM-DD inclusive
  const end = endDay || new Date().toISOString().slice(0, 10)
  const start =
    startDay ||
    new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const result = await callPlugin('getScreenTime', { startDay: start, endDay: end })
  return result?.days || result?.entries || []
}

function deviceIdFallback() {
  const key = 'eyevio_wellbeing_device_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = `web-${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}`
    localStorage.setItem(key, id)
  }
  return id
}

/**
 * Connect device + pull last N days + sync to API (auto-fills lifestyle logs).
 */
export async function connectAndSyncWellbeing({ daysBack = 14 } = {}) {
  const platform = getNativePlatform()
  if (platform === 'web') {
    throw new Error(
      'Auto-pull is not available in the browser. Use the EyeVio iOS/Android app, or import a JSON export below.'
    )
  }

  const permission = await requestWellbeingPermission()
  if (!permission?.granted) {
    throw new Error(permission?.message || 'Screen-time permission was not granted')
  }

  const deviceId = permission.deviceId || deviceIdFallback()
  const source =
    platform === 'ios' ? 'ios_device_activity' : 'android_usage_stats'

  const { data: connRes } = await wellbeingAPI.connect({
    platform,
    source,
    device_id: deviceId,
    device_name: permission.deviceName || `${platform} device`,
    permission_granted: true,
    auto_sync_enabled: true,
    sync_lifestyle: true,
    status: 'connected',
    meta: {
      plugin: PLUGIN_NAME,
      osVersion: permission.osVersion,
    },
  })

  const end = new Date()
  const start = new Date(Date.now() - (daysBack - 1) * 24 * 60 * 60 * 1000)
  const days = await fetchScreenTimeRange({
    startDay: start.toISOString().slice(0, 10),
    endDay: end.toISOString().slice(0, 10),
  })

  if (!days.length) {
    return {
      connection: connRes.connection,
      sync: { days_upserted: 0, lifestyle_updated: 0, warning: 'No screen-time rows returned yet' },
    }
  }

  const { data: syncRes } = await wellbeingAPI.sync({
    connection_id: connRes.connection.id,
    device_id: deviceId,
    apply_lifestyle: true,
    days: days.map((d) => ({
      ...d,
      source: d.source || source,
    })),
  })

  return { connection: connRes.connection, sync: syncRes }
}

/**
 * Background refresh when app resumes (no-op on web).
 */
export async function quietSyncIfConnected(status) {
  if (!isNativeShell()) return null
  const connected = (status?.connections || []).find(
    (c) => c.status === 'connected' && c.auto_sync_enabled
  )
  if (!connected) return null

  try {
    const end = new Date()
    const start = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
    const days = await fetchScreenTimeRange({
      startDay: start.toISOString().slice(0, 10),
      endDay: end.toISOString().slice(0, 10),
    })
    if (!days.length) return null
    const { data } = await wellbeingAPI.sync({
      connection_id: connected.id,
      device_id: connected.device_id,
      apply_lifestyle: true,
      days,
    })
    return data
  } catch {
    return null
  }
}

export function parseScreenTimeImportFile(text) {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('File is empty')

  // JSON array or { days: [...] }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed)
    const days = Array.isArray(parsed) ? parsed : parsed.days || parsed.entries
    if (!Array.isArray(days)) throw new Error('JSON must be an array of days or { days: [] }')
    return days.map(normalizeImportDay)
  }

  // Simple CSV: day,total_screen_hours[,social,productivity,entertainment,other]
  const lines = trimmed.split(/\r?\n/).filter(Boolean)
  const header = lines[0].toLowerCase()
  const start = header.includes('day') || header.includes('date') ? 1 : 0
  const days = []
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim())
    if (cols.length < 2) continue
    days.push(
      normalizeImportDay({
        day: cols[0],
        total_screen_hours: Number(cols[1]),
        category_breakdown:
          cols.length >= 6
            ? {
                social: Number(cols[2]) || 0,
                productivity: Number(cols[3]) || 0,
                entertainment: Number(cols[4]) || 0,
                other: Number(cols[5]) || 0,
              }
            : undefined,
      })
    )
  }
  if (!days.length) throw new Error('No valid rows found in CSV')
  return days
}

function normalizeImportDay(d) {
  const day = d.day || d.date
  let hours = d.total_screen_hours
  if (hours == null && d.total_screen_minutes != null) hours = Number(d.total_screen_minutes) / 60
  if (hours == null && d.total_screen_ms != null) hours = Number(d.total_screen_ms) / 3_600_000
  return {
    day,
    total_screen_hours: Number(hours),
    pickup_count: d.pickup_count,
    category_breakdown: d.category_breakdown || d.categories,
    top_apps: d.top_apps,
    source: d.source || 'json_import',
  }
}
