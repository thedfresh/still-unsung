"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition, type FormEvent } from "react";
import { listHref } from "@/components/admin/list-controls";
import { FIELD_CLASS, INPUT_CLASS, LABEL_CLASS } from "@/components/admin/ui/styles";

/** How long the search box waits after the last key before it filters. */
const DEBOUNCE_MS = 300;

interface SearchProps {
  /** The page path, for example "/admin/works". */
  action: string;
  label: string;
  q: string;
  sort: string;
  /** The sort the address leaves out. */
  defaultSort: string;
  sortOptions: ReadonlyArray<{ value: string; label: string }>;
  /** An extra choice, such as the kind of place to list. `defaultValue` is the choice the address leaves out. */
  filter?: {
    name: string;
    label: string;
    value: string;
    defaultValue: string;
    options: ReadonlyArray<{ value: string; label: string }>;
  };
}

/**
 * The search box and the choices of a list page. The list filters as the user types, and a choice applies
 * at once. Every choice stays in the address. Without scripts it is a plain GET form: Enter submits it,
 * and a Search button appears.
 */
export function SearchForm({ action, label, q, sort, defaultSort, sortOptions, filter }: SearchProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  /** Go to the list with the form's choices, on page 1. A newer navigation replaces an older one. */
  function apply() {
    clearTimeout(timer.current);
    if (!form.current) return;
    const data = new FormData(form.current);
    const text = (name: string) => String(data.get(name) ?? "");
    const href = listHref(
      action,
      { q: text("q").trim(), sort: text("sort") || defaultSort, type: filter ? text(filter.name) : undefined, page: 1 },
      defaultSort,
      filter?.defaultValue ?? "",
    );
    // Replace the history entry, so typing adds no step for the back button.
    startTransition(() => router.replace(href, { scroll: false }));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    apply();
  }

  return (
    <form ref={form} method="get" action={action} role="search" className="flex flex-col gap-3" onSubmit={onSubmit} aria-busy={pending || undefined}>
      <label className={FIELD_CLASS}>
        <span className={LABEL_CLASS}>{label}</span>
        <input
          name="q"
          type="search"
          defaultValue={q}
          maxLength={100}
          className={INPUT_CLASS}
          onChange={() => {
            clearTimeout(timer.current);
            timer.current = setTimeout(apply, DEBOUNCE_MS);
          }}
        />
      </label>
      {filter ? (
        <label className={FIELD_CLASS}>
          <span className={LABEL_CLASS}>{filter.label}</span>
          <select name={filter.name} defaultValue={filter.value} className={INPUT_CLASS} onChange={apply}>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className={FIELD_CLASS}>
        <span className={LABEL_CLASS}>Sort by</span>
        <select name="sort" defaultValue={sort} className={INPUT_CLASS} onChange={apply}>
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <noscript>
        <button type="submit" className="self-start">
          Search
        </button>
      </noscript>
    </form>
  );
}
