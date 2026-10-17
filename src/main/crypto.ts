import crypto from 'node:crypto'
const SCRYPT_OPTIONS = {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024
} as const

export interface WrappedKey {
  salt: string
  iv: string
  tag: string
  ciphertext: string
}

export interface VaultManifest {
  formatVersion: 1
  createdAt: string
  kdf: {
    name: 'scrypt'
    N: number
    r: number
    p: number
  }
  passwordWrap: WrappedKey
  recoveryWrap: WrappedKey
}

export function validatePassword(password: string): void {
  if (password.length < 10) {
    throw new Error('密码至少需要 10 个字符')
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('密码需要同时包含字母和数字')
  }
}

async function deriveKey(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(secret, salt, 32, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey)
    })
  })
}

function wrapMasterKey(masterKey: Buffer, wrappingKey: Buffer): WrappedKey {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', wrappingKey, iv)
  const ciphertext = Buffer.concat([cipher.update(masterKey), cipher.final()])
  return {
    salt: '',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  }
}

function unwrapMasterKey(wrapped: WrappedKey, wrappingKey: Buffer): Buffer {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    wrappingKey,
    Buffer.from(wrapped.iv, 'base64')
  )
  decipher.setAuthTag(Buffer.from(wrapped.tag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(wrapped.ciphertext, 'base64')),
    decipher.final()
  ])
}

const BASE32_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function encodeBase32(buffer: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

function normalizeRecoveryCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/^CI[-\s]*/, '')
    .replace(/[^A-Z2-9]/g, '')
}

function formatRecoveryCode(value: string): string {
  return `CI-${value.match(/.{1,5}/g)?.join('-') ?? value}`
}

export async function createVaultMaterial(password: string): Promise<{
  manifest: VaultManifest
  masterKey: Buffer
  recoveryCode: string
}> {
  validatePassword(password)
  const masterKey = crypto.randomBytes(32)
  const passwordSalt = crypto.randomBytes(16)
  const recoverySalt = crypto.randomBytes(16)
  const recoverySecret = encodeBase32(crypto.randomBytes(32))
  const passwordKey = await deriveKey(password, passwordSalt)
  const recoveryKey = await deriveKey(recoverySecret, recoverySalt)
  const passwordWrap = {
    ...wrapMasterKey(masterKey, passwordKey),
    salt: passwordSalt.toString('base64')
  }
  const recoveryWrap = {
    ...wrapMasterKey(masterKey, recoveryKey),
    salt: recoverySalt.toString('base64')
  }
  passwordKey.fill(0)
  recoveryKey.fill(0)

  return {
    manifest: {
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      kdf: {
        name: 'scrypt',
        N: SCRYPT_OPTIONS.N,
        r: SCRYPT_OPTIONS.r,
        p: SCRYPT_OPTIONS.p
      },
      passwordWrap,
      recoveryWrap
    },
    masterKey,
    recoveryCode: formatRecoveryCode(recoverySecret)
  }
}

export async function unlockWithPassword(
  manifest: VaultManifest,
  password: string
): Promise<Buffer> {
  const key = await deriveKey(password, Buffer.from(manifest.passwordWrap.salt, 'base64'))
  try {
    return unwrapMasterKey(manifest.passwordWrap, key)
  } catch {
    throw new Error('密码不正确')
  } finally {
    key.fill(0)
  }
}

export async function unlockWithRecoveryCode(
  manifest: VaultManifest,
  recoveryCode: string
): Promise<Buffer> {
  const normalized = normalizeRecoveryCode(recoveryCode)
  if (normalized.length < 40) {
    throw new Error('恢复码格式不正确')
  }
  const key = await deriveKey(normalized, Buffer.from(manifest.recoveryWrap.salt, 'base64'))
  try {
    return unwrapMasterKey(manifest.recoveryWrap, key)
  } catch {
    throw new Error('恢复码无效')
  } finally {
    key.fill(0)
  }
}

export async function rewrapPassword(
  manifest: VaultManifest,
  masterKey: Buffer,
  newPassword: string
): Promise<VaultManifest> {
  validatePassword(newPassword)
  const salt = crypto.randomBytes(16)
  const key = await deriveKey(newPassword, salt)
  const wrapped = wrapMasterKey(masterKey, key)
  key.fill(0)
  return {
    ...manifest,
    passwordWrap: {
      ...wrapped,
      salt: salt.toString('base64')
    }
  }
}

export function deriveDatabaseKey(masterKey: Buffer): string {
  return Buffer.from(crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), 'chatinsight-db-v1', 32))
    .toString('hex')
}

export function deriveMediaKey(masterKey: Buffer): Buffer {
  return Buffer.from(
    crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), 'chatinsight-media-v1', 32)
  )
}

export function encryptBuffer(buffer: Buffer, key: Buffer, aad: string): Buffer {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(aad))
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([Buffer.from('CIB1'), iv, tag, ciphertext])
}

export function decryptBuffer(buffer: Buffer, key: Buffer, aad: string): Buffer {
  if (buffer.subarray(0, 4).toString() !== 'CIB1' || buffer.length < 32) {
    throw new Error('加密文件格式无效')
  }
  const iv = buffer.subarray(4, 16)
  const tag = buffer.subarray(16, 32)
  const ciphertext = buffer.subarray(32)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAAD(Buffer.from(aad))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

export function sha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}
