/** A marca do Decreta: o "D" em duas peças (haste e bojo) e o nome em Geist. */
export function IconeDaMarca({ className, tamanho = 20 }: { className?: string; tamanho?: number }) {
  return (
    <svg className={className} width={tamanho} height={tamanho} viewBox="0 0 24 24" aria-hidden>
      <path d="M4 3H8V21H4Z" fill="currentColor" />
      <path d="M10 3H12A9 9 0 0 1 12 21H10Z" fill="var(--acento)" />
    </svg>
  );
}

export function Marca({ className }: { className?: string }) {
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--tinta)" }} aria-label="Decreta">
      <IconeDaMarca tamanho={20} />
      <span style={{ font: "600 18px/1 var(--font-sans)", letterSpacing: "-0.035em" }}>decreta</span>
    </span>
  );
}
