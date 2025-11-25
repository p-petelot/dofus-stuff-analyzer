const PALETTE_LOADER_COLORS = ["#1bdd8d", "#22d3ee", "#facc15", "#fb923c", "#a855f7"];

export function PaletteLoader({ label }) {
  return (
    <div className="palette-loader" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="palette-loader__aurora" aria-hidden="true">
        <span className="palette-loader__halo" />
        <div className="palette-loader__spectrum">
          <span className="palette-loader__ring palette-loader__ring--outer" />
          <span className="palette-loader__ring palette-loader__ring--inner" />
          {PALETTE_LOADER_COLORS.map((color, index) => (
            <span
              key={`${color}-${index}`}
              className={`palette-loader__pulse palette-loader__pulse--${index}`}
              style={{
                "--palette-loader-color": color,
                "--palette-loader-index": String(index),
              }}
            />
          ))}
        </div>
        <span className="palette-loader__core" />
      </div>
    </div>
  );
}
