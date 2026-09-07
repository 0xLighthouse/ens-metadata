# ethsecurity-badgeholders

A public, read-only dashboard that lists holders of the ETHSecurity badge
alongside the ENS metadata each of them publishes on-chain. The badgeholder
list comes from a Dune query, read server-side and cached for an hour, and is
exposed for debugging at `GET /api/badgeholders`, joined with each address's
primary ENS name, tracked text records, and handle attestation state from the
rcrds.xyz API.

The layout follows the `0xLighthouse/platform` web app as deployed at
beta.dao.vote: a header with breadcrumbs and a theme toggle, a rounded content
panel, and a footer, with the same type scale and color tokens. The UI
primitives under `src/components/ui/` are copied from there and from
`apps/interface`, not imported from a shared package.

Every visitor sees the same page. Connecting a wallet only shows it in the header.

## Environment

The app expects the following environment variables to be set. Without
`DUNE_API_KEY` the badgeholder list is always empty; without `RCRDS_API_KEY`
every badgeholder has no ENS name and empty records.

```sh
export DUNE_API_KEY=
export RCRDS_API_KEY=
export ESB_PRIVY_APP_ID=
export ESB_PRIVY_APP_SECRET=
```

`ESB_PRIVY_APP_ID` enables the wallet connect button in the header; without it
the button is not rendered. `ESB_PRIVY_APP_SECRET` is reserved for server-side
token verification and is not read yet.

## Running it

```bash
pnpm ethsecurity       # from the repo root, serves on :3003
```

Other scripts, run from this directory: `pnpm build`, `pnpm lint`, `pnpm test`.
