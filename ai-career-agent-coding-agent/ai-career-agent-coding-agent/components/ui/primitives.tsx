import type { AnchorHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "@/components/icons/icons";
import styles from "./primitives.module.css";

export type ButtonVariant = "navy" | "lime" | "outline" | "ghost" | "danger" | "dark-outline";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
  loading?: boolean;
};

const buttonVariantClass: Record<ButtonVariant, string> = {
  navy: styles.buttonNavy,
  lime: styles.buttonLime,
  outline: styles.buttonOutline,
  ghost: styles.buttonGhost,
  danger: styles.buttonDanger,
  "dark-outline": styles.buttonDarkOutline,
};

export function Button({ variant = "navy", iconStart, iconEnd, loading = false, disabled, className = "", children, ...props }: ButtonProps) {
  return (
    <button
      className={`${styles.button} ${buttonVariantClass[variant]} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : iconStart ? <span className={styles.iconSlot}>{iconStart}</span> : null}
      <span>{children}</span>
      {!loading && iconEnd ? <span className={styles.iconSlot}>{iconEnd}</span> : null}
    </button>
  );
}

export function ButtonLink({ href, variant = "navy", iconStart, iconEnd, className = "", children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant; iconStart?: ReactNode; iconEnd?: ReactNode }) {
  return (
    <a href={href} className={`${styles.button} ${buttonVariantClass[variant]} ${className}`.trim()} {...props}>
      {iconStart ? <span className={styles.iconSlot}>{iconStart}</span> : null}
      <span>{children}</span>
      {iconEnd ? <span className={styles.iconSlot}>{iconEnd}</span> : null}
    </a>
  );
}

type FormFieldProps = {
  label: string;
  hint?: string;
  errorMessage?: string;
  id?: string;
  required?: boolean;
};

export function Input({ label, hint, errorMessage, id, required, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & FormFieldProps) {
  const inputId = id ?? props.name ?? label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = errorMessage ? `${inputId}-error` : undefined;
  return (
    <label className={styles.field} htmlFor={inputId}>
      <span className={styles.fieldLabel}>{label}{required ? " *" : ""}</span>
      <input
        className={`${styles.control} ${errorMessage ? styles.controlError : ""} ${className}`.trim()}
        id={inputId}
        aria-invalid={Boolean(errorMessage)}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        required={required}
        {...props}
      />
      {hint ? <span className={styles.fieldHint} id={hintId}>{hint}</span> : null}
      {errorMessage ? <span className={styles.fieldError} id={errorId}>{errorMessage}</span> : null}
    </label>
  );
}

export function Textarea({ label, hint, errorMessage, id, required, className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & FormFieldProps) {
  const inputId = id ?? props.name ?? label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = errorMessage ? `${inputId}-error` : undefined;
  return (
    <label className={styles.field} htmlFor={inputId}>
      <span className={styles.fieldLabel}>{label}{required ? " *" : ""}</span>
      <textarea
        className={`${styles.textarea} ${errorMessage ? styles.textareaError : ""} ${className}`.trim()}
        id={inputId}
        aria-invalid={Boolean(errorMessage)}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        required={required}
        {...props}
      />
      {hint ? <span className={styles.fieldHint} id={hintId}>{hint}</span> : null}
      {errorMessage ? <span className={styles.fieldError} id={errorId}>{errorMessage}</span> : null}
    </label>
  );
}

export function Select({ label, hint, errorMessage, id, required, className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & FormFieldProps & { children: ReactNode }) {
  const inputId = id ?? props.name ?? label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = errorMessage ? `${inputId}-error` : undefined;
  return (
    <label className={styles.field} htmlFor={inputId}>
      <span className={styles.fieldLabel}>{label}{required ? " *" : ""}</span>
      <select
        className={`${styles.select} ${errorMessage ? styles.selectError : ""} ${className}`.trim()}
        id={inputId}
        aria-invalid={Boolean(errorMessage)}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        required={required}
        {...props}
      >
        {children}
      </select>
      {hint ? <span className={styles.fieldHint} id={hintId}>{hint}</span> : null}
      {errorMessage ? <span className={styles.fieldError} id={errorId}>{errorMessage}</span> : null}
    </label>
  );
}

export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className={styles.choice}><input type="checkbox" {...props} /><span>{label}</span></label>;
}

export function Radio({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className={styles.choice}><input type="radio" {...props} /><span>{label}</span></label>;
}

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";
export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  const toneClass = tone === "neutral" ? "" : styles[`badge${tone[0].toUpperCase()}${tone.slice(1)}` as keyof typeof styles];
  return <span className={`${styles.badge} ${toneClass}`.trim()}>{children}</span>;
}

export function Chip({ children, selected = false }: { children: ReactNode; selected?: boolean }) {
  return <span className={`${styles.chip} ${selected ? styles.chipSelected : ""}`.trim()}>{children}</span>;
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return <span className={styles.tooltip} data-tooltip={label} tabIndex={0}>{children}</span>;
}

export function AccordionItem({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return <details className={styles.accordion} open={open}><summary>{title}</summary><div className={styles.accordionBody}>{children}</div></details>;
}

export function Banner({ tone = "info", title, children }: { tone?: "info" | "success" | "warning" | "error"; title: string; children: ReactNode }) {
  const toneClass = tone === "info" ? "" : styles[`banner${tone === "error" ? "Error" : tone[0].toUpperCase() + tone.slice(1)}` as keyof typeof styles];
  const iconName: IconName = tone === "success" ? "check-circle" : tone === "warning" || tone === "error" ? "shield" : "activity";
  return (
    <div className={`${styles.banner} ${toneClass}`.trim()} role={tone === "error" ? "alert" : "status"}>
      <Icon name={iconName} className={styles.bannerIcon} />
      <div><strong>{title}</strong><div>{children}</div></div>
    </div>
  );
}

export function Card({ children, padded = true, className = "" }: { children: ReactNode; padded?: boolean; className?: string }) {
  return <div className={`${styles.card} ${padded ? styles.cardPadded : ""} ${className}`.trim()}>{children}</div>;
}

export function ProgressBar({ value, label, tone = "navy" }: { value: number; label: string; tone?: "navy" | "lime" }) {
  const bounded = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="progress-label"><span>{label}</span><span>{bounded}%</span></div>
      <div className={styles.progressTrack} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={bounded}>
        <div className={`${styles.progressFill} ${tone === "lime" ? styles.progressLime : ""}`.trim()} style={{ width: `${bounded}%` }} />
      </div>
    </div>
  );
}

export function Skeleton({ width = "100%", height = "1rem", className = "" }: { width?: string; height?: string; className?: string }) {
  return <span className={`${styles.skeleton} ${className}`.trim()} style={{ width, height }} aria-hidden="true" />;
}

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <section className={styles.empty} aria-labelledby="empty-state-title"><strong id="empty-state-title">{title}</strong><div>{children}</div>{action}</section>;
}

export function Avatar({ initials, label }: { initials: string; label: string }) {
  return <span className={styles.avatar} role="img" aria-label={label}>{initials}</span>;
}

export function DataTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="visually-hidden">{caption}</caption>
        <thead><tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr></thead>
        <tbody>{rows.map((row, rowIndex) => <tr key={`${caption}-${rowIndex}`}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`} data-label={headers[cellIndex]}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function Pagination({ current = 2, total = 5 }: { current?: number; total?: number }) {
  return (
    <nav className={styles.pagination} aria-label="Pagination">
      <a className={styles.pageButton} href="#previous" aria-label="Previous page">‹</a>
      {Array.from({ length: total }, (_, index) => index + 1).map((page) => <a className={styles.pageButton} href={`#page-${page}`} aria-current={page === current ? "page" : undefined} key={page}>{page}</a>)}
      <a className={styles.pageButton} href="#next" aria-label="Next page">›</a>
    </nav>
  );
}

export function DropdownMenu({ label, items }: { label: string; items: string[] }) {
  return (
    <details className={styles.dropdown}>
      <summary>{label}<Icon name="chevron-down" width={18} height={18} /></summary>
      <div className={styles.dropdownPanel}>{items.map((item) => <a key={item} className={styles.dropdownItem} href={`#${item.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{item}</a>)}</div>
    </details>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className={styles.breadcrumbs}>
        {items.map((item, index) => <li key={item.label}>{item.href ? <a href={item.href}>{item.label}</a> : <span aria-current="page">{item.label}</span>}{index < items.length - 1 ? <span className={styles.breadcrumbSeparator} aria-hidden="true">/</span> : null}</li>)}
      </ol>
    </nav>
  );
}

export function Stepper({ steps, current = 1 }: { steps: string[]; current?: number }) {
  return (
    <ol className={styles.stepper} aria-label="Progress">
      {steps.map((step, index) => {
        const state = index + 1 < current ? styles.stepDone : index + 1 === current ? styles.stepCurrent : "";
        return <li key={step} className={`${styles.step} ${state}`.trim()} aria-current={index + 1 === current ? "step" : undefined}><span className={styles.stepNumber}>{index + 1 < current ? <Icon name="check" width={16} height={16} /> : index + 1}</span><span>{step}</span></li>;
      })}
    </ol>
  );
}
