import { useState, useEffect, useMemo } from 'react'
import { trendAPI, lifestyleAPI } from '../services/api'
import { toast } from 'react-hot-toast'
import {
  ComposedChart,
  Line,
  Area,
  Scatter,
  ScatterChart,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

const VERDICT = {
  worsening: { label: 'Reliable worsening', cls: 'badge-warning' },
  improving: { label: 'Reliable improvement', cls: 'badge-success' },
  no_reliable_trend: { label: 'No reliable trend', cls: 'badge-brand' },
}

const fmtDate = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const fmtVal = (v) => (v == null ? '—' : Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2))

function buildChartData(series) {
  const rows = series.points.map((p) => ({ t: new Date(p.date).getTime(), value: p.value }))
  const fc = series.forecast
  if (fc?.status === 'ok') {
    fc.fitted.forEach((p) => rows.push({ t: new Date(p.date).getTime(), fit: p.fit }))
    fc.forecast.forEach((p) =>
      rows.push({ t: new Date(p.date).getTime(), fit: p.fit, band: [p.lower, p.upper] })
    )
  }
  return rows.sort((a, b) => a.t - b.t)
}

function PerTestTrend({ test }) {
  const [seriesIdx, setSeriesIdx] = useState(0)
  useEffect(() => setSeriesIdx(0), [test?.test_type])
  const series = test.series[seriesIdx] || test.series[0]
  const data = useMemo(() => (series ? buildChartData(series) : []), [series])
  if (!series) return null
  const fc = series.forecast
  const upIsWorse = test.worse_direction === 'up'
  const verdict = fc?.status === 'ok' ? VERDICT[fc.verdict] : null
  const lastBand = fc?.status === 'ok' ? fc.forecast[fc.forecast.length - 1] : null

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-2">
          {test.series.length > 1 &&
            test.series.map((s, i) => (
              <button
                key={s.name}
                type="button"
                onClick={() => setSeriesIdx(i)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  i === seriesIdx ? 'bg-accent-600 text-white border-accent-600' : 'border-gray-200 text-gray-600'
                }`}
              >
                {s.name}
              </button>
            ))}
        </div>
        {verdict && <span className={`badge ${verdict.cls}`}>{verdict.label}</span>}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={fmtDate} stroke="#6b7280" style={{ fontSize: '12px' }} />
          <YAxis
            reversed={upIsWorse}
            domain={['auto', 'auto']}
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
            tickFormatter={fmtVal}
            label={{ value: `${test.unit} (up = better)`, angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#6b7280' } }}
          />
          <Tooltip
            labelFormatter={fmtDate}
            formatter={(v, name) => [Array.isArray(v) ? `${fmtVal(v[0])} – ${fmtVal(v[1])}` : fmtVal(v), name]}
            contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
          />
          <Legend />
          <Area dataKey="band" name="95% prediction interval" stroke="none" fill="#7dcab9" fillOpacity={0.3} connectNulls isAnimationActive={false} />
          <Line dataKey="fit" name="Robust trend (Theil–Sen)" stroke="#267563" strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
          <Line dataKey="value" name={series.name} stroke="none" dot={{ fill: '#267563', r: 4 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-4 text-sm text-gray-600 space-y-1">
        {fc?.status === 'ok' ? (
          <>
            <p>
              Trend: <strong>{fc.slope_per_30d >= 0 ? '+' : ''}{fmtVal(fc.slope_per_30d)} {test.unit} per 30 days</strong>{' '}
              (95% CI {fmtVal(fc.slope_per_30d_ci95[0])} to {fmtVal(fc.slope_per_30d_ci95[1])}) from {fc.n_sessions} sessions over{' '}
              {Math.round(fc.span_days)} days.
            </p>
            {lastBand && (
              <p>
                In {lastBand.days_ahead} days the next result is expected between{' '}
                <strong>{fmtVal(lastBand.lower)}</strong> and <strong>{fmtVal(lastBand.upper)}</strong> {test.unit}. The forecast
                stops at half the observed span.
              </p>
            )}
            <p className="text-xs text-gray-500">
              Called a trend only if the slope&apos;s 95% interval excludes zero and the projected change reaches{' '}
              {test.mcid} {test.unit}.
              {test.provisional_repeatability && ' Retest variation for this test is provisional until you have more sessions.'}
            </p>
          </>
        ) : (
          <p>
            {fc?.n_sessions ?? series.points.length} of {fc?.required_sessions ?? 6} sessions, spanning{' '}
            {Math.round(fc?.span_days ?? 0)} of {fc?.required_span_days ?? 28} days, are needed before a trend and forecast are shown.
          </p>
        )}
      </div>
    </div>
  )
}

function Trends() {
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('90')
  const [trendData, setTrendData] = useState(null)
  const [prediction, setPrediction] = useState(null)
  const [lifestyleData, setLifestyleData] = useState([])
  const [selectedType, setSelectedType] = useState(null)

  useEffect(() => {
    loadData()
  }, [period])

  const loadData = async () => {
    setLoading(true)
    try {
      const [trendResponse, predictionResponse] = await Promise.all([
        trendAPI.getTrend({ days: parseInt(period), period: 'daily' }),
        trendAPI.getPrediction(),
      ])
      setTrendData(trendResponse.data)
      setPrediction(predictionResponse.data)
      try {
        const lifestyleResponse = await lifestyleAPI.getTrends({ days: parseInt(period) })
        setLifestyleData(lifestyleResponse.data.trends || [])
      } catch {
        setLifestyleData([])
      }
    } catch (error) {
      console.error('Failed to load trends:', error)
      toast.error('Failed to load trend data')
    } finally {
      setLoading(false)
    }
  }

  const tests = prediction?.tests || []
  const selected = tests.find((t) => t.test_type === selectedType) || tests[0]

  const correlation = useMemo(() => {
    if (!selected || !lifestyleData.length) return []
    const series = selected.series[0]
    return series.points
      .map((p) => {
        const d = new Date(p.date)
        const match = lifestyleData.find((l) => Math.abs(d - new Date(l.log_date)) / 86400000 <= 1)
        return match ? { screen_time: match.screen_time, sleep_hours: match.sleep_hours, value: p.value } : null
      })
      .filter(Boolean)
  }, [selected, lifestyleData])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-accent-100 border-t-accent-600"></div>
      </div>
    )
  }

  const hasData = tests.length > 0

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Trends & Predictions</h1>
          <p className="page-subtitle">Each test tracked in its own units, with honest uncertainty</p>
        </div>
        <div className="flex space-x-2 bg-white rounded-full p-1 border border-gray-200">
          {['30', '90', '365'].map((days) => (
            <button
              key={days}
              onClick={() => setPeriod(days)}
              className={`min-h-[44px] px-5 py-2 rounded-full font-medium text-sm transition-colors ${
                period === days ? 'bg-accent-600 text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {days === '365' ? '1 Year' : `${days} Days`}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="card p-12 text-center">
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Trend Data Yet</h3>
          <p className="text-gray-600 mb-6">Complete vision tests to see how each one changes over time</p>
        </div>
      ) : (
        <>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Tests Completed</h3>
              <div className="text-3xl font-bold text-gray-900 mb-1">{trendData?.statistics?.vision?.test_count ?? 0}</div>
              <p className="text-sm text-gray-500">Last {period} days</p>
            </div>
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Tests Tracked</h3>
              <div className="text-3xl font-bold text-gray-900 mb-1">{tests.length}</div>
              <p className="text-sm text-gray-500">
                {tests.filter((t) => t.series.some((s) => s.forecast?.status === 'ok')).length} with enough data for a trend
              </p>
            </div>
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Fatigue Status</h3>
              {trendData?.statistics?.fatigue?.average != null ? (
                <>
                  <div className="text-3xl font-bold text-gray-900 mb-1">{trendData.statistics.fatigue.average.toFixed(0)}</div>
                  <p className="text-sm text-gray-500">Average fatigue index</p>
                </>
              ) : (
                <p className="text-sm text-gray-500">Complete webcam analysis</p>
              )}
            </div>
          </div>

          <div className="card p-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <div>
                <h2 className="section-title">Per-test trend</h2>
                <p className="text-gray-500 text-sm mt-1">{prediction?.note}</p>
              </div>
              <select
                value={selected?.test_type || ''}
                onChange={(e) => setSelectedType(e.target.value)}
                className="input-field max-w-xs"
                aria-label="Choose a test"
              >
                {tests.map((t) => (
                  <option key={t.test_type} value={t.test_type}>
                    {t.label} ({t.n_sessions})
                  </option>
                ))}
              </select>
            </div>
            {selected && <PerTestTrend test={selected} />}
          </div>

          {correlation.length >= 3 && (
            <div className="card p-8">
              <h2 className="section-title mb-2">Lifestyle and {selected.label}</h2>
              <p className="text-gray-500 text-sm mb-6">
                Sessions matched to a lifestyle log within a day. A handful of points cannot show cause and effect.
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {[
                  { key: 'screen_time', label: 'Screen time (h)', color: '#f59e0b' },
                  { key: 'sleep_hours', label: 'Sleep (h)', color: '#7dcab9' },
                ].map((f) => (
                  <ResponsiveContainer key={f.key} width="100%" height={240}>
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey={f.key} name={f.label} tick={{ fontSize: 11 }} stroke="#6b7280" />
                      <YAxis dataKey="value" name={selected.unit} reversed={selected.worse_direction === 'up'} tick={{ fontSize: 11 }} stroke="#6b7280" />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                      <Scatter data={correlation.filter((c) => c[f.key] != null)} fill={f.color} name={f.label} />
                    </ScatterChart>
                  </ResponsiveContainer>
                ))}
              </div>
            </div>
          )}

          <div className="card p-8">
            <h2 className="section-title mb-6">Activity</h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trendData?.trend_data || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: '12px' }} />
                <YAxis allowDecimals={false} stroke="#6b7280" style={{ fontSize: '12px' }} />
                <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
                <Legend />
                <Bar dataKey="vision_test_count" fill="#7dcab9" name="Vision tests" />
                <Bar dataKey="fatigue_metric_count" fill="#f59e0b" name="Fatigue checks" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}

export default Trends
