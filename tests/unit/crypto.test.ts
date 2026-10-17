import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createVaultMaterial,
  decryptBuffer,
  deriveMediaKey,
  encryptBuffer,
  rewrapPassword,
  unlockWithPassword,
  unlockWithRecoveryCode
} from '../../src/main/crypto'

describe('vault cryptography', () => {
  it('unlocks with password and recovery code, then rotates the password', async () => {
    const material = await createVaultMaterial('OldPassword123')
    const passwordKey = await unlockWithPassword(material.manifest, 'OldPassword123')
    expect(passwordKey.equals(material.masterKey)).toBe(true)
    passwordKey.fill(0)

    await expect(unlockWithPassword(material.manifest, 'WrongPassword123')).rejects.toThrow(
      '密码不正确'
    )
    const recoveryKey = await unlockWithRecoveryCode(
      material.manifest,
      material.recoveryCode
    )
    expect(recoveryKey.equals(material.masterKey)).toBe(true)
    recoveryKey.fill(0)

    const rotated = await rewrapPassword(
      material.manifest,
      material.masterKey,
      'NewPassword456'
    )
    const newKey = await unlockWithPassword(rotated, 'NewPassword456')
    expect(newKey.equals(material.masterKey)).toBe(true)
    newKey.fill(0)
    await expect(unlockWithPassword(rotated, 'OldPassword123')).rejects.toThrow()

    const stillRecoverable = await unlockWithRecoveryCode(rotated, material.recoveryCode)
    expect(stillRecoverable.equals(material.masterKey)).toBe(true)
    stillRecoverable.fill(0)
    material.masterKey.fill(0)
  })

  it('encrypts media with authenticated encryption', () => {
    const key = deriveMediaKey(crypto.randomBytes(32))
    const source = Buffer.from('一段不会以明文出现的聊天记录', 'utf8')
    const encrypted = encryptBuffer(source, key, 'asset-id')
    expect(encrypted.includes(source)).toBe(false)
    expect(decryptBuffer(encrypted, key, 'asset-id').toString('utf8')).toBe(
      source.toString('utf8')
    )
    expect(() => decryptBuffer(encrypted, key, 'different-asset')).toThrow()

    const tampered = Buffer.from(encrypted)
    tampered[tampered.length - 1] ^= 1
    expect(() => decryptBuffer(tampered, key, 'asset-id')).toThrow()
    key.fill(0)
  })
})
