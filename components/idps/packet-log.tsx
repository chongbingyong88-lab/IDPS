'use client'

import { Terminal } from 'lucide-react'
import type { LogEntry } from '@/hooks/use-idps'
import type { Verdict } from '@/lib/idps/types'

const verdictStyles: Record<Verdict, string> = {
  benign: 'text-primary',
  suspicious: 'text-warning',
  malicious: 'text-destructive',
}

function timeStr(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false })
}

export function PacketLog({ log }: { log: LogEntry[] }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border p-4 pb-3">
        <Terminal className="size-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-sm font-semibold">Packet Inspection Log</h2>
      </div>
      <div className="max-h-72 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed">
        <table className="w-full">
          <thead className="sr-only">
            <tr>
              <th>Time</th>
              <th>Source</th>
              <th>Destination</th>
              <th>Protocol</th>
              <th>Bytes</th>
              <th>Anomaly score</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {log.map((entry) => {
              const d = entry.detection
              const p = d.packet
              return (
                <tr
                  key={p.id}
                  className={`border-b border-border/50 ${entry.dropped ? 'opacity-45' : ''}`}
                >
                  <td className="py-1 pr-3 text-muted-foreground">
                    {timeStr(p.timestamp)}
                  </td>
                  <td className="py-1 pr-3">{p.srcIp}</td>
                  <td className="hidden py-1 pr-3 md:table-cell">
                    {p.dstIp}:{p.dstPort}
                  </td>
                  <td className="py-1 pr-3 text-muted-foreground">{p.protocol}</td>
                  <td className="hidden py-1 pr-3 text-muted-foreground sm:table-cell">
                    {p.bytes}B
                  </td>
                  <td className="hidden py-1 pr-3 text-muted-foreground lg:table-cell">
                    {d.anomalyScore.toFixed(2)}
                  </td>
                  <td
                    className={`py-1 font-semibold uppercase ${verdictStyles[d.verdict]}`}
                  >
                    {entry.dropped ? 'DROPPED' : d.verdict}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {log.length === 0 && (
          <p className="p-4 text-center text-muted-foreground">
            Waiting for traffic...
          </p>
        )}
      </div>
    </div>
  )
}
