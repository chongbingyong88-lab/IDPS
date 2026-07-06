'use client'

import { BellRing, ShieldCheck } from 'lucide-react'
import type { Alert, Severity } from '@/lib/idps/types'
import { ATTACK_LABELS } from '@/lib/idps/types'

const severityStyles: Record<Severity, string> = {
  low: 'bg-secondary text-muted-foreground',
  medium: 'bg-warning/15 text-warning',
  high: 'bg-destructive/15 text-destructive',
  critical: 'bg-destructive text-destructive-foreground',
}

const methodStyles: Record<string, string> = {
  signature: 'border-chart-3/50 text-warning',
  anomaly: 'border-primary/50 text-primary',
  hybrid: 'border-destructive/50 text-destructive',
}

function timeStr(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false })
}

export function AlertFeed({ alerts }: { alerts: Alert[] }) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border p-4 pb-3">
        <BellRing className="size-4 text-destructive" aria-hidden="true" />
        <h2 className="text-sm font-semibold">Threat Alerts</h2>
        <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {alerts.length}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3" style={{ maxHeight: 420 }}>
        {alerts.length === 0 && (
          <p className="p-4 text-center text-xs text-muted-foreground">
            No threats detected yet. Launch an attack from the simulator to see
            the engine respond.
          </p>
        )}
        {alerts.map((a) => (
          <div key={a.id} className="rounded-md border border-border bg-secondary/50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${severityStyles[a.severity]}`}
              >
                {a.severity}
              </span>
              <span className="text-xs font-semibold">
                {ATTACK_LABELS[a.attackType]}
              </span>
              <span
                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${methodStyles[a.method]}`}
              >
                {a.method}
              </span>
              {a.prevented && (
                <span className="flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
                  <ShieldCheck className="size-3" aria-hidden="true" />
                  BLOCKED
                </span>
              )}
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                {timeStr(a.timestamp)}
              </span>
            </div>
            <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
              {a.srcIp} {'->'} {a.dstIp}:{a.dstPort} [{a.protocol}] · anomaly{' '}
              {a.anomalyScore.toFixed(2)} · confidence {(a.confidence * 100).toFixed(0)}%
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-foreground/80">
              {a.explanation}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
