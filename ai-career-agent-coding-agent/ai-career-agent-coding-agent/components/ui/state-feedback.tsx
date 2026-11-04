'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import styles from './state-feedback.module.css';
export function LoadingState({ label = 'Loading', detail = 'Your information is on its way.', slowAfterMs = 4500, slowMessage = 'This is taking longer than usual. You can keep this page open while we continue.' }: { label?: string; detail?: string; slowAfterMs?: number; slowMessage?: string }) {
 const [slow,setSlow]=useState(false); useEffect(()=>{const timer=window.setTimeout(()=>setSlow(true),slowAfterMs);return()=>window.clearTimeout(timer)},[slowAfterMs]);
 return <div className={styles.state} role="status" aria-live="polite" aria-busy="true"><span className={styles.spinner} aria-hidden="true"/><div><strong>{label}</strong><p>{slow?slowMessage:detail}</p></div></div>;
}
export function EmptyState({title,children,action,href}:{title:string;children:ReactNode;action?:string;href?:string}) {return <div className={styles.state}><div><strong>{title}</strong><p>{children}</p>{action&&href&&<Link className={styles.action} href={href}>{action}</Link>}</div></div>}
export function ErrorState({title='We couldn’t complete that',children,onRetry,action,href}:{title?:string;children:ReactNode;onRetry?:()=>void;action?:string;href?:string}) {return <div className={`${styles.state} ${styles.error}`} role="alert"><div><strong>{title}</strong><p>{children}</p><div className={styles.actions}>{onRetry&&<button className={styles.action} type="button" onClick={onRetry}>Try again</button>}{action&&href&&<Link className={styles.action} href={href}>{action}</Link>}</div></div></div>}
export function PermissionDeniedState({title='You don’t have access to this action',children,action='Go to your account',href='/dashboard'}:{title?:string;children:ReactNode;action?:string;href?:string}) {return <ErrorState title={title} action={action} href={href}>{children}</ErrorState>}
export function SuccessState({title,children,action,href}:{title:string;children:ReactNode;action?:string;href?:string}) {return <div className={`${styles.state} ${styles.success}`} role="status"><div><strong>{title}</strong><p>{children}</p>{action&&href&&<Link className={styles.action} href={href}>{action}</Link>}</div></div>}
