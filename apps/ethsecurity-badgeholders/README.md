# ethsecurity-badgeholders

A public dashboard that lists holders of the ETHSecurity badge alongside the
ENS metadata each of them publishes on-chain, and lets a badgeholder edit
their own records. The badgeholder
list comes from a Dune query, read server-side and cached for an hour, and is
exposed for debugging at `GET /api/badgeholders`, joined with each address's
primary ENS name, tracked text records, and handle attestation state from the
rcrds.xyz API.

The layout follows the `0xLighthouse/platform` web app as deployed at
beta.dao.vote: a header with breadcrumbs and a theme toggle, a rounded content
panel, and a footer, with the same type scale and color tokens. The UI
primitives under `src/components/ui/` are copied from there and from
`apps/interface`, not imported from a shared package.

Every visitor sees the same pages. A badgeholder who connects the wallet that
holds their badge can additionally edit their own profile.

## Editing a profile

The profile page ends with an **Edit profile** button (only when Privy is
configured, and only for an address with a primary ENS name). It opens a side
drawer that reads the name's current text records straight from mainnet and
offers:

- `name`, `description`, `avatar` and `email` as text inputs.
- X and Telegram as connect-only rows. Connecting goes through Privy's social
  login; on save the attester worker signs the handle and the drawer writes the
  handle plus its `attestations[…]` / `uid[…]` records. Remove clears them.

Save publishes one `setRecords` transaction on the name's resolver, which also
sets `class` to `Person` and `schema` to the published Person schema. It is
gated on the connected wallet being the badgeholder address, which must also
manage the ENS name. After two confirmations the page's rcrds.xyz cache is
dropped; rcrds.xyz itself can take a few minutes to index the new records.

Connecting X (and usually Telegram) leaves the page for the provider's login.
The drawer parks its draft in `sessionStorage` and reopens itself on return.

## Environment

The app expects the following environment variables to be set. Without
`DUNE_API_KEY` the badgeholder list is always empty; without `RCRDS_API_KEY`
every badgeholder has no ENS name and empty records.

```sh
export DUNE_API_KEY=
export DUNE_BADGELIST_QUERY_ID=    # optional numeric Dune query id (default 8607855)
export RCRDS_API_KEY=
export ESB_PRIVY_APP_ID=
export ESB_PRIVY_APP_SECRET=
export NEXT_PUBLIC_RPC_URL=        # optional mainnet RPC; falls back to public RPCs
export NEXT_PUBLIC_ATTESTER_URL=   # attester worker base URL (default http://localhost:8787)
```

`ESB_PRIVY_APP_ID` enables the wallet connect button in the header and the
profile editor; without it neither is rendered. It must be the same Privy app
the attester worker trusts (its `PRIVY_APP_ID` secret), with the X and Telegram
login methods enabled, since the worker verifies Privy access tokens against
that one app. The worker's `SIWE_DOMAIN` and `TRUSTED_ORIGIN` allowlists in
`workers/attester/wrangler.jsonc` must include this app's host.
`ESB_PRIVY_APP_SECRET` is reserved for server-side token verification and is
not read yet.

## Running it

```bash
pnpm ethsecurity       # from the repo root, serves on :3003
```

Other scripts, run from this directory: `pnpm build`, `pnpm lint`, `pnpm test`.
