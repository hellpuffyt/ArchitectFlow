// Minimal, dependency-free console output. Colour only when attached to a TTY.

const tty = process.stdout.isTTY === true;
const c = (code: string) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
export const bold = c("1");
export const dim = c("2");
export const green = c("32");
export const yellow = c("33");
export const red = c("31");
export const cyan = c("36");

export function heading(s: string): void { console.log("\n" + bold(cyan("ArchitectFlow ")) + bold(s)); }
export function ok(s: string): void { console.log(green("  ✓ ") + s); }
export function info(s: string): void { console.log(dim("  • ") + s); }
export function warn(s: string): void { console.log(yellow("  ! ") + s); }
export function fail(s: string): void { console.error(red("  ✗ ") + s); }
