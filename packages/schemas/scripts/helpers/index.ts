import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { privateKeyToAccount } from "viem/accounts";
import type { Schema } from "../../src/types";

export interface PublishedSchema {
  schemaId: string;
  version: string;
  cid: string;
  checksum: string;
  timestamp: number;
  schemaPath: string;
  publisher: string;
  notes?: string;
  title?: string;
  description?: string;
  source?: string;
  signer?: string;
  signature?: string;
  eip712?: object;
}

export function arg(args: string[], long: string, short?: string) {
  const i = args.indexOf(long);
  if (i >= 0) return args[i + 1];
  if (short) {
    const j = args.indexOf(short);
    if (j >= 0) return args[j + 1];
  }
  return undefined;
}

export function hasFlag(args: string[], flag: string) {
  return args.includes(flag);
}

export function bumpVersion(current: string, bump: string) {
  if (/^\d+\.\d+\.\d+$/.test(bump)) return bump;
  const [major, minor, patch] = current.split(".").map((v) => Number(v));
  if ([major, minor, patch].some((v) => Number.isNaN(v))) {
    throw new Error(`Invalid current version: ${current}`);
  }
  switch (bump) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Invalid bump: ${bump}`);
  }
}

export async function loadSchema(filePath: string): Promise<Schema> {
  const moduleUrl = `${pathToFileURL(filePath).href}?t=${Date.now()}`;
  const mod = await import(moduleUrl);
  const candidates = Object.values(mod).filter(isSchema);
  if (candidates.length === 0) {
    throw new Error(`No Schema export found in ${filePath}`);
  }
  return candidates[0];
}

export function isSchema(value: unknown): value is Schema {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.title === "string" &&
    typeof v.version === "string" &&
    typeof v.properties === "object" &&
    v.properties !== null &&
    v.type === "object"
  );
}

export function hashSha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

export function writeJson(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function upsertPublished(
  entries: Array<{ version: string }>,
  next: { version: string },
) {
  const existing = entries.findIndex((item) => item.version === next.version);
  if (existing >= 0) {
    entries[existing] = next;
    return entries;
  }
  return [...entries, next];
}

export function toRepoPath(absPath: string, repoRoot: string) {
  return path.relative(repoRoot, absPath).split(path.sep).join("/");
}

export { publishFile } from "@ensmetadata/shared";

export function buildEip712(
  message: {
    schemaId: string;
    version: string;
    cid: string;
    checksum: string;
    timestamp: number;
    schemaPath: string;
    publisher: string;
    notes: string;
  },
  chainId?: number,
) {
  const domain: Record<string, string | number> = {
    name: "ENS Schema Publisher",
    version: "1",
  };
  if (Number.isFinite(chainId)) {
    domain.chainId = chainId as number;
  }
  const types = {
    PublishedSchema: [
      { name: "schemaId", type: "string" },
      { name: "version", type: "string" },
      { name: "cid", type: "string" },
      { name: "checksum", type: "string" },
      { name: "timestamp", type: "uint256" },
      { name: "schemaPath", type: "string" },
      { name: "publisher", type: "string" },
      { name: "notes", type: "string" },
    ],
  };
  return {
    domain,
    types,
    primaryType: "PublishedSchema" as const,
    message,
  };
}

export async function maybeSign(
  eip712: ReturnType<typeof buildEip712>,
  privateKeyValue?: string,
): Promise<{ signer: string; signature: string } | null> {
  if (!privateKeyValue) return null;
  const account = privateKeyToAccount(privateKeyValue as `0x${string}`);
  const signature = await account.signTypedData({
    domain: eip712.domain,
    types: eip712.types,
    primaryType: eip712.primaryType,
    message: eip712.message,
  });
  return { signer: account.address, signature };
}
