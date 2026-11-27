import { BAND_THEMES, bandThemeClass } from "@/lib/band-theme";

// Full class names, so Tailwind finds them.
const SWATCHES = [
  { name: "gold", value: "#b8913d", className: "bg-gold" },
  { name: "gold-dark", value: "#a07c2f", className: "bg-gold-dark" },
  { name: "gold-darker", value: "#8b6914", className: "bg-gold-darker" },
  { name: "green", value: "#6b8e23", className: "bg-green" },
  { name: "ink", value: "#222222", className: "bg-ink" },
  { name: "body", value: "#374151", className: "bg-body" },
  { name: "muted", value: "#6b7280", className: "bg-muted" },
  { name: "line", value: "#e0e0e0", className: "bg-line" },
  { name: "surface", value: "#fafafa", className: "bg-surface" },
  { name: "paper", value: "#ffffff", className: "bg-paper" },
];

const TYPE_SCALE = [
  { name: "text-title", className: "text-title font-semibold" },
  { name: "text-section", className: "text-section font-semibold" },
  { name: "text-lead", className: "text-lead font-semibold" },
  { name: "text-base", className: "text-base" },
  { name: "text-small", className: "text-small" },
  { name: "text-label", className: "text-label font-semibold uppercase tracking-wide" },
];

const SHAPES = [
  { name: "radius-control", className: "rounded-control" },
  { name: "radius-card", className: "rounded-card" },
  { name: "radius-pill", className: "rounded-pill" },
  { name: "shadow-card", className: "rounded-card shadow-card" },
  { name: "shadow-raised", className: "rounded-card shadow-raised" },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="border-b-2 border-line pb-2 text-section font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** The component gallery: the design tokens and each band theme, for a look at the whole system. */
export function DesignGallery() {
  return (
    <div className="flex flex-col gap-10">
      <Section id="colors" title="Colors">
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
          {SWATCHES.map((swatch) => (
            <li key={swatch.name} className="overflow-hidden rounded-card border border-line">
              <div className={`h-16 ${swatch.className}`} />
              <p className="p-2 text-small">
                <span className="block font-semibold">{swatch.name}</span>
                <span className="font-mono text-label text-muted">{swatch.value}</span>
              </p>
            </li>
          ))}
        </ul>
      </Section>
      <Section id="type" title="Type">
        <ul className="flex flex-col gap-3">
          {TYPE_SCALE.map((step) => (
            <li key={step.name} className="flex flex-wrap items-baseline gap-x-4">
              <span className={step.className}>The Robert Hunter Performance Archive</span>
              <span className="font-mono text-label text-muted">{step.name}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section id="shapes" title="Spacing, radius and shadow">
        <div className="flex flex-wrap items-end gap-4">
          {[1, 2, 4, 6, 8].map((step) => (
            <div key={step} className="flex flex-col items-center gap-1">
              <div className="bg-gold" style={{ width: `calc(var(--spacing) * ${step})`, height: `calc(var(--spacing) * ${step})` }} />
              <span className="font-mono text-label text-muted">{step}</span>
            </div>
          ))}
        </div>
        <ul className="flex flex-wrap gap-4">
          {SHAPES.map((shape) => (
            <li key={shape.name} className={`flex h-20 w-32 items-center justify-center border border-line bg-paper text-label ${shape.className}`}>
              {shape.name}
            </li>
          ))}
        </ul>
      </Section>
      <Section id="bands" title="Band themes">
        <ul className="grid gap-4 md:grid-cols-2">
          {BAND_THEMES.map((band) => (
            <li key={band.slug} className={`${bandThemeClass(band.slug)} flex flex-col gap-3`}>
              <h3 className="text-lead font-semibold text-band-ink">{band.name}</h3>
              <p className="text-band-ink">Sample text in the band color, on the page background.</p>
              <div className="rounded-card border-2 border-band-border border-l-8 bg-band-bg p-4">
                <p className="font-semibold text-band-ink">{band.name} sample card</p>
                <p className="text-ink">Sample card text in the main text color.</p>
                <p className="font-mono text-label text-body">band-{band.slug}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
