import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { wellbeingAPI } from '../services/api'
import {
  connectAndSyncWellbeing,
  getNativePlatform,
  getWellbeingCapability,
  isNativeShell,
  parseScreenTimeImportFile,
  quietSyncIfConnected,
} from '../utils/digitalWellbeingBridge'

function DigitalWellbeing() {
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [status, setStatus] = useState(null)
  const [capability, setCapability] = useState(null)
  const [platform] = useState(getNativePlatform())

  const load = async () => {
    setLoading(true)
    try {
      const [{ data }, cap] = await Promise.all([
        wellbeingAPI.getStatus(),
        getWellbeingCapability(),
      ])
      setStatus(data)
      setCapability(cap)
      // Quiet refresh when already connected inside native shell
      await quietSyncIfConnected(data)
      const refreshed = await wellbeingAPI.getStatus()
      setStatus(refreshed.data)
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load wellbeing status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleConnect = async () => {
    setSyncing(true)
    try {
      const result = await connectAndSyncWellbeing({ daysBack: 14 })
      toast.success(
        `Synced ${result.sync?.days_upserted ?? 0} days · lifestyle updated ${result.sync?.lifestyle_updated ?? 0}`
      )
      if (result.sync?.warning) toast(result.sync.warning)
      await load()
    } catch (error) {
      toast.error(error.message || 'Could not connect')
    } finally {
      setSyncing(false)
    }
  }

  const handleImport = async (file) => {
    if (!file) return
    setSyncing(true)
    try {
      const text = await file.text()
      const days = parseScreenTimeImportFile(text)
      const { data } = await wellbeingAPI.importDays({
        days,
        apply_lifestyle: true,
        device_name: file.name,
      })
      toast.success(
        `Imported ${data.days_upserted} days · lifestyle updated ${data.lifestyle_updated}`
      )
      await load()
    } catch (error) {
      toast.error(error.message || error.response?.data?.error || 'Import failed')
    } finally {
      setSyncing(false)
    }
  }

  const handleToggle = async (connection, field) => {
    try {
      await wellbeingAPI.updateConnection(connection.id, {
        [field]: !connection[field],
      })
      await load()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Update failed')
    }
  }

  const handleDisconnect = async (id) => {
    try {
      await wellbeingAPI.disconnect(id)
      toast.success('Disconnected')
      await load()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Disconnect failed')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent-600" />
      </div>
    )
  }

  const chartData = [...(status?.recent_days || [])]
    .reverse()
    .map((d) => ({
      day: d.day?.slice(5),
      hours: d.total_screen_hours,
    }))

  const connected = status?.has_connection

  return (
    <div className="space-y-8">
      <div className="animate-fade-in-up">
        <p className="text-sm font-medium text-accent-700 mb-1">Compliance-first logging</p>
        <h1 className="page-title">Digital Wellbeing</h1>
        <p className="page-subtitle max-w-2xl">
          Auto-pull screen time into EyeVio so lifestyle and myopia insights stay accurate —
          without relying on people to remember nightly logging.
        </p>
      </div>

      <div className="card p-5 border-l-4 border-l-amber-500 bg-amber-50/40">
        <p className="text-sm text-amber-950">
          <strong>Platform reality:</strong> iOS and Android do not let websites read Screen Time
          or Digital Wellbeing. Auto-pull works in the EyeVio native shell (Capacitor) via{' '}
          <code className="text-xs bg-white/80 px-1 rounded">UsageStatsManager</code> (Android) and{' '}
          <code className="text-xs bg-white/80 px-1 rounded">DeviceActivity</code> (iOS). In the
          browser you can still import JSON/CSV, which also auto-fills lifestyle logs.
        </p>
        <p className="text-xs text-amber-900/80 mt-2">
          Detected environment: <strong>{platform}</strong>
          {isNativeShell() ? ' · native shell present' : ' · web browser'}
          {capability?.reason ? ` · ${capability.reason}` : ''}
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-6">
          <p className="text-sm text-gray-500 mb-1">Connection</p>
          <p className="text-2xl font-bold text-gray-900">
            {connected ? 'Connected' : 'Not connected'}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            {(status?.connections || []).filter((c) => c.status === 'connected').length} active
            device(s)
          </p>
        </div>
        <div className="card p-6">
          <p className="text-sm text-gray-500 mb-1">Latest day</p>
          <p className="text-2xl font-bold text-gray-900">
            {status?.recent_days?.[0]
              ? `${Number(status.recent_days[0].total_screen_hours).toFixed(1)} h`
              : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            {status?.recent_days?.[0]?.day || 'No synced days yet'}
          </p>
        </div>
        <div className="card p-6">
          <p className="text-sm text-gray-500 mb-1">Lifestyle auto-fill</p>
          <p className="text-2xl font-bold text-gray-900">On sync</p>
          <p className="text-xs text-gray-500 mt-2">
            Writes <code>screen_time_hours</code> on each synced day
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn-primary min-h-[44px]"
          disabled={syncing || !isNativeShell()}
          onClick={handleConnect}
          title={!isNativeShell() ? 'Requires native EyeVio app' : undefined}
        >
          {syncing ? 'Syncing…' : 'Connect & sync from device'}
        </button>
        <label className="btn-ghost min-h-[44px] inline-flex items-center cursor-pointer">
          <input
            type="file"
            accept=".json,.csv,application/json,text/csv"
            className="hidden"
            onChange={(e) => handleImport(e.target.files?.[0])}
          />
          Import JSON / CSV
        </label>
        <Link to="/lifestyle" className="btn-ghost min-h-[44px] inline-flex items-center">
          View lifestyle logs
        </Link>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-6 space-y-4">
          <h2 className="section-title">How to enable auto-pull</h2>
          <ol className="space-y-3 text-sm text-gray-700 list-decimal pl-5">
            <li>
              <strong>Android:</strong> Install the EyeVio app build with the Usage Stats plugin →
              grant <em>Usage access</em> → tap Connect. Totals come from the same APIs Digital
              Wellbeing uses.
            </li>
            <li>
              <strong>iOS:</strong> Apple blocks reading the Screen Time settings screen. The native
              build uses FamilyControls / DeviceActivity (entitlement) after you pick apps to
              monitor — then syncs daily totals here.
            </li>
            <li>
              <strong>Browser:</strong> Export or paste daily hours as JSON/CSV. EyeVio still
              auto-fills lifestyle so myopia & fatigue correlations keep working.
            </li>
          </ol>
          <p className="text-xs text-gray-500">
            Plugin sources live in <code>mobile-bridge/</code> in the repo.
          </p>
        </div>

        <div className="card p-6">
          <h2 className="section-title mb-4">Recent synced screen time</h2>
          {chartData.length < 1 ? (
            <p className="text-sm text-gray-500 py-10 text-center">No synced days yet.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} unit="h" />
                  <Tooltip />
                  <Line type="monotone" dataKey="hours" name="Screen hours" stroke="#0f766e" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {(status?.connections || []).length > 0 && (
        <div className="card p-6 overflow-x-auto">
          <h2 className="section-title mb-4">Devices</h2>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-4">Device</th>
                <th className="py-2 pr-4">Platform</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Auto-sync</th>
                <th className="py-2 pr-4">Fill lifestyle</th>
                <th className="py-2 pr-4">Last sync</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {status.connections.map((c) => (
                <tr key={c.id} className="border-b border-gray-50">
                  <td className="py-2.5 pr-4 font-medium">{c.device_name || c.device_id}</td>
                  <td className="py-2.5 pr-4 capitalize">{c.platform}</td>
                  <td className="py-2.5 pr-4">{c.status}</td>
                  <td className="py-2.5 pr-4">
                    <button
                      type="button"
                      className="text-accent-700 font-semibold"
                      onClick={() => handleToggle(c, 'auto_sync_enabled')}
                    >
                      {c.auto_sync_enabled ? 'On' : 'Off'}
                    </button>
                  </td>
                  <td className="py-2.5 pr-4">
                    <button
                      type="button"
                      className="text-accent-700 font-semibold"
                      onClick={() => handleToggle(c, 'sync_lifestyle')}
                    >
                      {c.sync_lifestyle ? 'On' : 'Off'}
                    </button>
                  </td>
                  <td className="py-2.5 pr-4 text-gray-600">
                    {c.last_sync_at ? new Date(c.last_sync_at).toLocaleString() : '—'}
                  </td>
                  <td className="py-2.5">
                    <button
                      type="button"
                      className="text-red-600 font-semibold"
                      onClick={() => handleDisconnect(c.id)}
                    >
                      Disconnect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card p-6">
        <h2 className="section-title mb-2">Import format</h2>
        <pre className="text-xs bg-gray-50 rounded-xl p-4 overflow-x-auto text-gray-700">{`[
  { "day": "2026-08-14", "total_screen_hours": 4.8, "category_breakdown": { "social": 1.2, "productivity": 2.1 } },
  { "day": "2026-08-15", "total_screen_hours": 6.1 }
]`}</pre>
      </div>
    </div>
  )
}

export default DigitalWellbeing
