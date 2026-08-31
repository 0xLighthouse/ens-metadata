'use client'

import type { Handoff } from '@/lib/trace'
import {
  defaultAttesterEnsForName,
  encodeEnvelope,
  handleAttestationRecordKey,
  signHandleClaim,
} from '@ensmetadata/sdk'
import { useEffect, useState } from 'react'
import { http, type Address, type Hex, bytesToHex, createWalletClient, isAddress } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { Button, Field, GhostButton, Panel, Rows } from './ui'

interface Signed {
  envelopeHex: string
  issuedAt: number
  recordKey: string
  signer: Address
}

export function SignPanel({ onInspect }: { onInspect: (handoff: Handoff) => void }) {
  const [privateKey, setPrivateKey] = useState<Hex | ''>('')
  const [name, setName] = useState('user.eth')
  const [addr, setAddr] = useState('')
  const [platform, setPlatform] = useState('com.x')
  const [identifier, setIdentifier] = useState('')
  const [attester, setAttester] = useState('atst.attester.eth')
  const [signed, setSigned] = useState<Signed | null>(null)
  const [error, setError] = useState<string | null>(null)

  function newKey() {
    const key = generatePrivateKey()
    setPrivateKey(key)
  }

  // Generated after mount: a key produced during render would differ between
  // the server and client trees.
  useEffect(() => {
    newKey()
  }, [])

  const account = privateKey ? privateKeyToAccount(privateKey) : null

  async function sign() {
    if (!account) return
    setError(null)
    setSigned(null)
    try {
      if (!isAddress(addr)) throw new Error('Address (a) must be a 20-byte hex address.')
      const wallet = createWalletClient({ account, chain: mainnet, transport: http() })
      const input = { name, addr: addr as Address, platform }
      const envelope = await signHandleClaim({ ...input, handle: identifier }, wallet)

      setSigned({
        envelopeHex: bytesToHex(encodeEnvelope(envelope)),
        issuedAt: envelope.issuedAt,
        recordKey: handleAttestationRecordKey(platform, attester),
        signer: account.address,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signing failed.')
    }
  }

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Field label="Attester's private key">
              <input value={privateKey} onChange={(e) => setPrivateKey(e.target.value as Hex)} />
            </Field>
          </div>
          <GhostButton onClick={newKey}>Generate new key</GhostButton>
        </div>
        <div className="mt-3">
          <Field label="Attester's address">
            <div className="break-all">{account?.address ?? ''}</div>
          </Field>
        </div>
      </Panel>

      <Panel title="Payload">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="User ENS Name (n)">
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                try {
                  setAttester(defaultAttesterEnsForName(e.target.value))
                } catch {
                  // leave the attester as typed until the name normalizes
                }
              }}
            />
          </Field>
          <Field label="User Address (a)">
            <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="0x…" />
          </Field>
          <Field label="Text record key (Social media platform) (k)">
            <input value={platform} onChange={(e) => setPlatform(e.target.value)} />
          </Field>
          <Field label="Attested Value (v)">
            <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
          </Field>
          <Field label="Attester ENS Name">
            <input value={attester} onChange={(e) => setAttester(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4">
          <Button onClick={sign} disabled={!account || identifier.trim().length === 0}>
            Sign Attestation
          </Button>
        </div>
        {error ? (
          <p className="mt-3" style={{ color: 'var(--fail)' }}>
            {error}
          </p>
        ) : null}
      </Panel>

      {signed ? (
        <Panel title="Attestation">
          <Rows
            rows={[
              ['record key', signed.recordKey],
              [
                'issuedAt (t)',
                `${signed.issuedAt} — ${new Date(signed.issuedAt * 1000).toISOString()}`,
              ],
              ['signer', signed.signer],
              ['attestation', signed.envelopeHex],
            ]}
          />
          <div className="mt-4 border-t border-rule pt-3">
            <Button
              onClick={() =>
                onInspect({
                  mode: 'handle',
                  envelopeHex: signed.envelopeHex,
                  name,
                  addr,
                  platform,
                  identifier,
                  issuedAt: signed.issuedAt,
                  expectedAttester: signed.signer,
                })
              }
            >
              Open in inspector →
            </Button>
            <p className="mt-2 text-muted">
              Publishing this would mean writing the attestation to the record key above on the
              subject's name.
            </p>
          </div>
        </Panel>
      ) : null}
    </div>
  )
}
