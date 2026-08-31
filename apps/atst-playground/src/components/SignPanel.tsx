'use client'

import type { ClaimMode } from '@/lib/reconstruct'
import type { Handoff } from '@/lib/trace'
import {
  defaultAttesterEnsForName,
  encodeEnvelope,
  handleAttestationRecordKey,
  signHandleClaim,
  signUidClaim,
  uidAttestationRecordKey,
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
  const [mode, setMode] = useState<ClaimMode>('handle')
  const [name, setName] = useState('example.eth')
  const [addr, setAddr] = useState('')
  const [platform, setPlatform] = useState('com.x')
  const [identifier, setIdentifier] = useState('')
  const [attester, setAttester] = useState(defaultAttesterEnsForName('example.eth'))
  const [signed, setSigned] = useState<Signed | null>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * The subject's manager address defaults to the burner, so the tab can sign
   * straight away. It means the attester is attesting about its own address,
   * which no real issuance would do — override it with the manager you want.
   */
  function newKey() {
    const key = generatePrivateKey()
    setPrivateKey(key)
    setAddr(privateKeyToAccount(key).address)
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
      const envelope =
        mode === 'handle'
          ? await signHandleClaim({ ...input, handle: identifier }, wallet)
          : await signUidClaim({ ...input, uid: identifier }, wallet)

      setSigned({
        envelopeHex: bytesToHex(encodeEnvelope(envelope)),
        issuedAt: envelope.issuedAt,
        recordKey:
          mode === 'handle'
            ? handleAttestationRecordKey(platform, attester)
            : uidAttestationRecordKey(platform, attester),
        signer: account.address,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signing failed.')
    }
  }

  return (
    <div className="space-y-4">
      <Panel title="Attester key">
        <p className="mb-3 text-muted">
          A throwaway key held in this tab. It stands in for the attester's signing key, which in
          production sits behind the OAuth flow of Section 5.
        </p>
        <Field label="Private key">
          <input value={privateKey} onChange={(e) => setPrivateKey(e.target.value as Hex)} />
        </Field>
        <div className="mt-3 flex items-center gap-3">
          <GhostButton onClick={newKey}>Generate new key</GhostButton>
          {account ? <span className="break-all text-muted">{account.address}</span> : null}
        </div>
      </Panel>

      <Panel title="Payload">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Claim type">
            <select value={mode} onChange={(e) => setMode(e.target.value as ClaimMode)}>
              <option value="handle">handle (h)</option>
              <option value="uid">uid (u)</option>
            </select>
          </Field>
          <Field label="Name (n)">
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
          <Field
            label="Address (a)"
            hint="The manager of the name at issuance. Prefilled with the burner address."
          >
            <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="0x…" />
          </Field>
          <Field label="Platform (p)">
            <input value={platform} onChange={(e) => setPlatform(e.target.value)} />
          </Field>
          <Field label={mode === 'handle' ? 'Handle (h)' : 'UID (u)'}>
            <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
          </Field>
          <Field
            label="Attester ENS name"
            hint="Names the record key. It is not part of the signed payload."
          >
            <input value={attester} onChange={(e) => setAttester(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4">
          <Button onClick={sign} disabled={!account || identifier.trim().length === 0}>
            Sign claim
          </Button>
        </div>
        {error ? (
          <p className="mt-3" style={{ color: 'var(--fail)' }}>
            {error}
          </p>
        ) : null}
      </Panel>

      {signed ? (
        <Panel title="Envelope">
          <Rows
            rows={[
              ['record key', signed.recordKey],
              [
                'issuedAt (t)',
                `${signed.issuedAt} — ${new Date(signed.issuedAt * 1000).toISOString()}`,
              ],
              ['signer', signed.signer],
              ['envelope', signed.envelopeHex],
            ]}
          />
          <div className="mt-4 border-t border-rule pt-3">
            <Button
              onClick={() =>
                onInspect({
                  mode,
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
              Publishing this would mean writing the envelope to the record key above on the
              subject's name.
            </p>
          </div>
        </Panel>
      ) : null}
    </div>
  )
}
