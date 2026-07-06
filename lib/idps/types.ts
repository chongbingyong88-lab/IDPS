export type Protocol = 'TCP' | 'UDP' | 'ICMP' | 'HTTP' | 'HTTPS' | 'SSH' | 'DNS'

export type AttackType =
  | 'PORT_SCAN'
  | 'SYN_FLOOD'
  | 'SQL_INJECTION'
  | 'BRUTE_FORCE'
  | 'DATA_EXFILTRATION'
  | 'ZERO_DAY'

export type Severity = 'low' | 'medium' | 'high' | 'critical'

export type Verdict = 'benign' | 'suspicious' | 'malicious'

export type DetectionMethod = 'signature' | 'anomaly' | 'hybrid'

export interface Packet {
  id: string
  timestamp: number
  srcIp: string
  dstIp: string
  srcPort: number
  dstPort: number
  protocol: Protocol
  bytes: number
  flags: string
  payload: string
  /** ground-truth label from the simulator (hidden from the engine, used for metrics) */
  label: 'normal' | AttackType
}

export interface Detection {
  packet: Packet
  verdict: Verdict
  method: DetectionMethod
  signatureMatch: string | null
  anomalyScore: number // 0..1
  confidence: number // 0..1
  severity: Severity
  attackType: AttackType | null
  explanation: string
  prevented: boolean
}

export interface Alert {
  id: string
  timestamp: number
  srcIp: string
  dstIp: string
  dstPort: number
  protocol: Protocol
  attackType: AttackType
  severity: Severity
  method: DetectionMethod
  signatureMatch: string | null
  anomalyScore: number
  confidence: number
  explanation: string
  prevented: boolean
}

export interface BlockedIp {
  ip: string
  reason: AttackType
  blockedAt: number
  packetsDropped: number
}

export interface EngineMetrics {
  totalPackets: number
  benign: number
  suspicious: number
  malicious: number
  prevented: number
  truePositives: number
  falsePositives: number
  trueNegatives: number
  falseNegatives: number
  bySignature: number
  byAnomaly: number
  byHybrid: number
}

export interface TrafficPoint {
  time: string
  normal: number
  suspicious: number
  malicious: number
}

export interface AttackDistribution {
  type: AttackType
  count: number
}

export const ATTACK_LABELS: Record<AttackType, string> = {
  PORT_SCAN: 'Port Scan',
  SYN_FLOOD: 'SYN Flood (DoS)',
  SQL_INJECTION: 'SQL Injection',
  BRUTE_FORCE: 'Brute Force',
  DATA_EXFILTRATION: 'Data Exfiltration',
  ZERO_DAY: 'Zero-Day Anomaly',
}
