/** Shared job-attribute enums still referenced by matching.
 *  (The legacy adapter/discovery layer that lived here was retired — the live
 *  pipeline is `lib/jobsources`.) */

export type RemoteType = 'remote' | 'hybrid' | 'onsite' | 'unknown';
export type EmploymentType = 'full-time' | 'part-time' | 'contract' | 'internship' | 'unknown';
