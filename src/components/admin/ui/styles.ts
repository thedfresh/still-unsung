// Class strings of the admin parts. Full class names, so Tailwind finds them.
// Carried over from the design system (buttons, forms, data), not rule for rule:
// primary uses gold-darker, because white on gold has too little contrast for small text.
// Every control is at least 44 px tall (WCAG 2.2 target size, phone and tablet first).

const BUTTON_BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 py-2 text-small font-semibold no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-60 aria-busy:cursor-wait";

export const BUTTON_CLASS = {
  primary: `${BUTTON_BASE} border-2 border-gold-darker bg-gold-darker text-paper hover:border-ink hover:bg-ink`,
  secondary: `${BUTTON_BASE} border-2 border-muted bg-paper text-body hover:border-ink hover:bg-surface`,
  quiet: `${BUTTON_BASE} border-2 border-transparent bg-transparent text-gold-darker hover:bg-surface`,
  danger: `${BUTTON_BASE} border-2 border-danger bg-danger text-paper hover:border-danger-dark hover:bg-danger-dark`,
} as const;

export type ButtonVariant = keyof typeof BUTTON_CLASS;

/** Text input, select and textarea. */
export const INPUT_CLASS =
  "min-h-11 w-full min-w-0 rounded-control border-2 border-muted bg-paper px-3 py-2 text-base font-normal text-ink placeholder:text-muted focus-visible:border-gold-darker disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted aria-invalid:border-danger";

/** A field: label above the control, hint and error below. */
export const FIELD_CLASS = "flex min-w-0 flex-col gap-1 text-small font-semibold text-body";
export const LABEL_CLASS = "text-small font-semibold text-body";
export const HINT_CLASS = "text-small text-muted";
export const ERROR_CLASS = "text-small font-semibold text-danger";

/** A checkbox or radio with its label: the whole row is the touch target. */
export const CHOICE_CLASS = "flex min-h-11 items-center gap-3 text-base";
export const CHOICE_INPUT_CLASS = "size-5 shrink-0 accent-gold-darker";

export const CARD_CLASS = "min-w-0 break-words rounded-card border border-line bg-paper p-4 shadow-card";
/** A row of a list: the table style for narrow screens. */
export const ROW_CLASS = "min-w-0 break-words rounded-card border border-line bg-paper p-3 shadow-card";
export const LINK_CLASS = "inline-flex min-h-11 items-center font-semibold text-gold-darker underline underline-offset-2 hover:text-ink";

export const TABLE_WRAP_CLASS = "overflow-x-auto rounded-card border border-line";
export const TABLE_CLASS = "w-full border-collapse text-left text-small";
export const TH_CLASS = "border-b border-line bg-surface px-3 py-3 font-semibold text-body";
export const TD_CLASS = "border-b border-line px-3 py-2 text-body";

const BADGE_BASE = "inline-flex items-center rounded-pill border px-2 py-0.5 text-label font-semibold";
export const BADGE_CLASS = {
  neutral: `${BADGE_BASE} border-muted bg-surface text-body`,
  private: `${BADGE_BASE} border-gold-darker bg-paper text-gold-darker`,
  info: `${BADGE_BASE} border-ink bg-ink text-paper`,
  warning: `${BADGE_BASE} border-warning bg-paper text-warning`,
} as const;
export type BadgeTone = keyof typeof BADGE_CLASS;

export const MESSAGE_CLASS = {
  success: "flex flex-col gap-2 rounded-card border-2 border-green-dark bg-paper p-3 text-green-dark",
  error: "flex flex-col gap-2 rounded-card border-2 border-danger bg-paper p-3 text-danger",
  info: "flex flex-col gap-2 rounded-card border-2 border-gold-darker bg-paper p-3 text-ink",
} as const;
export type MessageTone = keyof typeof MESSAGE_CLASS;
