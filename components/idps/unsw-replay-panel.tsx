'use client'

import { useEffect, useRef, useState } from 'react'
import { Database, Pause, Play, RotateCcw } from 'lucide-react'
import replay from '@/data/unsw-replay.json'

type Flow = {
  proto: string
  service: string
  state: string
  sbytes: number
  dbytes: number
  sttl: number
  dur: number
  rate: number
  family: string
  actual: number
  predicted: number
  proba: number
}

const FLOWS = replay.flows as Flow[]

type Counts = { tp: number; fp: number; tn: number; fn: number }

function metrics(c: Counts) {
  const total = c.tp + c.fp + c.tn + c.fn || 1
  const precision = c.tp + c.fp ? c.tp / (c.tp + c.fp) : 0
  const recall = c.tp + c.fn ? c.tp / (c.tp + c.fn) : 0
  const fpr = c.fp + c.tn ? c.fp / (c.fp + c.tn) : 0
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0
  return { accuracy: (c.tp + c.tn) / total, precision, recall, f1, fpr }
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`
}

/**
 * Streams the real held-out UNSW-NB15 test flows through the dashboard, one at a
 * time, showing the TRAINED XGBoost model's verdict against ground truth. The
 * confusion-matrix tallies and metrics update live and converge to the offline
 * benchmark figures — so the dataset itself drives the demo. Data is produced by
 * `ml/export_replay.py` (data/unsw-replay.json); no ML runs in the browser.
 */
export function UnswReplayPanel() {
  const [running, setRunning] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [counts, setCounts] = useState<Counts>({ tp: 0, fp: 0, tn: 0, fn: 0 })
  const [recent, setRecent] = useState<Flow[]>([])
  const idxRef = useRef(0)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const i = idxRef.current
      if (i >= FLOWS.length) {
        setRunning(false)
        return
      }
      const f = FLOWS[i]
      idxRef.current = i + 1
      setCursor(i + 1)
      // Pure functional updates only — no nested setState, so StrictMode's
      // double-invocation of updaters cannot double-count.
      setCounts((c) => ({
        tp: c.tp + (f.actual === 1 && f.predicted === 1 ? 1 : 0),
        fp: c.fp + (f.actual === 0 && f.predicted === 1 ? 1 : 0),
        tn: c.tn + (f.actual === 0 && f.predicted === 0 ? 1 : 0),
        fn: c.fn + (f.actual === 1 && f.predicted === 0 ? 1 : 0),
      }))
      setRecent((r) => [f, ...r].slice(0, 8))
    }, 120)
    return () => clearInterval(id)
  }, [running])

  function reset() {
    setRunning(false)
    idxRef.current = 0
    setCursor(0)
    setCounts({ tp: 0, fp: 0, tn: 0, fn: 0 })
    setRecent([])
  }

  const m = metrics(counts)
  const processed = counts.tp + counts.fp + counts.tn + counts.fn
  const progress = (cursor / FLOWS.length) * 100

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold">
            UNSW-NB15 Replay — trained XGBoost on real test flows
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setRunning((r) => !r)}
            disabled={cursor >= FLOWS.length}
            className="flex items-center gap-1 rounded-md border border-border bg-secondary px-2.5 py-1 text-[11px] font-medium hover:bg-secondary/70 disabled:opacity-40"
          >
            {running ? <Pause className="size-3" /> : <Play className="size-3" />}
            {running ? 'Pause' : cursor === 0 ? 'Replay dataset' : 'Resume'}
          </button>
          <button
            onClick={reset}
            className="flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1 text-[11px] font-medium hover:bg-secondary/70"
          >
            <RotateCcw className="size-3" />
          </button>
        </div>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Streaming {replay.sampledFlows.toLocaleString()} genuine flows sampled from
        the {replay.totalTestFlows.toLocaleString()}-record held-out test set. Each
        flow shows the trained model&apos;s verdict vs ground truth; metrics
        converge to the offline benchmark ({replay.generatedAt}).
      </p>

      {/* live metrics */}
      <dl className="grid grid-cols-3 gap-2 md:grid-cols-5">
        {[
          { label: 'Accuracy', value: pct(m.accuracy) },
          { label: 'Precision', value: pct(m.precision) },
          { label: 'Recall', value: pct(m.recall) },
          { label: 'F1 Score', value: pct(m.f1) },
          { label: 'False +ve Rate', value: pct(m.fpr) },
        ].map((x) => (
          <div key={x.label} className="rounded-md bg-secondary/60 p-2.5 text-center">
            <dd className="font-mono text-sm font-semibold tabular-nums">{x.value}</dd>
            <dt className="text-[10px] text-muted-foreground">{x.label}</dt>
          </div>
        ))}
      </dl>

      {/* progress + confusion tallies */}
      <div className="mt-3">
        <div className="mb-1 flex justify-between font-mono text-[10px] text-muted-foreground">
          <span>
            {processed.toLocaleString()} / {FLOWS.length.toLocaleString()} flows
          </span>
          <span>
            TP {counts.tp} · TN {counts.tn} · FP {counts.fp} · FN {counts.fn}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-chart-1 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* recent flows */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left font-mono text-[11px]">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-1.5 pr-2 font-medium">Proto/Svc</th>
              <th className="py-1.5 pr-2 font-medium">Bytes (s/d)</th>
              <th className="py-1.5 pr-2 font-medium">TTL</th>
              <th className="py-1.5 pr-2 font-medium">Actual</th>
              <th className="py-1.5 pr-2 font-medium">Model P(attack)</th>
              <th className="py-1.5 font-medium">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((f, i) => {
              const correct = f.actual === f.predicted
              return (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-1.5 pr-2">
                    {f.proto}/{f.service === 'none' ? '–' : f.service}
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">
                    {f.sbytes}/{f.dbytes}
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">
                    {f.sttl}
                  </td>
                  <td className="py-1.5 pr-2">
                    {f.actual === 1 ? (
                      <span className="text-destructive">{f.family}</span>
                    ) : (
                      <span className="text-primary">Benign</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">{pct(f.proba)}</td>
                  <td className="py-1.5">
                    <span
                      className={
                        correct ? 'text-primary' : 'font-semibold text-warning'
                      }
                    >
                      {f.predicted === 1 ? 'ATTACK' : 'BENIGN'}
                      {correct ? ' ✓' : ' ✗'}
                    </span>
                  </td>
                </tr>
              )
            })}
            {recent.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted-foreground">
                  Press “Replay dataset” to stream real UNSW-NB15 test flows through
                  the trained model.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
