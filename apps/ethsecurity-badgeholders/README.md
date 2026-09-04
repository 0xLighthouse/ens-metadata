# ethsecurity-badgeholders

A public, read-only dashboard that lists holders of the ETHSecurity badge
alongside the ENS metadata each of them publishes on-chain. The badgeholder
list comes from a Dune query, read server-side and cached for an hour, and is
exposed for debugging at `GET /api/badgeholders`. The ENS metadata for each
address arrives in a later phase.

The layout follows the `0xLighthouse/platform` web app as deployed at
beta.dao.vote: a header with breadcrumbs and a theme toggle, a rounded content
panel, and a footer, with the same type scale and color tokens. The UI
primitives under `src/components/ui/` are copied from there and from
`apps/interface`, not imported from a shared package.

The app has no login. Every visitor sees the same page.

## Environment

The app expects the following environment variable to be set. Without it the
badgeholder list is always empty.

```sh
export DUNE_API_KEY=
```

## Running it

```bash
pnpm ethsecurity       # from the repo root, serves on :3003
```

Other scripts, run from this directory: `pnpm build`, `pnpm lint`, `pnpm test`.
