// Privacy guard (spec section 9). The engine never reads, parses, or emits secret
// material. Sensitive files are discovered (so the doc can note "secrets are
// externally configured") but their CONTENTS are never opened. Any string that
// reaches the generated artifacts is additionally scrubbed of secret-looking
// tokens, as defence in depth.

const SENSITIVE_PATTERNS: RegExp[] = [
  /(^|\/)\.env(\.|$)/i,
  /(^|\/)\.env$/i,
  /\.(pem|key|p12|pfx|keystore|jks|asc|gpg|ppk)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /(^|\/)(secrets?|credentials?)\.(ya?ml|json|toml|ini|txt)$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.pypirc$/i,
  /(^|\/)\.htpasswd$/i,
  /\.(crt|cer|der)$/i,
];

export function isSensitivePath(relPath: string): boolean {
  return SENSITIVE_PATTERNS.some((re) => re.test(relPath));
}

// Redact high-entropy / well-known secret shapes from any text that is about to
// be written into an artifact. We only ever intend to emit file paths, symbol
// names, and structural facts, so a match here means something leaked upstream.
const SECRET_SHAPES: RegExp[] = [
  /\b(sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/g,         // OpenAI-style keys
  /\bAKIA[0-9A-Z]{16}\b/g,                       // AWS access key id
  /\bghp_[A-Za-z0-9]{20,}\b/g,                   // GitHub PAT
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,           // Slack token
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWT
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/g,               // long base64 blob
  /(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*["']?[^\s"']{6,}/gi,
];

export function scrubSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_SHAPES) out = out.replace(re, "[REDACTED]");
  return out;
}
