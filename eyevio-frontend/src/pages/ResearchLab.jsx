import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FlaskConical, AlertTriangle, ShieldOff, Microscope, Target, ListChecks } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

const ASSET_BASE = `${import.meta.env.BASE_URL}research-lab/`
const FINDING =
  'High test accuracy did not demonstrate clinical validity. Occlusion testing revealed that the model learned dataset-specific shortcuts rather than ocular features.'

const fmt = (v, d = 3) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '—')
const pct = (v, d = 1) => (typeof v === 'number' && Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '—')
const ci = (pair, d = 3) => (Array.isArray(pair) && pair.length === 2 ? `${fmt(pair[0], d)}–${fmt(pair[1], d)}` : null)
const mean = (xs) => (Array.isArray(xs) && xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** Share of the above-chance performance the model keeps when the eye itself is hidden. */
const retained = (full, masked, chance) =>
  typeof full === 'number' && typeof masked === 'number' && full > chance ? (masked - chance) / (full - chance) : null

function useEval(name) {
  const [state, setState] = useState({ data: null, error: null })
  useEffect(() => {
    let cancelled = false
    fetch(`${ASSET_BASE}${name}_eval.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => !cancelled && setState({ data, error: null }))
      .catch((error) => !cancelled && setState({ data: null, error }))
    return () => {
      cancelled = true
    }
  }, [name])
  return state
}

function Section({ icon: Icon, title, children }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
        {Icon && <Icon className="h-5 w-5 text-violet-700" aria-hidden="true" />}
        {title}
      </h2>
      {children}
    </section>
  )
}

function Metric({ label, value, interval, note }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
      {interval && <p className="text-xs text-gray-500">95% CI {interval}</p>}
      {note && <p className="mt-1 text-xs text-gray-600">{note}</p>}
    </div>
  )
}

function Figure({ src, alt, caption }) {
  return (
    <figure className="mt-3">
      <a href={src} target="_blank" rel="noreferrer">
        <img src={src} alt={alt} loading="lazy" className="w-full rounded-lg border border-gray-200" />
      </a>
      {caption && <figcaption className="mt-1.5 text-xs text-gray-600">{caption}</figcaption>}
    </figure>
  )
}

function Bullets({ items }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
      {items.filter(Boolean).map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  )
}

function SubHeading({ children }) {
  return <h3 className="mb-2 mt-5 text-sm font-semibold uppercase tracking-wide text-gray-700">{children}</h3>
}

function ShortcutChart({ cataract, redness, pathology }) {
  const rows = []
  if (cataract) {
    const p = cataract.shortcut_probe || {}
    rows.push({ model: 'Cataract (AUC)', full: p.auc_full, masked: p.auc_eye_masked_out, chance: 0.5 })
  }
  if (redness) {
    rows.push({
      model: 'Redness (AUC)',
      full: redness.test?.auc_conjunctivitis_vs_normal,
      masked: redness.shortcut_probe?.auc_conjunctivitis_vs_normal_eye_masked,
      chance: 0.5,
    })
  }
  if (pathology) {
    rows.push({
      model: 'Pathology (macro-F1)',
      full: pathology.test?.macro_f1,
      masked: pathology.shortcut_probe?.macro_f1_eye_masked,
      chance: pathology.shortcut_probe?.chance_macro_f1 ?? 0.25,
    })
  }
  if (!rows.length) return null

  return (
    <>
      <div className="h-64 w-full">
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <XAxis dataKey="model" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 1]} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v) => fmt(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0.5} stroke="#9ca3af" strokeDasharray="4 4" />
            <Bar dataKey="full" name="Full photo" fill="#6d28d9" />
            <Bar dataKey="masked" name="Eye hidden (grey disc)" fill="#f59e0b" />
            <Bar dataKey="chance" name="Chance" fill="#d1d5db" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {rows.map((r) => (
          <Metric
            key={r.model}
            label={`${r.model.split(' ')[0]}: performance kept without the eye`}
            value={pct(retained(r.full, r.masked, r.chance), 0)}
            note={`Full ${fmt(r.full)} → eye hidden ${fmt(r.masked)} (chance ${fmt(r.chance, 2)})`}
          />
        ))}
      </div>
    </>
  )
}

function CataractSection({ data }) {
  const clean = data.test_clean || {}
  const sim = data.test_webcam_sim || {}
  const simCi = data.test_webcam_sim_ci95 || {}
  const probe = data.shortcut_probe || {}
  const ood = data.ood_eval || {}
  const cam = data.gradcam_central_mass?.values || {}
  const dedup = data.data?.dedup?.test || {}
  const appCrops = ood.probe_sets?.app_webcam_pupil_crops
  const appFrames = ood.probe_sets?.app_webcam_full_frames

  return (
    <Section icon={Microscope} title="Cataract model (ResNet-18, cataract vs normal)">
      <p className="text-sm text-gray-700">
        Trained on {data.data?.train ?? '—'} external eye photographs from one public dataset ({data.data?.source || 'source not recorded'}).
        Validation {data.data?.val ?? '—'}, test {data.data?.test ?? '—'} images. Labels are binary; there is no lens grading.
      </p>

      <SubHeading>What the numbers looked like</SubHeading>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Test AUC" value={fmt(clean.auc, 4)} interval={ci(data.test_clean_ci95?.auc, 4)} />
        <Metric
          label="Test AUC, webcam-simulated"
          value={fmt(sim.auc, 3)}
          interval={ci(simCi.auc)}
          note="Same test photos blurred, downscaled and recompressed"
        />
        <Metric
          label="Webcam-sim at 0.2 threshold"
          value={`Sens ${pct(sim.at_rule_out?.sensitivity, 0)} · Spec ${pct(sim.at_rule_out?.specificity, 0)}`}
          interval={ci(simCi['at_rule_out.specificity'], 2) && `spec ${ci(simCi['at_rule_out.specificity'], 2)}`}
        />
      </div>

      <SubHeading>Masking experiment</SubHeading>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Full photo" value={`AUC ${fmt(probe.auc_full, 4)}`} />
        <Metric label="Eye hidden" value={`AUC ${fmt(probe.auc_eye_masked_out, 4)}`} note={probe.eye_region} />
        <Metric label="Eye only" value={`AUC ${fmt(probe.auc_eye_only, 4)}`} />
      </div>
      <p className="mt-2 text-sm text-gray-700">
        With the eye covered, the model still separates the two groups almost perfectly. Whatever it uses is in the
        surroundings (framing, skin, lighting, image source), not the lens.
      </p>

      <SubHeading>Calibration</SubHeading>
      <p className="text-sm text-gray-700">
        Temperature scaling (T = {fmt(data.temperature, 2)}). Clean test: ECE {fmt(clean.ece)}, Brier {fmt(clean.brier)}.
        Webcam-simulated: ECE {fmt(sim.ece)}, Brier {fmt(sim.brier)}. Good calibration only means the probabilities match
        this dataset; it says nothing about whether the right feature was used.
      </p>
      <Figure
        src={`${ASSET_BASE}cataract_reliability.jpg`}
        alt="Reliability diagrams for the cataract model on clean and webcam-simulated test sets"
        caption="Reliability diagrams on the held-out split. Numbers above bars are images per bin."
      />

      <SubHeading>Grad-CAM</SubHeading>
      <p className="text-sm text-gray-700">
        Share of attention inside the central eye disc: cataract photos {pct(mean(cam['cataract (test)']), 0)}, normal
        photos {pct(mean(cam['normal (test)']), 0)}, normal photos with the eye hidden {pct(mean(cam['normal, eye masked']), 0)},
        EyeVio webcam crops {pct(mean(cam['app webcam crop']), 0)}. For normal eyes the model barely looks at the eye. When
        the eye is replaced by a grey disc, the disc itself pushes the prediction toward “cataract”.
      </p>
      <Figure
        src={`${ASSET_BASE}cataract_gradcam.jpg`}
        alt="Grad-CAM heatmaps for cataract, normal, eye-masked normal and EyeVio webcam crops"
        caption="Row 3: the same normal photos with the eye filled in still score up to P = 0.62. Row 4: real EyeVio webcam crops."
      />

      <SubHeading>Out-of-distribution check</SubHeading>
      <Bullets
        items={[
          `Validation photos flagged as unfamiliar: ${pct(ood.val_flagged_fraction)}`,
          `Webcam-simulated validation photos flagged: ${pct(ood.val_webcam_sim_flagged_fraction)}`,
          appCrops && `Real EyeVio webcam pupil crops flagged: ${pct(appCrops.flagged_fraction, 0)} (n = ${appCrops.n})`,
          appFrames && `Real EyeVio webcam full frames flagged: ${pct(appFrames.flagged_fraction, 0)} (n = ${appFrames.n})`,
          'Noise, heavy blur, under-exposure and flat-colour probes: all flagged',
        ]}
      />
      <p className="mt-2 text-sm text-gray-700">
        Most photos that look like what EyeVio actually captures fall outside what the model was trained on.
      </p>

      <SubHeading>Leakage and limitations</SubHeading>
      <Bullets
        items={[
          `${dedup.removed_near_duplicate_of_reference ?? '—'} near-duplicate test images (of training photos) were removed before scoring.`,
          data.external_test_note || 'No external test set.',
          'Cataract and normal photos probably came from different cameras and clinics, so “where the photo came from” predicts the label.',
          'Binary labels only: no grading of opacity type or density, no slit-lamp reference.',
        ]}
      />
    </Section>
  )
}

function RednessSection({ data }) {
  const t = data.test || {}
  const tci = data.test_ci95 || {}
  const per = data.per_weak_class_prediction || {}
  const cam = data.gradcam_central_mass || {}
  const leak = data.leakage || {}

  return (
    <Section icon={Microscope} title="Sclera redness model (ResNet-18, ordinal 0–4)">
      <p className="text-sm text-gray-700">
        Labels are weak: {data.labels}. No photo was ever graded for redness by a clinician.
      </p>

      <SubHeading>What the numbers looked like</SubHeading>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Test MAE (grade units)" value={fmt(t.mae)} interval={ci(tci.mae)} />
        <Metric label="Spearman ρ" value={fmt(t.spearman)} interval={ci(tci.spearman)} />
        <Metric label="AUC conjunctivitis vs normal" value={fmt(t.auc_conjunctivitis_vs_normal)} />
      </div>
      <p className="mt-2 text-sm text-gray-700">
        Predicted grade by folder: normal {fmt(per.normal?.mean, 2)} (SD {fmt(per.normal?.sd, 2)}), other{' '}
        {fmt(per.other?.mean, 2)}, conjunctivitis {fmt(per.conjunctivitis?.mean, 2)}. Every normal photo got exactly the same
        score. That is a model recognising the folder, not measuring how red an eye is.
      </p>

      <SubHeading>Masking experiment</SubHeading>
      <Metric
        label="AUC with the eye hidden"
        value={fmt(data.shortcut_probe?.auc_conjunctivitis_vs_normal_eye_masked)}
        note={data.shortcut_probe?.eye_region}
      />

      <SubHeading>Grad-CAM</SubHeading>
      <p className="text-sm text-gray-700">
        Attention inside the eye disc: normal {pct(cam.normal, 0)}, other {pct(cam.other, 0)}, conjunctivitis{' '}
        {pct(cam.conjunctivitis, 0)}. The model looks at the eye mainly when it has already decided “conjunctivitis”.
      </p>
      <Figure
        src={`${ASSET_BASE}redness_gradcam.jpg`}
        alt="Grad-CAM heatmaps for the redness model by weak class"
      />

      <SubHeading>Leakage and limitations</SubHeading>
      <Bullets
        items={[
          `${leak.near_duplicate_of_train ?? '—'} of ${leak.test_images ?? '—'} test images are near-duplicates of training images.`,
          'No graded redness data exists for this model, so it was never tested against the thing it claims to measure.',
          'Not calibrated as a probability; the 0–4 output is a regression on folder labels.',
        ]}
      />
    </Section>
  )
}

function PathologySection({ data }) {
  const t = data.test || {}
  const tci = data.test_ci95 || {}
  const probe = data.shortcut_probe || {}
  const cam = data.gradcam_central_mass || {}
  const leak = data.leakage || {}
  const labels = data.labels || []

  return (
    <Section icon={Microscope} title="Pathology model (ResNet-18, 4 classes)">
      <p className="text-sm text-gray-700">Classes: {labels.join(', ')}. Test n = {data.n_test}.</p>

      <SubHeading>What the numbers looked like</SubHeading>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Accuracy" value={fmt(t.accuracy)} interval={ci(tci.accuracy)} />
        <Metric label="Macro-F1" value={fmt(t.macro_f1)} interval={ci(tci.macro_f1)} />
        <Metric label="Top-label ECE" value={fmt(t.top_label_ece)} note={data.calibration_note} />
      </div>

      {Array.isArray(data.confusion) && (
        <div className="mt-3 overflow-x-auto">
          <table className="text-xs text-gray-700">
            <caption className="mb-1 text-left text-xs text-gray-500">Confusion matrix (rows true, columns predicted)</caption>
            <thead>
              <tr>
                <th className="px-2 py-1" />
                {labels.map((l) => (
                  <th key={l} className="px-2 py-1 font-medium">{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.confusion.map((row, i) => (
                <tr key={labels[i] || i}>
                  <th className="px-2 py-1 text-left font-medium">{labels[i]}</th>
                  {row.map((n, j) => (
                    <td key={j} className={`px-2 py-1 text-center ${i === j ? 'font-semibold' : ''}`}>{n}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SubHeading>Masking experiment</SubHeading>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Accuracy, eye hidden" value={fmt(probe.accuracy_eye_masked)} />
        <Metric label="Macro-F1, eye hidden" value={fmt(probe.macro_f1_eye_masked)} />
        <Metric label="Chance macro-F1" value={fmt(probe.chance_macro_f1, 2)} />
      </div>
      <p className="mt-2 text-sm text-gray-700">
        Hiding the eye costs about a third of the performance, but the model still classifies far above chance from the
        background alone.
      </p>

      <SubHeading>Grad-CAM</SubHeading>
      <p className="text-sm text-gray-700">
        Attention inside the eye disc ranges from {pct(Math.min(...Object.values(cam)), 0)} to{' '}
        {pct(Math.max(...Object.values(cam)), 0)} across classes. Central attention is not proof the right feature is
        used: the masking result shows the background carries enough signal on its own.
      </p>
      <Figure src={`${ASSET_BASE}pathology_gradcam.jpg`} alt="Grad-CAM heatmaps for the pathology model" />

      <SubHeading>Leakage and limitations</SubHeading>
      <Bullets
        items={[
          `${leak.near_duplicate_of_train ?? '—'} of ${leak.test_images ?? '—'} test images (${pct(
            leak.test_images ? leak.near_duplicate_of_train / leak.test_images : null,
            0,
          )}) are near-duplicates of training images, which inflates the test score.`,
          '“Other” is a mixed bag of conditions, so a confident “other” has no single meaning.',
          'Softmax outputs are not temperature-scaled.',
        ]}
      />
    </Section>
  )
}

export default function ResearchLab() {
  const cataract = useEval('cataract')
  const redness = useEval('redness')
  const pathology = useEval('pathology')
  const failed = [cataract, redness, pathology].some((s) => s.error)

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="rounded-xl border border-violet-200 bg-violet-50 p-5">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-violet-800">
          <FlaskConical className="h-4 w-4" aria-hidden="true" />
          Experimental AI Research Lab
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Why EyeVio does not show its image-model results</h1>
        <blockquote className="mt-3 border-l-4 border-violet-500 pl-3 text-base font-medium text-gray-900">{FINDING}</blockquote>
        <p className="mt-3 text-sm text-gray-700">
          EyeVio trained three image models: cataract, sclera redness and eye pathology. On their own test sets they scored
          close to perfect. This page is the experiment that showed those scores were not trustworthy. None of these models
          produces a result anywhere else in the app.
        </p>
      </header>

      {failed && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Some evaluation files could not be loaded. The sections below show what is available.
        </div>
      )}

      <Section icon={Target} title="The experiment">
        <Bullets
          items={[
            'Question: does the model use the eye, or something else in the photo?',
            'Method: re-score every test photo with the eye covered by a grey disc (radius 0.35 × image side). If the model relies on the eye, performance should fall to chance.',
            'Also checked: calibration (do probabilities match outcomes?), Grad-CAM (where does the model look?), out-of-distribution detection (do EyeVio’s own webcam photos look like the training data?) and near-duplicate leakage between training and test.',
          ]}
        />
        <SubHeading>Result</SubHeading>
        <ShortcutChart cataract={cataract.data} redness={redness.data} pathology={pathology.data} />
        <p className="mt-3 text-sm text-gray-700">
          The dashed line marks chance for the two AUC models. All three models keep most of their performance with the
          eye hidden, so the label can be predicted from the background, framing or image source. That is a dataset
          shortcut, not a sign of disease.
        </p>
      </Section>

      {cataract.data && <CataractSection data={cataract.data} />}
      {redness.data && <RednessSection data={redness.data} />}
      {pathology.data && <PathologySection data={pathology.data} />}

      <Section icon={ShieldOff} title="What EyeVio does with these models now">
        <Bullets
          items={[
            'The photo-capture quality checks (focus, lighting, eye visible, framing) still run on every photo.',
            'The models may still run in the background for research, but the app only reports: “Experimental analysis completed”, “Result is not clinically interpretable” and “This model is currently being evaluated for dataset shortcuts”.',
            'No cataract likelihood, risk band, redness grade or pathology class is shown, stored in your history, compared over time, used in alerts or included in clinician reports.',
            'Pixel-based colour measurements (for example average sclera redness) are shown as experimental measurements, not grades.',
          ]}
        />
      </Section>

      <Section icon={ListChecks} title="What would have to change before any result is shown">
        <Bullets
          items={[
            'Masking test passes: with the eye hidden, performance drops to near chance.',
            'An external test set from a different source, collected with the same kind of webcam or phone EyeVio uses, labelled by clinicians (graded opacity or redness, not folder names).',
            'Out-of-distribution rate on real EyeVio captures is low enough that the model is scoring photos like the ones it was trained on.',
            'No near-duplicate leakage between training and test.',
            'A prospective validation with a pre-registered analysis plan, plus regulatory review before any diagnostic claim.',
          ]}
        />
      </Section>

      <p className="pb-4 text-xs text-gray-500">
        Source: EyeVio model cards (evaluation re-run by <code>scripts/eval_model_cards.py</code>). EyeVio is a research and
        educational prototype and has not been clinically validated. See the{' '}
        <Link to="/eye-health-monitor" className="underline underline-offset-2">Eye Photo Monitor</Link> and{' '}
        <Link to="/cataract-opacity-monitor" className="underline underline-offset-2">Lens Photo Timeline</Link> for what
        the app does show.
      </p>
    </div>
  )
}
