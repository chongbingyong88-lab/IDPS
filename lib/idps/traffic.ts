import type { AttackType, Packet, Protocol } from './types'

let packetCounter = 0

function id() {
  packetCounter += 1
  return `pkt-${Date.now()}-${packetCounter}`
}

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomExternalIp() {
  return `${rand(20, 220)}.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`
}

function internalIp() {
  return `10.0.${rand(0, 4)}.${rand(2, 50)}`
}

const NORMAL_PORTS = [80, 443, 53, 22, 25, 3306, 8080] as const
const NORMAL_PROTOCOLS: Protocol[] = ['HTTP', 'HTTPS', 'DNS', 'TCP', 'SSH']

const NORMAL_PAYLOADS = [
  'GET /index.html HTTP/1.1',
  'GET /api/products?page=2 HTTP/1.1',
  'POST /api/login HTTP/1.1 user=alice',
  'TLS handshake ClientHello',
  'DNS query A example.com',
  'SSH-2.0-OpenSSH_9.6 key exchange',
  'GET /assets/app.js HTTP/1.1',
  'POST /api/orders HTTP/1.1 {"item":42}',
  'HTTP/1.1 200 OK content-type: text/html',
  'DNS query AAAA cdn.example.net',
]

const SQLI_PAYLOADS = [
  "GET /products?id=1' OR '1'='1 HTTP/1.1",
  'GET /search?q=1; DROP TABLE users;-- HTTP/1.1',
  "POST /login user=admin'-- pass=x",
  'GET /item?id=1 UNION SELECT username,password FROM users',
  "GET /page?ref=1' AND SLEEP(5)-- HTTP/1.1",
]

const BRUTE_PAYLOADS = [
  'POST /login user=admin pass=123456 [FAILED]',
  'POST /login user=admin pass=password [FAILED]',
  'POST /login user=root pass=admin123 [FAILED]',
  'SSH auth attempt user=root [FAILED]',
  'POST /wp-login.php user=admin pass=qwerty [FAILED]',
]

/** Generates a batch of benign background traffic packets. */
export function generateNormalTraffic(count: number): Packet[] {
  const packets: Packet[] = []
  for (let i = 0; i < count; i++) {
    const protocol = pick(NORMAL_PROTOCOLS)
    packets.push({
      id: id(),
      timestamp: Date.now(),
      srcIp: Math.random() > 0.4 ? randomExternalIp() : internalIp(),
      dstIp: internalIp(),
      srcPort: rand(30000, 65000),
      dstPort: pick(NORMAL_PORTS),
      protocol,
      bytes: rand(200, 4500),
      flags: protocol === 'TCP' || protocol === 'SSH' ? 'ACK,PSH' : '',
      payload: pick(NORMAL_PAYLOADS),
      label: 'normal',
    })
  }
  return packets
}

/**
 * Generates a burst of packets for a specific attack scenario.
 * The `label` is ground truth used only for evaluating engine accuracy.
 */
export function generateAttackTraffic(type: AttackType): Packet[] {
  const attacker = randomExternalIp()
  const target = internalIp()
  const now = Date.now()
  const packets: Packet[] = []

  switch (type) {
    case 'PORT_SCAN': {
      // Many distinct destination ports from one source, tiny SYN packets
      const portCount = rand(14, 22)
      for (let i = 0; i < portCount; i++) {
        packets.push({
          id: id(),
          timestamp: now,
          srcIp: attacker,
          dstIp: target,
          srcPort: rand(40000, 65000),
          dstPort: rand(1, 1024),
          protocol: 'TCP',
          bytes: rand(40, 80),
          flags: 'SYN',
          payload: 'TCP SYN probe',
          label: 'PORT_SCAN',
        })
      }
      break
    }
    case 'SYN_FLOOD': {
      // Very high rate of SYN packets to one port
      const burst = rand(25, 40)
      for (let i = 0; i < burst; i++) {
        packets.push({
          id: id(),
          timestamp: now,
          srcIp: Math.random() > 0.5 ? attacker : randomExternalIp(),
          dstIp: target,
          srcPort: rand(1024, 65000),
          dstPort: 80,
          protocol: 'TCP',
          bytes: rand(40, 60),
          flags: 'SYN',
          payload: 'TCP SYN (no ACK follow-up)',
          label: 'SYN_FLOOD',
        })
      }
      break
    }
    case 'SQL_INJECTION': {
      const count = rand(3, 6)
      for (let i = 0; i < count; i++) {
        packets.push({
          id: id(),
          timestamp: now,
          srcIp: attacker,
          dstIp: target,
          srcPort: rand(30000, 65000),
          dstPort: pick([80, 443, 8080]),
          protocol: 'HTTP',
          bytes: rand(400, 900),
          flags: 'ACK,PSH',
          payload: pick(SQLI_PAYLOADS),
          label: 'SQL_INJECTION',
        })
      }
      break
    }
    case 'BRUTE_FORCE': {
      const attempts = rand(10, 16)
      for (let i = 0; i < attempts; i++) {
        packets.push({
          id: id(),
          timestamp: now,
          srcIp: attacker,
          dstIp: target,
          srcPort: rand(30000, 65000),
          dstPort: pick([22, 80, 443]),
          protocol: pick(['SSH', 'HTTP'] as Protocol[]),
          bytes: rand(150, 350),
          flags: 'ACK,PSH',
          payload: pick(BRUTE_PAYLOADS),
          label: 'BRUTE_FORCE',
        })
      }
      break
    }
    case 'DATA_EXFILTRATION': {
      // Abnormally large outbound transfers to an external host
      const chunks = rand(5, 9)
      for (let i = 0; i < chunks; i++) {
        packets.push({
          id: id(),
          timestamp: now,
          srcIp: target,
          dstIp: attacker,
          srcPort: rand(30000, 65000),
          dstPort: pick([443, 53, 8443]),
          protocol: pick(['HTTPS', 'DNS'] as Protocol[]),
          bytes: rand(48000, 120000),
          flags: 'ACK,PSH',
          payload:
            i % 2 === 0
              ? 'Outbound encrypted blob (base64, 96KB)'
              : 'DNS TXT query x9f2...a71b.tunnel.example',
          label: 'DATA_EXFILTRATION',
        })
      }
      break
    }
    case 'ZERO_DAY': {
      // No known signature: unusual protocol/port/size combination.
      // Only the ML anomaly engine can catch this.
      const count = rand(6, 10)
      for (let i = 0; i < count; i++) {
        packets.push({
          id: id(),
          timestamp: now,
          srcIp: attacker,
          dstIp: target,
          srcPort: rand(1, 1024),
          dstPort: rand(49152, 65535),
          protocol: 'UDP',
          bytes: rand(9000, 30000),
          flags: 'URG',
          payload: 'Obfuscated binary payload (entropy 7.98)',
          label: 'ZERO_DAY',
        })
      }
      break
    }
  }
  return packets
}
