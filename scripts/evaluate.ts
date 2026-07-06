/**
 * Offline evaluation harness for the hybrid detection engine.
 * Runs N trials: pretrains a baseline, streams benign traffic mixed with
 * labeled attack bursts, and reports confusion-matrix metrics per attack type.
 *
 * Run with: npx tsx scripts/evaluate.ts
 */
import { DetectionEngine } from '../lib/idps/engine'
import { generateAttackTraffic, generateNormalTraffic } from '../lib/idps/traffic'
import type { AttackType, Packet } from '../lib/idps/types'

const ATTACK_TYPES: AttackType[] = [
  'PORT_SCAN',
  'SYN_FLOOD',
  'SQL_INJECTION',
  'BRUTE_FORCE',
  'DATA_EXFILTRATION',
  'ZERO_DAY',
]

const TRIALS = 10
const BENIGN_PER_TRIAL = 500
const BURSTS_PER_ATTACK = 5

interface Counts {
  tp: number
  fp: number
  tn: number
  fn: number
}

const overall: Counts = { tp: 0, fp: 0, tn: 0, fn: 0 }
const perAttack = new Map<AttackType, { detected: number; missed: number; prevented: number }>()
for (const t of ATTACK_TYPES) perAttack.set(t, { detected: 0, missed: 0, prevented: 0 })
const byMethod = { signature: 0, anomaly: 0, hybrid: 0 }

for (let trial = 0; trial < TRIALS; trial++) {
  const engine = new DetectionEngine()
  engine.pretrain(generateNormalTraffic(300))

  // Build interleaved stream: benign background with attack bursts injected
  const stream: Packet[] = []
  const benign = generateNormalTraffic(BENIGN_PER_TRIAL)
  const bursts: Packet[][] = []
  for (const type of ATTACK_TYPES) {
    for (let b = 0; b < BURSTS_PER_ATTACK; b++) {
      bursts.push(generateAttackTraffic(type))
    }
  }
  // Interleave: inject each burst at a random offset in the benign stream
  let bi = 0
  for (let i = 0; i < benign.length; i++) {
    stream.push(benign[i])
    if (bi < bursts.length && i > 0 && i % Math.floor(benign.length / bursts.length) === 0) {
      stream.push(...bursts[bi])
      bi++
    }
  }
  while (bi < bursts.length) stream.push(...bursts[bi++])

  for (const p of stream) {
    // Skip packets from already-blocked sources (IPS drop = successful prevention)
    if (engine.isBlocked(p.srcIp)) {
      if (p.label !== 'normal') {
        overall.tp++
        const s = perAttack.get(p.label)!
        s.detected++
        s.prevented++
      } else {
        overall.fp++
      }
      continue
    }
    const d = engine.analyze(p)
    const flagged = d.verdict !== 'benign'
    if (p.label === 'normal') {
      if (flagged) overall.fp++
      else overall.tn++
    } else {
      const s = perAttack.get(p.label)!
      if (flagged) {
        overall.tp++
        s.detected++
        if (d.prevented) s.prevented++
        byMethod[d.method]++
      } else {
        overall.fn++
        s.missed++
      }
    }
  }
}

const { tp, fp, tn, fn } = overall
const accuracy = (tp + tn) / (tp + tn + fp + fn)
const precision = tp / (tp + fp)
const recall = tp / (tp + fn)
const f1 = (2 * precision * recall) / (precision + recall)
const fpr = fp / (fp + tn)

console.log(`\n=== Overall (${TRIALS} trials, ${tp + tn + fp + fn} packets) ===`)
console.log(`TP=${tp}  FP=${fp}  TN=${tn}  FN=${fn}`)
console.log(`Accuracy : ${(accuracy * 100).toFixed(2)}%`)
console.log(`Precision: ${(precision * 100).toFixed(2)}%`)
console.log(`Recall   : ${(recall * 100).toFixed(2)}%`)
console.log(`F1-score : ${(f1 * 100).toFixed(2)}%`)
console.log(`FPR      : ${(fpr * 100).toFixed(2)}%`)

console.log(`\n=== Per-attack detection rate ===`)
for (const [type, s] of perAttack) {
  const total = s.detected + s.missed
  const rate = total > 0 ? ((s.detected / total) * 100).toFixed(1) : 'n/a'
  const prevRate = total > 0 ? ((s.prevented / total) * 100).toFixed(1) : 'n/a'
  console.log(
    `${type.padEnd(18)} detected ${String(s.detected).padStart(4)}/${String(total).padEnd(4)} (${rate}%)  auto-prevented ${prevRate}%`,
  )
}

console.log(`\n=== Detections by method (first-pass, pre-block) ===`)
const mTotal = byMethod.signature + byMethod.anomaly + byMethod.hybrid
console.log(`Signature: ${byMethod.signature} (${((byMethod.signature / mTotal) * 100).toFixed(1)}%)`)
console.log(`Anomaly  : ${byMethod.anomaly} (${((byMethod.anomaly / mTotal) * 100).toFixed(1)}%)`)
console.log(`Hybrid   : ${byMethod.hybrid} (${((byMethod.hybrid / mTotal) * 100).toFixed(1)}%)`)
