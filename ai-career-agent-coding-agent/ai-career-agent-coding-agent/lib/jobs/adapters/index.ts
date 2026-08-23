import type { JobSourceAdapter } from '../types';
import { greenhouseAdapter } from './greenhouse';
import { leverAdapter } from './lever';

/** Registry of supported job-source adapters. Add new sources here (Ashby, Workday, etc.). */
export const ADAPTERS: Record<string, JobSourceAdapter> = {
  greenhouse: greenhouseAdapter,
  lever: leverAdapter,
};

export function getAdapter(source: string): JobSourceAdapter | undefined {
  return ADAPTERS[source.toLowerCase()];
}

export { greenhouseAdapter, leverAdapter };
