import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Bar,
  ComposedChart,
  Area,
} from 'recharts'
import { myopiaAPI } from '../services/api'
import SamdDisclaimer from '../components/SamdDisclaimer'

const emptyRx = {
  measured_at: new Date().toISOString().slice(0, 10),
  source: 'exam',
  od: { sph: '', cyl: '', axis: '' },
  os: { sph: '', cyl: '', axis: '' },
  notes: '',
}

const emptySubject = {
  display_name: '',
  relationship: 'child',
  date_of_birth: '',
  sex: '',
  myopia_onset_age: '',
  parental_myopia: 'unknown',
  treatment: 'none',
  school_grade: '',
  target_outdoor_hours: 2,
  target_screen_hours: 2,
}

function bandStyles(band) {
  if (band === 'high') return 'bg-red-50 text-red-800 border-red-200'
  if (band === 'moderate') return 'bg-amber-50 text-amber-900 border-amber-200'
  return 'bg-emerald-50 text-emerald-900 border-emerald-200'
}

function MyopiaProgression() {
  const [subjects, setSubjects] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [showRxForm, setShowRxForm] = useState(false)
  const [subjectForm, setSubjectForm] = useState(emptySubject)
  const [rxForm, setRxForm] = useState(emptyRx)
  const [lifestyleDays, setLifestyleDays] = useState(30)

  useEffect(() => {
    loadSubjects()
  }, [])

  useEffect(() => {
    if (selectedId) loadDashboard(selectedId)
  }, [selectedId, lifestyleDays])

  const loadSubjects = async () => {
    setLoading(true)
    try {
      const { data } = await myopiaAPI.listSubjects()
      const list = data.subjects || []
      setSubjects(list)
      if (list.length === 0) {
        setShowSetup(true)
        setSelectedId(null)
        setDashboard(null)
      } else {
        setSelectedId((prev) => prev || list[0].id)
        setShowSetup(false)
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load myopia profiles')
    } finally {
      setLoading(false)
    }
  }

  const loadDashboard = async (id) => {
    try {
      const { data } = await myopiaAPI.getDashboard(id, { days: lifestyleDays })
      setDashboard(data)
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load progression data')
    }
  }

  const createSubject = async (e) => {
    e.preventDefault()
    if (!subjectForm.display_name.trim()) {
      toast.error('Name is required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...subjectForm,
        myopia_onset_age: subjectForm.myopia_onset_age === '' ? null : Number(subjectForm.myopia_onset_age),
        target_outdoor_hours: Number(subjectForm.target_outdoor_hours) || 2,
        target_screen_hours: Number(subjectForm.target_screen_hours) || 2,
        date_of_birth: subjectForm.date_of_birth || null,
      }
      const { data } = await myopiaAPI.createSubject(payload)
      toast.success('Myopia profile created')
      setSubjectForm(emptySubject)
      setShowSetup(false)
      await loadSubjects()
      setSelectedId(data.subject.id)
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not create profile')
    } finally {
      setSaving(false)
    }
  }

  const submitPrescription = async (e) => {
    e.preventDefault()
    if (!selectedId) return
    setSaving(true)
    try {
      const payload = {
        measured_at: rxForm.measured_at,
        source: rxForm.source,
        notes: rxForm.notes || null,
        od: {
          sph: rxForm.od.sph === '' ? null : Number(rxForm.od.sph),
          cyl: rxForm.od.cyl === '' ? null : Number(rxForm.od.cyl),
          axis: rxForm.od.axis === '' ? null : Number(rxForm.od.axis),
        },
        os: {
          sph: rxForm.os.sph === '' ? null : Number(rxForm.os.sph),
          cyl: rxForm.os.cyl === '' ? null : Number(rxForm.os.cyl),
          axis: rxForm.os.axis === '' ? null : Number(rxForm.os.axis),
        },
      }
      const { data } = await myopiaAPI.addPrescription(selectedId, payload)
      toast.success('Prescription logged')
      if (data.alert) {
        toast(`Alert: ${data.alert.title}`, { icon: '!' })
      }
      setRxForm(emptyRx)
      setShowRxForm(false)
      await loadDashboard(selectedId)
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not save prescription')
    } finally {
      setSaving(false)
    }
  }

  const chartData = useMemo(() => {
    if (!dashboard?.timeline?.length) return []
    return dashboard.timeline.map((e) => ({
      date: e.measured_at,
      se_od: e.se_od,
      se_os: e.se_os,
      se_binocular: e.se_binocular,
    }))
  }, [dashboard])

  const lifestyleChart = useMemo(() => {
    const series = dashboard?.lifestyle?.series || []
    return series.map((d) => ({
      date: d.date?.slice(5),
      screen: d.screen_time_hours,
      outdoor: d.outdoor_time_hours,
    }))
  }, [dashboard])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent-600" />
      </div>
    )
  }

  const risk = dashboard?.risk
  const subject = dashboard?.subject

  return (
    <div className="space-y-8">
      <div className="animate-fade-in-up">
        <p className="text-sm font-medium text-accent-700 mb-1">Kids & teens</p>
        <h1 className="page-title">Myopia Progression</h1>
        <p className="page-subtitle max-w-2xl">
          Track spherical equivalent over time, spot fast progression, and connect it to outdoor time
          and screen habits — the lifestyle levers that matter most for school-age myopia.
        </p>
        <p className="mt-2">
          <SamdDisclaimer testType="myopia" />
        </p>
      </div>

      {/* Subject switcher */}
      <div className="flex flex-wrap items-center gap-3">
        {subjects.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSelectedId(s.id)}
            className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors min-h-[44px] ${
              selectedId === s.id
                ? 'bg-accent-600 text-white border-accent-600'
                : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
            }`}
          >
            {s.display_name}
            {s.age_years != null ? ` · ${s.age_years}y` : ''}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setSubjectForm(emptySubject)
            setShowSetup(true)
          }}
          className="btn-ghost min-h-[44px]"
        >
          + Add child / teen
        </button>
      </div>

      {showSetup && (
        <form onSubmit={createSubject} className="card p-6 md:p-8 space-y-5 animate-fade-in-up">
          <h2 className="section-title">Set up a myopia profile</h2>
          <p className="text-sm text-gray-600">
            Parents can track one or more kids. Teens can track themselves. Start with name and birthdate;
            add the latest prescription after.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                className="input"
                value={subjectForm.display_name}
                onChange={(e) => setSubjectForm({ ...subjectForm, display_name: e.target.value })}
                required
                placeholder="e.g. Ava"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Relationship</label>
              <select
                className="input"
                value={subjectForm.relationship}
                onChange={(e) => setSubjectForm({ ...subjectForm, relationship: e.target.value })}
              >
                <option value="child">My child</option>
                <option value="self">Myself (teen)</option>
                <option value="ward">Someone I care for</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date of birth</label>
              <input
                type="date"
                className="input"
                value={subjectForm.date_of_birth}
                onChange={(e) => setSubjectForm({ ...subjectForm, date_of_birth: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">School grade (optional)</label>
              <input
                className="input"
                value={subjectForm.school_grade}
                onChange={(e) => setSubjectForm({ ...subjectForm, school_grade: e.target.value })}
                placeholder="e.g. Grade 6"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Age at myopia onset</label>
              <input
                type="number"
                step="0.5"
                min="0"
                className="input"
                value={subjectForm.myopia_onset_age}
                onChange={(e) => setSubjectForm({ ...subjectForm, myopia_onset_age: e.target.value })}
                placeholder="e.g. 7"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parental myopia</label>
              <select
                className="input"
                value={subjectForm.parental_myopia}
                onChange={(e) => setSubjectForm({ ...subjectForm, parental_myopia: e.target.value })}
              >
                <option value="unknown">Unknown</option>
                <option value="none">Neither parent</option>
                <option value="one_parent">One parent</option>
                <option value="both_parents">Both parents</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Myopia-control treatment</label>
              <select
                className="input"
                value={subjectForm.treatment}
                onChange={(e) => setSubjectForm({ ...subjectForm, treatment: e.target.value })}
              >
                <option value="none">None yet</option>
                <option value="atropine">Low-dose atropine</option>
                <option value="ortho_k">Ortho-K</option>
                <option value="multifocal">Multifocal soft lenses</option>
                <option value="dual_focus">Dual-focus / DIMS spectacles</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Daily outdoor target (hours)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                className="input"
                value={subjectForm.target_outdoor_hours}
                onChange={(e) => setSubjectForm({ ...subjectForm, target_outdoor_hours: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="btn-primary min-h-[44px]" disabled={saving}>
              {saving ? 'Saving…' : 'Create profile'}
            </button>
            {subjects.length > 0 && (
              <button type="button" className="btn-ghost min-h-[44px]" onClick={() => setShowSetup(false)}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {subject && dashboard && !showSetup && (
        <>
          {/* Risk + latest SE */}
          <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
            <div className={`card p-6 border ${bandStyles(risk?.band)}`}>
              <p className="text-sm font-medium mb-1">Progression risk (educational)</p>
              <p className="text-4xl font-bold">{risk?.score ?? '—'}</p>
              <p className="text-sm mt-1 capitalize">{risk?.band || '—'} concern</p>
              <p className="text-xs mt-3 opacity-80">{risk?.progression?.summary}</p>
            </div>
            <div className="card p-6">
              <p className="text-sm font-medium text-gray-500 mb-1">Latest spherical equivalent</p>
              <p className="text-4xl font-bold text-gray-900">
                {dashboard.latest_prescription?.se_binocular != null
                  ? `${dashboard.latest_prescription.se_binocular > 0 ? '+' : ''}${dashboard.latest_prescription.se_binocular.toFixed(2)} D`
                  : '—'}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                OD {dashboard.latest_prescription?.se_od?.toFixed(2) ?? '—'} · OS{' '}
                {dashboard.latest_prescription?.se_os?.toFixed(2) ?? '—'}
                {dashboard.latest_prescription?.measured_at
                  ? ` · ${dashboard.latest_prescription.measured_at}`
                  : ''}
              </p>
              {dashboard.total_se_change_d != null && (
                <p className="text-sm text-gray-600 mt-3">
                  Total SE change since first log:{' '}
                  <strong>
                    {dashboard.total_se_change_d > 0 ? '+' : ''}
                    {dashboard.total_se_change_d.toFixed(2)} D
                  </strong>
                </p>
              )}
            </div>
            <div className="card p-6">
              <p className="text-sm font-medium text-gray-500 mb-1">Lifestyle ({lifestyleDays}d avg)</p>
              <div className="space-y-2 mt-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Outdoor</span>
                  <strong>
                    {dashboard.lifestyle?.avg_outdoor_hours != null
                      ? `${dashboard.lifestyle.avg_outdoor_hours} h`
                      : 'No logs'}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Screen</span>
                  <strong>
                    {dashboard.lifestyle?.avg_screen_hours != null
                      ? `${dashboard.lifestyle.avg_screen_hours} h`
                      : 'No logs'}
                  </strong>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Targets</span>
                  <span>
                    ≥{subject.target_outdoor_hours}h outdoor · ≤{subject.target_screen_hours}h screen
                  </span>
                </div>
              </div>
              <Link to="/lifestyle" className="inline-block mt-4 text-sm font-semibold text-accent-700 hover:underline">
                Log lifestyle →
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn-primary min-h-[44px]" onClick={() => setShowRxForm(true)}>
              Log new prescription
            </button>
            <Link to="/vision-tests/visual_acuity" className="btn-ghost min-h-[44px] inline-flex items-center">
              Run acuity check
            </Link>
            <select
              className="input w-auto min-h-[44px]"
              value={lifestyleDays}
              onChange={(e) => setLifestyleDays(Number(e.target.value))}
            >
              <option value={14}>Lifestyle: 14 days</option>
              <option value={30}>Lifestyle: 30 days</option>
              <option value={90}>Lifestyle: 90 days</option>
            </select>
          </div>

          {showRxForm && (
            <form onSubmit={submitPrescription} className="card p-6 space-y-4">
              <h2 className="section-title">Log refraction / prescription</h2>
              <p className="text-sm text-gray-600">
                Enter values from the eye exam. We compute spherical equivalent (SE = sphere + cylinder/2)
                to chart progression.
              </p>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Exam date</label>
                  <input
                    type="date"
                    className="input"
                    required
                    value={rxForm.measured_at}
                    onChange={(e) => setRxForm({ ...rxForm, measured_at: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                  <select
                    className="input"
                    value={rxForm.source}
                    onChange={(e) => setRxForm({ ...rxForm, source: e.target.value })}
                  >
                    <option value="exam">Eye exam</option>
                    <option value="self_report">Self-report</option>
                    <option value="acuity_estimate">From acuity estimate</option>
                  </select>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                {['od', 'os'].map((eye) => (
                  <div key={eye} className="p-4 rounded-xl bg-gray-50 space-y-3">
                    <p className="font-semibold text-gray-900 uppercase text-sm">{eye === 'od' ? 'Right (OD)' : 'Left (OS)'}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {['sph', 'cyl', 'axis'].map((field) => (
                        <div key={field}>
                          <label className="block text-xs text-gray-500 mb-1 uppercase">{field}</label>
                          <input
                            type="number"
                            step={field === 'axis' ? 1 : 0.25}
                            className="input"
                            value={rxForm[eye][field]}
                            onChange={(e) =>
                              setRxForm({
                                ...rxForm,
                                [eye]: { ...rxForm[eye], [field]: e.target.value },
                              })
                            }
                            placeholder={field === 'sph' ? '-2.50' : field === 'cyl' ? '-0.50' : '180'}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input
                  className="input"
                  value={rxForm.notes}
                  onChange={(e) => setRxForm({ ...rxForm, notes: e.target.value })}
                  placeholder="Doctor, clinic, treatment changes…"
                />
              </div>
              <div className="flex gap-3">
                <button type="submit" className="btn-primary min-h-[44px]" disabled={saving}>
                  {saving ? 'Saving…' : 'Save entry'}
                </button>
                <button type="button" className="btn-ghost min-h-[44px]" onClick={() => setShowRxForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* SE chart */}
          <div className="card p-6">
            <h2 className="section-title mb-1">Spherical equivalent over time</h2>
            <p className="text-sm text-gray-500 mb-4">More negative = more myopic. Aim for a flatter slope.</p>
            {chartData.length < 1 ? (
              <p className="text-gray-500 text-sm py-10 text-center">
                Log at least one prescription to start the progression chart. Two+ exams unlock rate alerts.
              </p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      label={{ value: 'SE (D)', angle: -90, position: 'insideLeft', fontSize: 12 }}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="se_od" name="OD" stroke="#0f766e" strokeWidth={2} dot />
                    <Line type="monotone" dataKey="se_os" name="OS" stroke="#0369a1" strokeWidth={2} dot />
                    <Line type="monotone" dataKey="se_binocular" name="Mean" stroke="#b45309" strokeWidth={2} strokeDasharray="4 4" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Lifestyle correlation */}
          <div className="card p-6">
            <h2 className="section-title mb-1">Screen vs outdoor time</h2>
            <p className="text-sm text-gray-500 mb-4">
              From the same Lifestyle logs used across EyeVio — the pattern most linked to childhood myopia risk.
            </p>
            {lifestyleChart.length < 1 ? (
              <p className="text-gray-500 text-sm py-8 text-center">
                No lifestyle logs in this window.{' '}
                <Link to="/lifestyle" className="text-accent-700 font-semibold hover:underline">
                  Add daily outdoor & screen time
                </Link>
              </p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={lifestyleChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} label={{ value: 'Hours', angle: -90, position: 'insideLeft', fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="outdoor" name="Outdoor" fill="#bbf7d0" stroke="#16a34a" />
                    <Bar dataKey="screen" name="Screen" fill="#fdba74" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Recommendations + factors */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="card p-6">
              <h2 className="section-title mb-4">What to do next</h2>
              <ul className="space-y-3">
                {(risk?.recommendations || []).map((rec) => (
                  <li key={rec.title} className="flex gap-3">
                    <span
                      className={`mt-1 h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                        rec.priority === 'critical'
                          ? 'bg-red-500'
                          : rec.priority === 'high'
                            ? 'bg-amber-500'
                            : 'bg-accent-500'
                      }`}
                    />
                    <div>
                      <p className="font-semibold text-gray-900">{rec.title}</p>
                      <p className="text-sm text-gray-600">{rec.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-6">
              <h2 className="section-title mb-4">Risk factors scored</h2>
              {(risk?.factors || []).length === 0 ? (
                <p className="text-sm text-gray-500">Add age, family history, prescriptions, and lifestyle logs to populate this.</p>
              ) : (
                <ul className="space-y-2">
                  {risk.factors.map((f) => (
                    <li key={f.id} className="flex justify-between gap-3 text-sm border-b border-gray-100 pb-2">
                      <span className="text-gray-700">{f.detail}</span>
                      <span className={`font-semibold ${f.points < 0 ? 'text-emerald-700' : 'text-gray-900'}`}>
                        {f.points > 0 ? '+' : ''}
                        {f.points}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-gray-500 mt-4">{risk?.disclaimer}</p>
            </div>
          </div>

          {/* History table */}
          {dashboard.timeline?.length > 0 && (
            <div className="card p-6 overflow-x-auto">
              <h2 className="section-title mb-4">Prescription history</h2>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">SE OD</th>
                    <th className="py-2 pr-4">SE OS</th>
                    <th className="py-2 pr-4">Mean SE</th>
                    <th className="py-2 pr-4">Source</th>
                    <th className="py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {[...dashboard.timeline].reverse().map((e) => (
                    <tr key={e.id} className="border-b border-gray-50">
                      <td className="py-2.5 pr-4 font-medium">{e.measured_at}</td>
                      <td className="py-2.5 pr-4">{e.se_od?.toFixed(2) ?? '—'}</td>
                      <td className="py-2.5 pr-4">{e.se_os?.toFixed(2) ?? '—'}</td>
                      <td className="py-2.5 pr-4 font-semibold">{e.se_binocular?.toFixed(2) ?? '—'}</td>
                      <td className="py-2.5 pr-4 capitalize">{e.source?.replace('_', ' ')}</td>
                      <td className="py-2.5 text-gray-600">{e.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default MyopiaProgression
