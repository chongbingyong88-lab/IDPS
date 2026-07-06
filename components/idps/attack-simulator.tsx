'use client'

import {
  Crosshair,
  DatabaseZap,
  FileWarning,
  KeyRound,
  Radar,
  Waves,
} from 'lucide-react'
import { useState } from 'react'
import type { AttackType } from '@/lib/idps/types'
import { ATTACK_LABELS } from '@/lib/idps/types'

const ATTACKS: {
  type: AttackType
  icon: typeof Radar
  description: string
}[] = [
  {
    type: 'PORT_SCAN',
    icon: Radar,
    description: 'Probe many ports from one source (recon)',
  },
  {
    type: 'SYN_FLOOD',
    icon: Waves,
    description: 'High-rate SYN packets to exhaust the target',
  },
  {
    type: 'SQL_INJECTION',
    icon: DatabaseZap,
    description: 'Malicious SQL in HTTP payloads',
  },
  {
    type: 'BRUTE_FORCE',
    icon: KeyRound,
    description: 'Rapid repeated login failures',
  },
  {
    type: 'DATA_EXFILTRATION',
    icon: FileWarning,
    description: 'Abnormal outbound data volume / DNS tunnel',
  },
  {
    type: 'ZERO_DAY',
    icon: Crosshair,
    description: 'No signature exists — only the ML model can catch it',
  },
]

export function AttackSimulator({
  onLaunch,
}: {
  onLaunch: (type: AttackType) => void
}) {
  const [lastLaunched, setLastLaunched] = useState<AttackType | null>(null)

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Attack Simulator</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Inject attack traffic into the stream to demonstrate detection &amp;
        prevention.
      </p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-2">
        {ATTACKS.map((a) => (
          <button
            key={a.type}
            type="button"
            onClick={() => {
              onLaunch(a.type)
              setLastLaunched(a.type)
            }}
            title={a.description}
            className={`flex items-center gap-2 rounded-md border px-3 py-2.5 text-left text-xs font-medium transition-colors ${
              lastLaunched === a.type
                ? 'border-destructive/50 bg-destructive/15 text-destructive-foreground'
                : 'border-border bg-secondary text-secondary-foreground hover:border-destructive/40 hover:bg-destructive/10'
            }`}
          >
            <a.icon className="size-4 shrink-0 text-destructive" aria-hidden="true" />
            <span>
              {ATTACK_LABELS[a.type]}
              <span className="mt-0.5 block font-normal text-muted-foreground text-[10px] leading-tight">
                {a.description}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
