import type { CSSProperties, ReactNode } from "react";
import { Icon } from "@/components/icons/icons";
import { Badge, Button } from "@/components/ui/primitives";
import styles from "./product.module.css";

export type AgentTimelineEvent = {
  verb: string;
  detail: string;
  timeLabel: string;
  state?: "complete" | "current";
};

export function AgentTimeline({ events, label = "Agent activity" }: { events: AgentTimelineEvent[]; label?: string }) {
  return (
    <section aria-label={label}>
      <ol className={styles.timeline}>
        {events.map((event, index) => (
          <li className={styles.timelineItem} key={`${event.verb}-${index}`}>
            <span className={styles.timelineRail} aria-hidden="true"><span className={styles.timelineDot}><Icon name={event.state === "current" ? "clock" : "check"} /></span></span>
            <div>
              <p className={styles.timelineVerb}>{event.verb}</p>
              <p className={styles.timelineDetail}>{event.detail}</p>
              <p className={styles.timelineTime}>{event.timeLabel}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function MatchScoreRing({ score, illustrative = true }: { score: number; illustrative?: boolean }) {
  const safeScore = Math.max(0, Math.min(100, Math.round(score)));
  const band = safeScore < 40 ? "Needs review" : safeScore < 70 ? "Partial match" : "Strong match";
  const style = { "--score-angle": `${safeScore * 3.6}deg` } as CSSProperties;
  return (
    <div className={styles.scoreGroup} aria-label={`Match score ${safeScore} out of 100. ${band}${illustrative ? ". Illustrative specimen only." : "."}`}>
      <span className={styles.scoreRing} style={style} aria-hidden="true"><span className={styles.scoreInner}>{safeScore}</span></span>
      <span className={styles.scoreCaption}><strong>{band}</strong><small>{illustrative ? "Example score, not a real result" : "Review the matched evidence"}</small></span>
    </div>
  );
}

export function ApprovalCard() {
  return (
    <article className={styles.approvalCard} aria-label="Approval review specimen">
      <header className={styles.approvalTop}>
        <div>
          <Badge tone="warning">Sample review</Badge>
          <h3 className={styles.productTitle} style={{ marginTop: "0.65rem" }}>Product Designer</h3>
          <p className={styles.productMeta}>Example employer · Saved job</p>
        </div>
        <MatchScoreRing score={72} />
      </header>
      <div className={styles.approvalBody}>
        <div className={styles.approvalSection}>
          <h4>What is ready</h4>
          <p>A tailored CV and cover letter, prepared from verified experience.</p>
        </div>
        <div className={styles.approvalSection}>
          <h4>What changed and why</h4>
          <ul className={styles.diffList}>
            <li className={styles.diffItem}><span className={styles.diffMarker} aria-hidden="true" /><span>Moved relevant experience higher to match the role requirements.</span></li>
            <li className={styles.diffItem}><span className={styles.diffMarker} aria-hidden="true" /><span>Kept each claim tied to the evidence in the saved profile.</span></li>
          </ul>
        </div>
        <div className={styles.approvalSection}>
          <h4>Before anything is sent</h4>
          <p>Review the documents. Nothing leaves your account without your approval.</p>
        </div>
      </div>
      <footer className={styles.approvalActions}>
        <Button variant="lime" iconStart={<Icon name="check" />}>Approve and send</Button>
        <Button variant="outline">Request changes</Button>
      </footer>
    </article>
  );
}

export function JobCard({ role = "Product Designer", employer = "Example employer", location = "Remote", score = 72 }: { role?: string; employer?: string; location?: string; score?: number }) {
  return (
    <article className={styles.productCard}>
      <div className={styles.productHeader}>
        <div><h3 className={styles.productTitle}>{role}</h3><p className={styles.productMeta}>{employer}</p></div>
        <MatchScoreRing score={score} />
      </div>
      <div className={styles.jobMeta}><span><Icon name="briefcase" width={17} height={17} />{location}</span><span><Icon name="clock" width={17} height={17} />Added by you</span></div>
    </article>
  );
}

export function ApplicationPipelineColumn({ title, items }: { title: string; items: { role: string; employer: string }[] }) {
  return (
    <section className={styles.pipeline} aria-label={`${title} applications`}>
      <div className={styles.pipelineHeader}><h3>{title}</h3><span className={styles.pipelineCount}>{items.length}</span></div>
      {items.map((item) => <article className={styles.pipelineItem} key={`${item.role}-${item.employer}`}><strong>{item.role}</strong><span>{item.employer}</span></article>)}
    </section>
  );
}

export function TemplateThumbnailGrid() {
  return (
    <div className={styles.templateGrid} aria-label="Resume template examples">
      {["Structured", "Minimal", "Editorial"].map((name, index) => (
        <article className={styles.templateTile} key={name}>
          <div className={styles.templatePaper} aria-hidden="true">
            <span className={`${styles.templateLine} ${index === 1 ? styles.templateLineShort : ""}`} />
            <span className={styles.templateLine} />
            <span className={`${styles.templateLine} ${styles.templateLineShort}`} />
            <span className={styles.templateLine} />
            <span className={styles.templateLine} />
          </div>
          <strong>{name}</strong>
        </article>
      ))}
    </div>
  );
}

export function ToolResultHero({ eyebrow, metric, detail, children }: { eyebrow: string; metric: string; detail: string; children?: ReactNode }) {
  return (
    <section className={styles.toolHero} aria-label={eyebrow}>
      <div><p className={styles.toolEyebrow}>{eyebrow}</p><h3 className={styles.toolMetric}>{metric}</h3><p className={styles.toolDetails}>{detail}</p>{children}</div>
      <span className={styles.toolValue} aria-hidden="true"><Icon name="activity" width={36} height={36} /></span>
    </section>
  );
}
