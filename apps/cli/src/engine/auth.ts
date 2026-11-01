// Authentication & authorization discovery (spec section 3, step 8). Reports the
// mechanism only when there is source evidence for it, and collects any role
// identifiers that appear, so the security section separates fact from inference.

import { readTextSafe } from "./discovery.ts";
import { lineAt } from "../util/text.ts";
import type { DiscoveredFile, AuthFact } from "../types.ts";

const SIGNALS: { mechanism: string; re: RegExp }[] = [
  { mechanism: "Session cookie", re: /set_cookie|res\.cookie|session(_id|Token)?|SessionMiddleware|express-session|AuthSession/i },
  { mechanism: "JWT", re: /\bjwt\b|jsonwebtoken|PyJWT|jose\.|encode\s*\(\s*\{[^}]*\}\s*,\s*\w*secret|create_access_token/i },
  { mechanism: "OAuth2 / OIDC", re: /oauth2|OAuth2PasswordBearer|passport-|openid|authorization_code|next-auth|authlib/i },
  { mechanism: "Password hashing (argon2)", re: /argon2|PasswordHasher/i },
  { mechanism: "Password hashing (bcrypt)", re: /bcrypt/i },
];

export function detectAuth(root: string, files: DiscoveredFile[]): AuthFact[] {
  const found = new Map<string, AuthFact>();
  const roleSet = new Set<string>();
  const CODE = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".go", ".rb"]);

  for (const f of files) {
    if (!CODE.has(f.ext)) continue;
    // Only scan files that look auth-related, to keep roles precise and fast.
    const authy = /auth|login|session|token|security|permission|rbac|role/i.test(f.rel);
    const text = readTextSafe(f.abs);
    if (!text) continue;
    for (const sig of SIGNALS) {
      const idx = text.search(sig.re);
      if (idx >= 0 && !found.has(sig.mechanism)) {
        found.set(sig.mechanism, { mechanism: sig.mechanism, evidence: { path: f.rel, lineStart: lineAt(text, idx), relationship: "authentication implementation" }, roles: [] });
      }
    }
    if (authy) {
      for (const rm of text.matchAll(/\b(?:role|roles)\b\s*[:=]?\s*\[?\s*["'`](\w{2,32})["'`]/gi)) roleSet.add(rm[1]!);
      for (const rm of text.matchAll(/\b(ADMIN|USER|OWNER|MANAGER|STAFF|SUPERADMIN|EDITOR|VIEWER|MEMBER|GUEST)\b/g)) roleSet.add(rm[1]!.toLowerCase());
    }
  }
  const roles = [...roleSet].slice(0, 20);
  const facts = [...found.values()];
  if (facts.length && roles.length) facts[0]!.roles = roles;
  return facts;
}
