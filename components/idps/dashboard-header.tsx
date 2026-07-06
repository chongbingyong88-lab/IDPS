'use client'

import { Pause, Play, Shield, ShieldOff } from 'lucide-react'

interface DashboardHeaderProps {
  running: boolean
  onToggleRunning: () => void
  preventionEnabled: boolean
  onTogglePrevention: () => void
  baselineSamples: number
}

export function DashboardHeader({
  running,
  onToggleRunning,
  preventionEnabled,
  onTogglePrevention,
  baselineSamples,
}: DashboardHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Shield className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-balance">
            Sentinel AI — Intrusion Detection &amp; Prevention System
          </h1>
          <p className="font-mono text-xs text-muted-foreground">
            Hybrid engine: signatures + online ML anomaly model ({baselineSamples}{' '}
            baseline samples)
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-mono text-xs">
          <span
            className={`size-2 rounded-full ${running ? 'animate-pulse bg-primary' : 'bg-muted-foreground'}`}
            aria-hidden="true"
          />
          {running ? 'LIVE MONITORING' : 'PAUSED'}
        </span>
        <button
          type="button"
          onClick={onToggleRunning}
          className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent"
        >
          {running ? (
            <Pause className="size-3.5" aria-hidden="true" />
          ) : (
            <Play className="size-3.5" aria-hidden="true" />
          )}
          {running ? 'Pause' : 'Resume'}
        </button>
        <button
          type="button"
          onClick={onTogglePrevention}
          aria-pressed={preventionEnabled}
          className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
            preventionEnabled
              ? 'border-primary/40 bg-primary/15 text-primary hover:bg-primary/25'
              : 'border-border bg-secondary text-muted-foreground hover:bg-accent'
          }`}
        >
          {preventionEnabled ? (
            <Shield className="size-3.5" aria-hidden="true" />
          ) : (
            <ShieldOff className="size-3.5" aria-hidden="true" />
          )}
          IPS {preventionEnabled ? 'Active' : 'Detection Only'}
        </button>
      </div>
    </header>
  )
}
