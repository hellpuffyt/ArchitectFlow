// A pragmatic .gitignore-style matcher. Supports comments, negation (!), anchored
// patterns (leading /), directory-only patterns (trailing /), and * / ** globs.
// It does not aim for byte-perfect git semantics; it aims to never descend into
// vendored or build output, and to honour an author's explicit exclusions.

interface Rule {
  negated: boolean;
  dirOnly: boolean;
  re: RegExp;
}

function globToRegExp(pattern: string): RegExp {
  // Escape regex metachars except the glob ones we translate.
  let p = pattern.replace(/[.+^${}()|\\]/g, "\\$&");
  p = p.replace(/\*\*\//g, "(?:.*/)?");
  p = p.replace(/\*\*/g, ".*");
  p = p.replace(/\*/g, "[^/]*");
  p = p.replace(/\?/g, "[^/]");
  return new RegExp("^" + p + "$");
}

export class IgnoreSet {
  private rules: Rule[] = [];

  add(text: string): void {
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      let body = line;
      const negated = body.startsWith("!");
      if (negated) body = body.slice(1);
      const dirOnly = body.endsWith("/");
      if (dirOnly) body = body.slice(0, -1);
      const anchored = body.startsWith("/");
      if (anchored) body = body.slice(1);
      // Unanchored pattern with no slash matches at any depth.
      const prefix = anchored ? "" : body.includes("/") ? "" : "(?:.*/)?";
      this.rules.push({ negated, dirOnly, re: globToRegExp(prefix + body) });
    }
  }

  /** @param relPath forward-slash repo-relative path. isDir affects dirOnly rules. */
  ignored(relPath: string, isDir: boolean): boolean {
    let result = false;
    for (const r of this.rules) {
      if (r.dirOnly && !isDir) continue;
      if (r.re.test(relPath)) result = !r.negated;
    }
    return result;
  }
}

// Directories never worth descending into for architecture analysis, even when
// not gitignored. Keeps analysis fast and avoids vendored/third-party noise.
export const DEFAULT_SKIP_DIRS = new Set([
  ".git", "node_modules", ".next", ".nuxt", "dist", "build", "out", "coverage",
  ".turbo", ".cache", ".parcel-cache", "target", ".venv", "venv", "__pycache__",
  ".mypy_cache", ".pytest_cache", ".tox", ".gradle", ".idea", ".vscode",
  "vendor", "Pods", ".terraform", ".serverless", "bin", "obj", ".architectflow",
]);
