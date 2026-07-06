'use client'

import { useIdps } from '@/hooks/use-idps'
import { AlertFeed } from './alert-feed'
import { AttackSimulator } from './attack-simulator'
import { BlockedPanel } from './blocked-panel'
import { DashboardHeader } from './dashboard-header'
import { EnginePanel } from './engine-panel'
import { PacketLog } from './packet-log'
import { StatCards } from './stat-cards'
import { TrafficChart } from './traffic-chart'

export function IdpsDashboard() {
  const {
    running,
    setRunning,
    preventionEnabled,
    setPreventionEnabled,
    log,
    alerts,
    blocked,
    metrics,
    chart,
    attackDist,
    launchAttack,
    unblockIp,
    baselineSamples,
  } = useIdps()

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-4 p-4 md:p-6">
      <DashboardHeader
        running={running}
        onToggleRunning={() => setRunning(!running)}
        preventionEnabled={preventionEnabled}
        onTogglePrevention={() => setPreventionEnabled(!preventionEnabled)}
        baselineSamples={baselineSamples}
      />

      <StatCards metrics={metrics} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <TrafficChart data={chart} />
          <EnginePanel metrics={metrics} attackDist={attackDist} />
          <PacketLog log={log} />
        </div>
        <div className="flex flex-col gap-4">
          <AttackSimulator onLaunch={launchAttack} />
          <AlertFeed alerts={alerts} />
          <BlockedPanel blocked={blocked} onUnblock={unblockIp} />
        </div>
      </div>

      <footer className="border-t border-border pt-4 pb-2 text-center font-mono text-[11px] text-muted-foreground">
        Prototype demonstration — hybrid AI-driven IDPS: signature rules + online
        statistical ML anomaly detection + ensemble fusion with automated
        prevention. Traffic is simulated.
      </footer>
    </main>
  )
}
