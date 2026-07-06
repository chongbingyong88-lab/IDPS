'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TrafficPoint } from '@/lib/idps/types'

export function TrafficChart({ data }: { data: TrafficPoint[] }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Live Network Traffic</h2>
        <div className="flex items-center gap-4 font-mono text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-chart-1" aria-hidden="true" />
            Normal
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-chart-3" aria-hidden="true" />
            Suspicious
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-chart-2" aria-hidden="true" />
            Malicious
          </span>
        </div>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--popover)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--popover-foreground)',
              }}
            />
            <Area
              type="monotone"
              dataKey="normal"
              stackId="1"
              stroke="var(--chart-1)"
              fill="var(--chart-1)"
              fillOpacity={0.25}
              strokeWidth={1.5}
              name="Normal"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="suspicious"
              stackId="1"
              stroke="var(--chart-3)"
              fill="var(--chart-3)"
              fillOpacity={0.35}
              strokeWidth={1.5}
              name="Suspicious"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="malicious"
              stackId="1"
              stroke="var(--chart-2)"
              fill="var(--chart-2)"
              fillOpacity={0.4}
              strokeWidth={1.5}
              name="Malicious"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
