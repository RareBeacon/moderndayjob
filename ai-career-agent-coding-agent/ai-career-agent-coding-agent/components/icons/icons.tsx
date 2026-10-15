import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "arrow-right"
  | "check"
  | "chevron-down"
  | "clock"
  | "close"
  | "file"
  | "shield"
  | "spark"
  | "briefcase"
  | "search"
  | "plus"
  | "activity"
  | "eye"
  | "check-circle"
  | "user"
  | "arrow-up-right";

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
  title?: string;
};

const shapes: Record<IconName, ReactNode> = {
  "arrow-right": <><path d="M4.75 12h14.5" /><path d="m13 5.75 6.25 6.25L13 18.25" /></>,
  check: <path d="m5 12.5 4.2 4.2L19 7" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  clock: <><circle cx="12" cy="12" r="8.75" /><path d="M12 7v5l3.25 2" /></>,
  close: <><path d="m6 6 12 12" /><path d="M18 6 6 18" /></>,
  file: <><path d="M7 3.75h7l4 4v12.5H7z" /><path d="M14 3.75v4h4M9.5 12h6M9.5 15.5h6" /></>,
  shield: <><path d="M12 3.5 19 6v5.25c0 4.4-2.75 7.25-7 9.25-4.25-2-7-4.85-7-9.25V6z" /><path d="m8.5 12 2.25 2.25L15.75 9" /></>,
  spark: <><path d="m12 3 1.7 6.3L20 11l-6.3 1.7L12 19l-1.7-6.3L4 11l6.3-1.7z" /><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z" /></>,
  briefcase: <><rect x="3.75" y="7.25" width="16.5" height="12.5" rx="2" /><path d="M8.5 7.25V5.5c0-1 .8-1.75 1.75-1.75h3.5c1 0 1.75.75 1.75 1.75v1.75M3.75 12h16.5M10 12v2h4v-2" /></>,
  search: <><circle cx="10.75" cy="10.75" r="6.5" /><path d="m16 16 4.25 4.25" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  activity: <path d="M3.5 12h4l2.1-6 4.1 12 2.2-6h4.6" />,
  eye: <><path d="M2.75 12s3.1-6 9.25-6 9.25 6 9.25 6-3.1 6-9.25 6-9.25-6-9.25-6Z" /><circle cx="12" cy="12" r="2.6" /></>,
  "check-circle": <><circle cx="12" cy="12" r="8.75" /><path d="m7.8 12.2 2.8 2.8 5.8-6" /></>,
  user: <><circle cx="12" cy="8" r="3.1" /><path d="M5 20c.6-3.4 3.1-5.25 7-5.25s6.4 1.85 7 5.25" /></>,
  "arrow-up-right": <><path d="M7 17 17 7" /><path d="M8 7h9v9" /></>,
};

export function Icon({ name, title, ...props }: IconProps) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-label={title}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {shapes[name]}
    </svg>
  );
}
