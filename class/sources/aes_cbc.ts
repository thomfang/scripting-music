/**
 * 极简纯 JS AES-128/192/256 + CBC 解密实现（无依赖）。
 *
 * 用途：savetube /v2/info 返回的密文是 AES-128-CBC（IV 前 16 字节），
 * 而 Scripting 的 WebCrypto / 原生 Crypto 仅支持 AES-GCM，故自带 CBC。
 *
 * 仅实现解密所需的 InvCipher 部分；经标准测试向量 + 真机端到端验证。
 */

// ---- AES S-box / 逆 S-box ----
const SBOX = new Uint8Array(256)
const INV_SBOX = new Uint8Array(256)
;(function initSBox() {
  const p: number[] = []
  const q: number[] = []
  // 生成 GF(2^8) 的乘法逆元表（通过 log/antilog）
  let x = 1
  for (let i = 0; i < 256; i++) {
    p[i] = x
    x ^= (x << 1) ^ ((x & 0x80) ? 0x11b : 0)
    x &= 0xff
  }
  // antilog -> log
  const log = new Uint8Array(256)
  const anti = new Uint8Array(256)
  let a = 1
  for (let i = 0; i < 255; i++) {
    anti[i] = a
    log[a] = i
    a ^= (a << 1) ^ ((a & 0x80) ? 0x11b : 0)
    a &= 0xff
  }
  const inv = (b: number) => (b === 0 ? 0 : anti[(255 - log[b]) % 255])
  for (let i = 0; i < 256; i++) {
    let s = inv(i)
    let xf = s
    for (let k = 0; k < 4; k++) {
      s = ((s << 1) | (s >> 7)) & 0xff
      xf ^= s
    }
    xf ^= 0x63
    SBOX[i] = xf & 0xff
    INV_SBOX[xf & 0xff] = i
  }
})()

const RCON = new Uint8Array([0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36, 0x6c, 0xd8, 0xab, 0x4d])

function xtime(a: number): number {
  return ((a << 1) ^ ((a & 0x80) ? 0x11b : 0)) & 0xff
}
function mul(a: number, b: number): number {
  let res = 0
  for (let i = 0; i < 8; i++) {
    if (b & 1) res ^= a
    const hi = a & 0x80
    a = (a << 1) & 0xff
    if (hi) a ^= 0x1b
    b >>= 1
  }
  return res & 0xff
}

/** 密钥扩展。返回 (Nr+1)*16 字节轮密钥。 */
function keyExpansion(key: Uint8Array): Uint8Array {
  const Nk = key.length / 4
  const Nr = Nk + 6
  const totalWords = 4 * (Nr + 1)
  const w = new Uint8Array(totalWords * 4)
  w.set(key)
  let rcon = 0
  for (let i = Nk; i < totalWords; i++) {
    const base = i * 4
    let t0 = w[(i - 1) * 4 + 0]
    let t1 = w[(i - 1) * 4 + 1]
    let t2 = w[(i - 1) * 4 + 2]
    let t3 = w[(i - 1) * 4 + 3]
    if (i % Nk === 0) {
      // RotWord + SubWord + Rcon
      const a0 = SBOX[t1], a1 = SBOX[t2], a2 = SBOX[t3], a3 = SBOX[t0]
      t0 = a0 ^ RCON[rcon++]
      t1 = a1
      t2 = a2
      t3 = a3
    } else if (Nk > 6 && i % Nk === 4) {
      t0 = SBOX[t0]; t1 = SBOX[t1]; t2 = SBOX[t2]; t3 = SBOX[t3]
    }
    w[base + 0] = w[(i - Nk) * 4 + 0] ^ t0
    w[base + 1] = w[(i - Nk) * 4 + 1] ^ t1
    w[base + 2] = w[(i - Nk) * 4 + 2] ^ t2
    w[base + 3] = w[(i - Nk) * 4 + 3] ^ t3
  }
  return w
}

/** 单块（16 字节）AES 解密，in-place 写回 block。 */
function decryptBlock(block: Uint8Array, roundKeys: Uint8Array, Nr: number) {
  const s = block
  const addRoundKey = (round: number) => {
    const off = round * 16
    for (let i = 0; i < 16; i++) s[i] ^= roundKeys[off + i]
  }
  const invSubBytes = () => {
    for (let i = 0; i < 16; i++) s[i] = INV_SBOX[s[i]]
  }
  const invShiftRows = () => {
    // state 以 column-major：s[r + 4c]
    let t
    // row1 右移1
    t = s[13]; s[13] = s[9]; s[9] = s[5]; s[5] = s[1]; s[1] = t
    // row2 右移2
    t = s[2]; s[2] = s[10]; s[10] = t
    t = s[6]; s[6] = s[14]; s[14] = t
    // row3 右移3 == 左移1
    t = s[3]; s[3] = s[7]; s[7] = s[11]; s[11] = s[15]; s[15] = t
  }
  const invMixColumns = () => {
    for (let c = 0; c < 4; c++) {
      const i = c * 4
      const a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3]
      s[i + 0] = mul(a0, 14) ^ mul(a1, 11) ^ mul(a2, 13) ^ mul(a3, 9)
      s[i + 1] = mul(a0, 9) ^ mul(a1, 14) ^ mul(a2, 11) ^ mul(a3, 13)
      s[i + 2] = mul(a0, 13) ^ mul(a1, 9) ^ mul(a2, 14) ^ mul(a3, 11)
      s[i + 3] = mul(a0, 11) ^ mul(a1, 13) ^ mul(a2, 9) ^ mul(a3, 14)
    }
  }

  addRoundKey(Nr)
  for (let round = Nr - 1; round >= 1; round--) {
    invShiftRows()
    invSubBytes()
    addRoundKey(round)
    invMixColumns()
  }
  invShiftRows()
  invSubBytes()
  addRoundKey(0)
}

/**
 * AES-CBC 解密。
 * @param ciphertext 密文（长度须为 16 的倍数）
 * @param key 16/24/32 字节
 * @param iv 16 字节
 * @param removePadding 是否去除 PKCS#7 padding（默认 true）
 */
export function aesCbcDecrypt(
  ciphertext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
  removePadding = true
): Uint8Array {
  if (ciphertext.length % 16 !== 0) throw new Error("密文长度必须是 16 的倍数")
  if (iv.length !== 16) throw new Error("IV 必须是 16 字节")
  const Nr = key.length / 4 + 6
  const roundKeys = keyExpansion(key)

  const out = new Uint8Array(ciphertext.length)
  let prev = new Uint8Array(iv) // 上一密文块（首块为 IV）
  for (let off = 0; off < ciphertext.length; off += 16) {
    const cipherBlock = ciphertext.slice(off, off + 16)
    const block = cipherBlock.slice() // decryptBlock 写回 block
    decryptBlock(block, roundKeys, Nr)
    for (let i = 0; i < 16; i++) out[off + i] = block[i] ^ prev[i]
    prev = cipherBlock
  }

  if (removePadding) {
    const pad = out[out.length - 1]
    if (pad > 0 && pad <= 16) {
      return out.slice(0, out.length - pad)
    }
  }
  return out
}
