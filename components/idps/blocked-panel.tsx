'use client'

import { Ban } from 'lucide-react'
import type { BlockedIp } from '@/lib/idps/types'
import { ATTACK_LABELS } from '@/lib/idps/types'

export function BlockedPanel({
  blocked,
  onUnblock,
}: {
  blocked: BlockedIp[]
  onUnblock: (ip: string) => void
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border p-4 pb-3">
        <Ban className="size-4 text-destructive" aria-hidden="true" />
        <h2 className="text-sm font-semibold">Active Blocklist (IPS)</h2>
        <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {blocked.length}
        </span>
      </div>
      <div className="max-h-64 space-y-1.5 overflow-y-auto p-3">
        {blocked.length === 0 && (
          <p className="p-3 text-center text-xs text-muted-foreground">
            No sources blocked. High/critical detections trigger automatic
            blocking when IPS is active.
          </p>
        )}
        {blocked.map((b) => (
          <div
            key={b.ip}
            className="flex items-center gap-2 rounded-md border border-border bg-secondary/50 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs font-semibold">{b.ip}</p>
              <p className="text-[10px] text-muted-foreground">
                {ATTACK_LABELS[b.reason]} · {b.packetsDropped} pkts dropped
              </p>
            </div>
            <button
              type="button"
              onClick={() => onUnblock(b.ip)}
              className="rounded border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Unblock
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
