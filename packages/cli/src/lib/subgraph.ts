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
