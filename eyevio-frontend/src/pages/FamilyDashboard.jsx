import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { familyAPI, reportsAPI, triggerPdfDownload } from '../services/api'

function trackClass(onTrack) {
  if (onTrack === true) return 'text-emerald-700 bg-emerald-50'
  if (onTrack === false) return 'text-amber-800 bg-amber-50'
  return 'text-gray-600 bg-gray-50'
}

function FamilyDashboard() {
  const [data, setData] = useState(null)
  const [selectedChild, setSelectedChild] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [familyName, setFamilyName] = useState('')
  const [childForm, setChildForm] = useState({ display_name: '', date_of_birth: '', age: '' })
  const [joinCode, setJoinCode] = useState('')
  const [goalDraft, setGoalDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const { data: payload } = await familyAPI.get({ days: 7 })
      setData(payload)
      if (payload.role === 'caregiver' && payload.children?.length) {
        const still = payload.children.find((c) => c.member.user_id === selectedChild)
        const nextId = still ? selectedChild : payload.children[0].member.user_id
        setSelectedChild(nextId)
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load family')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!selectedChild || data?.role !== 'caregiver') {
      setDetail(null)
      return
    }
    familyAPI
      .getChild(selectedChild, { days: 30 })
      .then((res) => {
        setDetail(res.data)
        setGoalDraft(res.data.goals)
      })
      .catch(() => setDetail(null))
  }, [selectedChild, data?.role])

  const createFamily = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await familyAPI.create({ name: familyName || undefined })
      toast.success('Family created')
      await load()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not create family')
    } finally {
      setSaving(false)
    }
  }

  const addChild = async (e) => {
    e.preventDefault()
    if (!childForm.display_name.trim()) {
      toast.error('Child name is required')
      return
    }
    setSaving(true)
    try {
      const { data: res } = await familyAPI.addChild({
        display_name: childForm.display_name,
        date_of_birth: childForm.date_of_birth || null,
        age: childForm.age || null,
      })
      toast.success(`Added ${childForm.display_name}. Claim code: ${res.claim_invite?.code}`)
      setChildForm({ display_name: '', date_of_birth: '', age: '' })
      await load()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not add child')
    } finally {
      setSaving(false)
    }
  }

  const makeInvite = async (role) => {
    setSaving(true)
    try {
      const { data: res } = await familyAPI.createInvite({ role, days: 14 })
      toast.success(`${role === 'child' ? 'Child' : 'Caregiver'} code: ${res.invite.code}`)
      await load()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not create invite')
    } finally {
      setSaving(false)
    }
  }

  const joinFamily = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await familyAPI.join({ code: joinCode.trim().toUpperCase() })
      toast.success('Joined family')
      setJoinCode('')
      await load()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not join')
    } finally {
      setSaving(false)
    }
  }

  const saveGoals = async () => {
    if (!selectedChild || !goalDraft) return
    setSaving(true)
    try {
      await familyAPI.updateGoals(selectedChild, goalDraft)
      toast.success('Goals saved — shown on the child’s lifestyle view')
      await load()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not save goals')
    } finally {
      setSaving(false)
    }
  }

  const downloadClinician = async () => {
    if (!selectedChild) return
    setExporting(true)
    try {
      const response = await reportsAPI.clinician({ days: 90, child_user_id: selectedChild })
      const name = (detail?.member?.display_name || 'child').toLowerCase().replace(/\s+/g, '-')
      triggerPdfDownload(
        response.data,
        `eyevio-clinician-${name}-${new Date().toISOString().split('T')[0]}.pdf`
      )
      toast.success('Clinician one-pager downloaded')
    } catch (error) {
      toast.error('Failed to generate clinician PDF')
    } finally {
      setExporting(false)
    }
  }

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code)
      toast.success('Code copied')
    } catch {
      toast(code)
    }
  }

  const series = useMemo(() => detail?.lifestyle_series || [], [detail])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent-600" />
      </div>
    )
  }

  // Child view — parent-enforced goals
  if (data?.role === 'child') {
    const g = data.goals || {}
    return (
      <div className="space-y-8">
        <div>
          <p className="text-sm font-medium text-accent-700 mb-1">{data.family?.name}</p>
          <h1 className="page-title">Your family goals</h1>
          <p className="page-subtitle">
            A parent or caregiver set these targets. Logging outdoor time, screen time, and 20-20-20
            breaks on Lifestyle keeps everyone on the same page.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card p-5">
            <p className="text-sm text-gray-500">Outdoor time</p>
            <p className="text-3xl font-bold mt-1">{g.outdoor_hours_target}h</p>
            <p className="text-xs text-gray-500 mt-1">daily target</p>
          </div>
          <div className="card p-5">
            <p className="text-sm text-gray-500">Screen limit</p>
            <p className="text-3xl font-bold mt-1">{g.screen_hours_limit}h</p>
            <p className="text-xs text-gray-500 mt-1">daily max</p>
          </div>
          <div className="card p-5">
            <p className="text-sm text-gray-500">20-20-20 breaks</p>
            <p className="text-3xl font-bold mt-1">{g.breaks_target}</p>
            <p className="text-xs text-gray-500 mt-1">per day</p>
          </div>
          <div className="card p-5">
            <p className="text-sm text-gray-500">Vision check</p>
            <p className="text-3xl font-bold mt-1">every {g.test_interval_days}d</p>
            <p className="text-xs text-gray-500 mt-1">
              <Link to="/vision-tests" className="text-accent-700 font-semibold">Take a test →</Link>
            </p>
          </div>
        </div>
        <Link to="/lifestyle" className="btn-primary min-h-[44px] inline-flex items-center">
          Log today
        </Link>
      </div>
    )
  }

  // No family yet
  if (!data?.family) {
    return (
      <div className="space-y-8 max-w-2xl">
        <div>
          <h1 className="page-title">Family & caregivers</h1>
          <p className="page-subtitle">
            Monitor a child’s vision tests, outdoor vs screen time, and 20-20-20 breaks — the habits
            younger kids don’t log on their own.
          </p>
        </div>
        <form onSubmit={createFamily} className="card p-6 space-y-4">
          <h2 className="section-title">Start a family</h2>
          <input
            className="input"
            placeholder="Family name (e.g. The Patels)"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
          />
          <button type="submit" className="btn-primary min-h-[44px]" disabled={saving}>
            Create family
          </button>
        </form>
        <form onSubmit={joinFamily} className="card p-6 space-y-4">
          <h2 className="section-title">Join with an invite code</h2>
          <input
            className="input tracking-widest uppercase"
            placeholder="K7M2QP"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          />
          <button type="submit" className="btn-ghost min-h-[44px]" disabled={saving}>
            Join family
          </button>
        </form>
      </div>
    )
  }

  const children = data.children || []

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium text-accent-700 mb-1">Caregiver dashboard</p>
        <h1 className="page-title">{data.family.name}</h1>
        <p className="page-subtitle max-w-2xl">
          Track each child’s vision trends and the parent-enforced habits that matter: outdoor time,
          screen limits, and 20-20-20 breaks.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary min-h-[44px]" onClick={() => makeInvite('child')} disabled={saving}>
          Invite teen (code)
        </button>
        <button type="button" className="btn-ghost min-h-[44px]" onClick={() => makeInvite('caregiver')} disabled={saving}>
          Invite co-parent
        </button>
      </div>

      {(data.open_invites || []).length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Open invite codes</h2>
          <ul className="space-y-2 text-sm">
            {data.open_invites.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 justify-between">
                <span>
                  <code className="tracking-widest font-bold text-lg">{inv.code}</code>
                  <span className="text-gray-500 ml-2">{inv.role}</span>
                  <span className="text-gray-400 ml-2">expires {inv.expires_at?.slice(0, 10)}</span>
                </span>
                <button type="button" className="text-accent-700 font-semibold" onClick={() => copyCode(inv.code)}>
                  Copy
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500 mt-3">
            Share with a teen at <code>/register?invite=CODE</code> or they can enter it on signup.
          </p>
        </div>
      )}

      <form onSubmit={addChild} className="card p-6 grid md:grid-cols-4 gap-4 items-end">
        <div className="md:col-span-4">
          <h2 className="section-title">Add a younger child (you manage the account)</h2>
          <p className="text-sm text-gray-600">
            Best when the parent logs tests and lifestyle. Share the claim code later if they get their own login.
          </p>
        </div>
        <input
          className="input"
          required
          placeholder="Name"
          value={childForm.display_name}
          onChange={(e) => setChildForm({ ...childForm, display_name: e.target.value })}
        />
        <input
          type="date"
          className="input"
          value={childForm.date_of_birth}
          onChange={(e) => setChildForm({ ...childForm, date_of_birth: e.target.value })}
        />
        <input
          type="number"
          min="1"
          max="21"
          className="input"
          placeholder="Age"
          value={childForm.age}
          onChange={(e) => setChildForm({ ...childForm, age: e.target.value })}
        />
        <button type="submit" className="btn-primary min-h-[44px]" disabled={saving}>
          Add child
        </button>
      </form>

      {children.length === 0 ? (
        <p className="text-gray-500">No children linked yet. Add a managed child or send an invite code.</p>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {children.map((c) => {
            const m = c.member
            const active = selectedChild === m.user_id
            return (
              <button
                key={m.user_id}
                type="button"
                onClick={() => setSelectedChild(m.user_id)}
                className={`card p-5 text-left transition-shadow ${active ? 'ring-2 ring-accent-500' : 'hover:shadow-elevated'}`}
              >
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="font-semibold text-gray-900 text-lg">{m.display_name}</p>
                    <p className="text-xs text-gray-500">
                      {m.age ? `${m.age}y` : 'age unknown'}
                      {m.is_managed ? ' · managed' : ''}
                    </p>
                  </div>
                  {c.unread_alerts > 0 && (
                    <span className="text-xs font-semibold bg-amber-100 text-amber-800 px-2 py-1 rounded-full">
                      {c.unread_alerts} alert{c.unread_alerts === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div className={`rounded-lg p-2 ${trackClass(c.lifestyle.outdoor_on_track)}`}>
                    <p className="opacity-70">Outdoor</p>
                    <p className="font-bold text-sm">
                      {c.lifestyle.avg_outdoor_hours ?? '—'} / {c.goals.outdoor_hours_target}h
                    </p>
                  </div>
                  <div className={`rounded-lg p-2 ${trackClass(c.lifestyle.screen_on_track)}`}>
                    <p className="opacity-70">Screen</p>
                    <p className="font-bold text-sm">
                      {c.lifestyle.avg_screen_hours ?? '—'} / {c.goals.screen_hours_limit}h
                    </p>
                  </div>
                  <div className={`rounded-lg p-2 ${trackClass(c.lifestyle.breaks_on_track)}`}>
                    <p className="opacity-70">Breaks</p>
                    <p className="font-bold text-sm">
                      {c.lifestyle.avg_breaks ?? '—'} / {c.goals.breaks_target}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  Last test:{' '}
                  {c.last_test
                    ? `${c.last_test.test_type} · ${Math.round(c.last_test.score)}%`
                    : 'none yet'}
                  {c.test_overdue ? ' · overdue' : ''}
                  {c.myopia_se != null ? ` · SE ${c.myopia_se.toFixed(2)} D` : ''}
                </p>
              </button>
            )
          })}
        </div>
      )}

      {detail && goalDraft && (
        <div className="space-y-6">
          <div className="card p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
              <h2 className="section-title">Parent-enforced goals — {detail.member.display_name}</h2>
              <button
                type="button"
                className="btn-primary min-h-[44px] shrink-0"
                onClick={downloadClinician}
                disabled={exporting}
              >
                {exporting ? 'Generating…' : 'Clinician one-pager'}
              </button>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <label className="text-sm">
                Outdoor hours / day
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  className="input mt-1"
                  value={goalDraft.outdoor_hours_target}
                  onChange={(e) => setGoalDraft({ ...goalDraft, outdoor_hours_target: Number(e.target.value) })}
                />
              </label>
              <label className="text-sm">
                Screen hours max / day
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  className="input mt-1"
                  value={goalDraft.screen_hours_limit}
                  onChange={(e) => setGoalDraft({ ...goalDraft, screen_hours_limit: Number(e.target.value) })}
                />
              </label>
              <label className="text-sm">
                20-20-20 breaks / day
                <input
                  type="number"
                  min="0"
                  className="input mt-1"
                  value={goalDraft.breaks_target}
                  onChange={(e) => setGoalDraft({ ...goalDraft, breaks_target: Number(e.target.value) })}
                />
              </label>
              <label className="text-sm">
                Test every (days)
                <input
                  type="number"
                  min="7"
                  className="input mt-1"
                  value={goalDraft.test_interval_days}
                  onChange={(e) => setGoalDraft({ ...goalDraft, test_interval_days: Number(e.target.value) })}
                />
              </label>
            </div>
            <button type="button" className="btn-primary min-h-[44px] mt-4" onClick={saveGoals} disabled={saving}>
              Save goals
            </button>
          </div>

          <div className="card p-6">
            <h2 className="section-title mb-1">Outdoor vs screen (30 days)</h2>
            <p className="text-sm text-gray-500 mb-4">From the child’s lifestyle logs (manual or Digital Wellbeing sync).</p>
            {series.length < 1 ? (
              <p className="text-sm text-gray-500 py-8 text-center">No lifestyle logs yet for this child.</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={series.map((d) => ({ ...d, date: d.date?.slice(5) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="screen_time_hours" name="Screen h" fill="#fdba74" />
                    <Line type="monotone" dataKey="outdoor_time_hours" name="Outdoor h" stroke="#16a34a" strokeWidth={2} />
                    <Line type="monotone" dataKey="breaks_taken" name="Breaks" stroke="#0f766e" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="card p-6">
              <h2 className="section-title mb-4">Recent vision tests</h2>
              {(detail.tests || []).length === 0 ? (
                <p className="text-sm text-gray-500">No tests in this window.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {detail.tests.map((t) => (
                    <li key={t.id} className="flex justify-between border-b border-gray-50 py-2">
                      <span className="capitalize">{t.test_type?.replace(/_/g, ' ')}</span>
                      <span className="font-semibold">{Math.round(t.score)}%</span>
                      <span className="text-gray-400">{t.created_at?.slice(0, 10)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="card p-6">
              <h2 className="section-title mb-4">Alerts</h2>
              {(detail.alerts || []).length === 0 ? (
                <p className="text-sm text-gray-500">No recent alerts.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {detail.alerts.map((a) => (
                    <li key={a.id}>
                      <p className="font-semibold text-gray-900">{a.title}</p>
                      <p className="text-gray-600">{a.message}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {a.severity} · {a.created_at?.slice(0, 10)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FamilyDashboard
