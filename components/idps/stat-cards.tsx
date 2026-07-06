'use client'

import { Activity, AlertTriangle, Ban, CheckCircle2 } from 'lucide-react'
import type { EngineMetrics } from '@/lib/idps/types'

export function StatCards({ metrics }: { metrics: EngineMetrics }) {
  const cards = [
    {
      label: 'Packets Analyzed',
      value: metrics.totalPackets.toLocaleString(),
      icon: Activity,
      tone: 'text-foreground',
    },
    {
      label: 'Benign Traffic',
      value: metrics.benign.toLocaleString(),
      icon: CheckCircle2,
      tone: 'text-primary',
    },
    {
      label: 'Threats Detected',
      value: (metrics.malicious + metrics.suspicious).toLocaleString(),
      icon: AlertTriangle,
      tone: 'text-warning',
    },
    {
      label: 'Threats Prevented',
      value: metrics.prevented.toLocaleString(),
      icon: Ban,
      tone: 'text-destructive',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-4"
        >
          <div className={`rounded-md bg-secondary p-2 ${c.tone}`}>
            <c.icon className="size-4" aria-hidden="true" />
          </div>
          <div>
            <p className="font-mono text-xl font-semibold tabular-nums">{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
