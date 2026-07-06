'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { DetectionEngine } from '@/lib/idps/engine'
import { generateAttackTraffic, generateNormalTraffic } from '@/lib/idps/traffic'
import type {
  Alert,
  AttackDistribution,
  AttackType,
  BlockedIp,
  Detection,
  EngineMetrics,
  Packet,
  TrafficPoint,
} from '@/lib/idps/types'

const TICK_MS = 900
const MAX_LOG = 60
const MAX_ALERTS = 50
const MAX_CHART_POINTS = 30

export interface LogEntry {
  detection: Detection
  dropped: boolean
}

const initialMetrics: EngineMetrics = {
  totalPackets: 0,
  benign: 0,
  suspicious: 0,
  malicious: 0,
  prevented: 0,
  truePositives: 0,
  falsePositives: 0,
  trueNegatives: 0,
  falseNegatives: 0,
  bySignature: 0,
  byAnomaly: 0,
  byHybrid: 0,
}

export function useIdps() {
  const engineRef = useRef<DetectionEngine | null>(null)
  if (!engineRef.current) {
    const engine = new DetectionEngine()
    engine.pretrain(generateNormalTraffic(300))
    engineRef.current = engine
  }

  const [running, setRunning] = useState(true)
  const [preventionEnabled, setPreventionEnabled] = useState(true)
  const [log, setLog] = useState<LogEntry[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [blocked, setBlocked] = useState<BlockedIp[]>([])
  const [metrics, setMetrics] = useState<EngineMetrics>(initialMetrics)
  const [chart, setChart] = useState<TrafficPoint[]>([])
  const [attackDist, setAttackDist] = useState<AttackDistribution[]>([])

  const pendingAttackRef = useRef<Packet[]>([])
  const preventionRef = useRef(preventionEnabled)
  preventionRef.current = preventionEnabled

  const processBatch = useCallback((packets: Packet[]) => {
    const engine = engineRef.current
    if (!engine) return

    const newLog: LogEntry[] = []
    const newAlerts: Alert[] = []
    const blockedDelta = new Map<string, { reason: AttackType; drops: number }>()
    let point = { normal: 0, suspicious: 0, malicious: 0 }
    const metricsDelta = { ...initialMetrics }
    const distDelta = new Map<AttackType, number>()

    for (const p of packets) {
      // IPS layer: drop packets from already-blocked sources
      if (preventionRef.current && engine.isBlocked(p.srcIp)) {
        const prev = blockedDelta.get(p.srcIp)
        blockedDelta.set(p.srcIp, {
          reason: prev?.reason ?? (p.label !== 'normal' ? p.label : 'ZERO_DAY'),
          drops: (prev?.drops ?? 0) + 1,
        })
        newLog.push({
          detection: {
            packet: p,
            verdict: 'malicious',
            method: 'hybrid',
            signatureMatch: null,
            anomalyScore: 1,
            confidence: 1,
            severity: 'high',
            attackType: p.label !== 'normal' ? p.label : null,
            explanation: 'Dropped by IPS: source IP is on the active blocklist.',
            prevented: true,
          },
          dropped: true,
        })
        continue
      }

      const d = engine.analyze(p)
      if (!preventionRef.current && d.prevented) {
        engine.unblock(p.srcIp)
        d.prevented = false
      }

      metricsDelta.totalPackets += 1
      if (d.verdict === 'benign') {
        metricsDelta.benign += 1
        point.normal += 1
        if (p.label === 'normal') metricsDelta.trueNegatives += 1
        else metricsDelta.falseNegatives += 1
      } else {
        if (d.verdict === 'suspicious') {
          metricsDelta.suspicious += 1
          point.suspicious += 1
        } else {
          metricsDelta.malicious += 1
          point.malicious += 1
        }
        if (p.label === 'normal') metricsDelta.falsePositives += 1
        else metricsDelta.truePositives += 1

        if (d.method === 'signature') metricsDelta.bySignature += 1
        else if (d.method === 'anomaly') metricsDelta.byAnomaly += 1
        else metricsDelta.byHybrid += 1
      }
      if (d.prevented) metricsDelta.prevented += 1

      if (d.verdict === 'malicious' && d.attackType) {
        distDelta.set(d.attackType, (distDelta.get(d.attackType) ?? 0) + 1)
        newAlerts.push({
          id: p.id,
          timestamp: p.timestamp,
          srcIp: p.srcIp,
          dstIp: p.dstIp,
          dstPort: p.dstPort,
          protocol: p.protocol,
          attackType: d.attackType,
          severity: d.severity,
          method: d.method,
          signatureMatch: d.signatureMatch,
          anomalyScore: d.anomalyScore,
          confidence: d.confidence,
          explanation: d.explanation,
          prevented: d.prevented,
        })
        if (d.prevented) {
          const prev = blockedDelta.get(p.srcIp)
          blockedDelta.set(p.srcIp, {
            reason: d.attackType,
            drops: prev?.drops ?? 0,
          })
        }
      }

      newLog.push({ detection: d, dropped: false })
    }

    setLog((prev) => [...newLog.reverse(), ...prev].slice(0, MAX_LOG))
    if (newAlerts.length > 0) {
      setAlerts((prev) => [...newAlerts.reverse(), ...prev].slice(0, MAX_ALERTS))
    }
    if (blockedDelta.size > 0) {
      setBlocked((prev) => {
        const next = [...prev]
        for (const [ip, info] of blockedDelta) {
          const existing = next.find((b) => b.ip === ip)
          if (existing) {
            existing.packetsDropped += info.drops
          } else {
            next.unshift({
              ip,
              reason: info.reason,
              blockedAt: Date.now(),
              packetsDropped: info.drops,
            })
          }
        }
        return next.slice(0, 20)
      })
    }
    setMetrics((prev) => ({
      totalPackets: prev.totalPackets + metricsDelta.totalPackets,
      benign: prev.benign + metricsDelta.benign,
      suspicious: prev.suspicious + metricsDelta.suspicious,
      malicious: prev.malicious + metricsDelta.malicious,
      prevented: prev.prevented + metricsDelta.prevented,
      truePositives: prev.truePositives + metricsDelta.truePositives,
      falsePositives: prev.falsePositives + metricsDelta.falsePositives,
      trueNegatives: prev.trueNegatives + metricsDelta.trueNegatives,
      falseNegatives: prev.falseNegatives + metricsDelta.falseNegatives,
      bySignature: prev.bySignature + metricsDelta.bySignature,
      byAnomaly: prev.byAnomaly + metricsDelta.byAnomaly,
      byHybrid: prev.byHybrid + metricsDelta.byHybrid,
    }))
    if (distDelta.size > 0) {
      setAttackDist((prev) => {
        const next = [...prev]
        for (const [type, count] of distDelta) {
          const existing = next.find((d) => d.type === type)
          if (existing) existing.count += count
          else next.push({ type, count })
        }
        return next
      })
    }
    setChart((prev) => {
      const time = new Date().toLocaleTimeString('en-US', {
        hour12: false,
        minute: '2-digit',
        second: '2-digit',
      })
      return [...prev, { time, ...point }].slice(-MAX_CHART_POINTS)
    })
  }, [])

  useEffect(() => {
    if (!running) return
    const interval = setInterval(() => {
      const batch = generateNormalTraffic(Math.floor(Math.random() * 4) + 3)
      // Drain a slice of any injected attack burst so it spans a few ticks
      const pending = pendingAttackRef.current
      if (pending.length > 0) {
        const slice = pending.splice(0, Math.min(10, pending.length))
        batch.push(...slice)
      }
      processBatch(batch)
    }, TICK_MS)
    return () => clearInterval(interval)
  }, [running, processBatch])

  const launchAttack = useCallback((type: AttackType) => {
    pendingAttackRef.current.push(...generateAttackTraffic(type))
  }, [])

  const unblockIp = useCallback((ip: string) => {
    engineRef.current?.unblock(ip)
    setBlocked((prev) => prev.filter((b) => b.ip !== ip))
  }, [])

  return {
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
    baselineSamples: engineRef.current.baselineSamples,
  }
}
