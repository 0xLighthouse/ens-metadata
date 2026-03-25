/**
 * Resolve a text record value from node.texts only — never from top-level structural
 * properties (e.g. node.name is the ENS domain, not the "name" text record).
 */
// biome-ignore lint/suspicious/noExplicitAny: dynamic tree node shape
export const resolveNodeValue = (node: any, key: string) => node?.texts?.[key]
