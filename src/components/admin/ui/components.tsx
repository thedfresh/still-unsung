import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import {
  BADGE_CLASS,
  BUTTON_CLASS,
  type BadgeTone,
  type ButtonVariant,
  CARD_CLASS,
  ERROR_CLASS,
  FIELD_CLASS,
  HINT_CLASS,
  LABEL_CLASS,
  LINK_CLASS,
  MESSAGE_CLASS,
  type MessageTone,
  TABLE_CLASS,
  TABLE_WRAP_CLASS,
  TD_CLASS,
  TH_CLASS,
} from "@/components/admin/ui/styles";

function join(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  /** Shows the busy state: the button stays in place and ignores clicks. */
  busy?: boolean;
};

/** A button: primary, secondary, quiet or danger, with disabled and busy states. */
export function Button({ variant = "secondary", busy = false, className, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={join(BUTTON_CLASS[variant], className)}
    />
  );
}

/** A link that looks like a button. */
export function ButtonLink({ variant = "secondary", className, ...rest }: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link {...rest} className={join(BUTTON_CLASS[variant], className)} />;
}

/** A plain text link with the admin link style. */
export function TextLink({ className, ...rest }: ComponentProps<typeof Link>) {
  return <Link {...rest} className={join(LINK_CLASS, className)} />;
}

/** A card or panel. */
export function Card({ className, ...rest }: ComponentProps<"div">) {
  return <div {...rest} className={join(CARD_CLASS, className)} />;
}

/** A field: the label, the control, then the hint and the error. The control comes as children. */
export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={join(FIELD_CLASS, className)}>
      <span className={LABEL_CLASS}>{label}</span>
      {children}
      {hint ? <span className={HINT_CLASS}>{hint}</span> : null}
      {error ? <span className={ERROR_CLASS}>{error}</span> : null}
    </label>
  );
}

/** A page header: the title, then actions that wrap on a phone. */
export function PageHeader({ title, actions, level = 1 }: { title: ReactNode; actions?: ReactNode; level?: 1 | 2 }) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Heading className={level === 1 ? "text-title font-semibold text-ink" : "text-lead font-semibold text-ink"}>{title}</Heading>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** A pill for a state: "private", "in use by 3", a certainty. */
export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={BADGE_CLASS[tone]}>{children}</span>;
}

/** A message: saved (success), refused (error) or a note (info). Errors use role alert, the others role status. */
export function Message({ tone = "info", children, className }: { tone?: MessageTone; children: ReactNode; className?: string }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={join(MESSAGE_CLASS[tone], className)}>
      {children}
    </div>
  );
}

/** A table that scrolls inside its own box, so the page never scrolls sideways. */
export function DataTable({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className={TABLE_WRAP_CLASS} tabIndex={0} role="region" aria-label={label}>
      <table className={TABLE_CLASS}>{children}</table>
    </div>
  );
}
export function Th(props: ComponentProps<"th">) {
  return <th {...props} className={join(TH_CLASS, props.className)} />;
}
export function Td(props: ComponentProps<"td">) {
  return <td {...props} className={join(TD_CLASS, props.className)} />;
}
