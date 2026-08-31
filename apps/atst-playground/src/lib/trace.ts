/**
 * A verification trace: one entry per step of Section 7 of the ATST spec,
 * carrying the intermediate values that step produced. The point of the
 * playground is that these values are visible — a plain valid/invalid
 * verdict tells you nothing about which reconstruction went wrong.
 */

export type StepStatus = 'ok' | 'fail' | 'skipped'

export interface TraceStep {
  /** Step number as written in Section 7 of the spec. */
  n: number
  label: string
  status: StepStatus
  /** Label/value pairs produced by this step. */
  detail: Array<[string, string]>
  note?: string
}

export interface VerifyTrace {
  valid: boolean
  reason?: string
  steps: TraceStep[]
  /**
   * Everything the inspector needs to replay this attestation locally.
   * Present once the envelope decoded, valid or not — a failed verification
   * is the more interesting thing to take apart.
   */
  handoff?: Handoff
}

export interface Handoff {
  mode: 'handle' | 'uid'
  envelopeHex: string
  name: string
  addr: string
  platform: string
  identifier: string
  issuedAt: number
  /** Prefills the inspector's comparison field when the address is known. */
  expectedAttester?: string
}

export interface VerifyRequest {
  name: string
  platform: string
  attester: string
  mode: 'handle' | 'uid'
  /** Required in uid mode: Section 9 leaves how the verifier gets it out of scope. */
  uid?: string
}
