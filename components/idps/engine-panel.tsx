'use client'

import { BrainCircuit } from 'lucide-react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AttackDistribution, EngineMetrics } from '@/lib/idps/types'
import { ATTACK_LABELS } from '@/lib/idps/types'

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`
}

export function EnginePanel({
  metrics,
  attackDist,
}: {
  metrics: EngineMetrics
  attackDist: AttackDistribution[]
}) {
  const { truePositives: tp, falsePositives: fp, trueNegatives: tn, falseNegatives: fn } =
    metrics
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0
  const accuracy = tp + fp + tn + fn > 0 ? (tp + tn) / (tp + fp + tn + fn) : 0
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
  const fpr = fp + tn > 0 ? fp / (fp + tn) : 0

  const totalDetections = metrics.bySignature + metrics.byAnomaly + metrics.byHybrid

  const methodRows = [
    { label: 'Signature engine', value: metrics.bySignature, color: 'bg-chart-3' },
    { label: 'ML anomaly engine', value: metrics.byAnomaly, color: 'bg-chart-1' },
    { label: 'Hybrid (ensemble)', value: metrics.byHybrid, color: 'bg-chart-2' },
  ]

  const distData = attackDist.map((d) => ({
    name: ATTACK_LABELS[d.type],
    count: d.count,
  }))

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <BrainCircuit className="size-4 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-semibold">Detection Engine Performance</h2>
      </div>

      <dl className="grid grid-cols-3 gap-2 md:grid-cols-5">
        {[
          { label: 'Accuracy', value: pct(accuracy) },
          { label: 'Precision', value: pct(precision) },
          { label: 'Recall', value: pct(recall) },
          { label: 'F1 Score', value: pct(f1) },
          { label: 'False +ve Rate', value: pct(fpr) },
        ].map((m) => (
          <div key={m.label} className="rounded-md bg-secondary/60 p-2.5 text-center">
            <dd className="font-mono text-sm font-semibold tabular-nums">{m.value}</dd>
            <dt className="text-[10px] text-muted-foreground">{m.label}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">
            Detections by method
          </h3>
          <div className="space-y-2">
            {methodRows.map((r) => {
              const share = totalDetections > 0 ? r.value / totalDetections : 0
              return (
                <div key={r.label}>
                  <div className="mb-1 flex justify-between font-mono text-[11px]">
                    <span>{r.label}</span>
                    <span className="text-muted-foreground">
                      {r.value} ({pct(share)})
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full rounded-full ${r.color}`}
                      style={{ width: `${Math.max(share * 100, r.value > 0 ? 3 : 0)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">
            Attack type distribution
          </h3>
          {distData.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No attacks classified yet.
            </p>
          ) : (
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distData} layout="vertical" margin={{ left: 0, right: 8 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--secondary)' }}
                    contentStyle={{
                      backgroundColor: 'var(--popover)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 12,
                      color: 'var(--popover-foreground)',
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="var(--chart-2)"
                    radius={[0, 3, 3, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
