# Troubleshooting

**`node: --experimental ...` or syntax errors running from source.** Use Node ≥ 20.9. The published
package ships compiled JavaScript; `npx architectflow` needs no TypeScript toolchain.

**`analyze` finds no routes/entities.** Your framework may not have verified extraction yet
(see SUPPORT_MATRIX). Routes defined dynamically or via unusual decorators are not traced. The
design is still generated from discovery, imports and infrastructure.

**Too many / irrelevant files analyzed.** Add globs to `.architectflowignore` (gitignore syntax).
Vendored and build directories are skipped automatically.

**Validation issues reported.** `analyze` checks the design against the ArchitectFlow schema. If it
lists issues, the design may not import cleanly; please open an issue with the `analysis.json`
`validationErrors`.

**`doctor` says the skill differs from the CLI version.** Run `npx architectflow init` to re-apply
the current skill file.

**Secrets.** If you believe a secret appeared in an artifact, delete `.architectflow/` and open a
security issue — the engine should never read or emit secret material.
