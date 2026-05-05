const SUBGRAPH_ENDPOINT = 'https://api.alpha.ensnode.io/subgraph'

const RESOLVE_DOMAIN_QUERY = `
  query ResolveDomainByName($name: String!) {
    domains(where: { name: $name }) {
      id
      name
      resolver {
        address
        texts
      }
      resolvedAddress {
        id
      }
      ownerId
      wrappedOwnerId
    }
  }
`

export type SubgraphDomain = {
  id: string
  name: string | null
  resolver: { address: string; texts: string[] } | null
  resolvedAddress: { id: string } | null
  ownerId: string
  wrappedOwnerId: string
}

export async function queryDomain(name: string): Promise<SubgraphDomain | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const res = await fetch(SUBGRAPH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: RESOLVE_DOMAIN_QUERY, variables: { name } }),
      signal: controller.signal,
    })
    const json = (await res.json()) as { data?: { domains?: SubgraphDomain[] } }
    return json.data?.domains?.[0] ?? null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Strict variant of `queryDomain`. Throws on network errors, non-2xx
 * responses, and GraphQL errors so the caller can distinguish "indexer
 * unreachable" from "domain not indexed". Returns `null` only when the
 * indexer responded successfully but had no record of the name.
 */
export async function queryDomainStrict(name: string): Promise<SubgraphDomain | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  let res: Response
  try {
    res = await fetch(SUBGRAPH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: RESOLVE_DOMAIN_QUERY, variables: { name } }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeout)
    throw new Error(
      `ENSNode request failed for ${name}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  clearTimeout(timeout)

  if (!res.ok) {
    throw new Error(`ENSNode request failed for ${name}: HTTP ${res.status} ${res.statusText}`)
  }

  let json: {
    data?: { domains?: SubgraphDomain[] }
    errors?: Array<{ message: string }>
  }
  try {
    json = (await res.json()) as {
      data?: { domains?: SubgraphDomain[] }
      errors?: Array<{ message: string }>
    }
  } catch (err) {
    throw new Error(
      `ENSNode response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (json.errors && json.errors.length > 0) {
    const messages = json.errors.map((e) => e.message).join('; ')
    throw new Error(`ENSNode returned errors for ${name}: ${messages}`)
  }

  return json.data?.domains?.[0] ?? null
}
