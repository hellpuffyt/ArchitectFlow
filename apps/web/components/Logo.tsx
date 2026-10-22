export function Logo({ size = 20 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2" y="3" width="8" height="6" rx="1.5" fill="var(--accent)" />
        <rect x="14" y="15" width="8" height="6" rx="1.5" fill="var(--cat-compute)" />
        <rect x="14" y="3" width="8" height="6" rx="1.5" fill="var(--cat-data)" opacity=".9" />
        <path d="M10 6h4M18 9v6" stroke="var(--muted)" strokeWidth="1.5" fill="none" />
      </svg>
      ArchitectFlow
    </span>
  );
}
