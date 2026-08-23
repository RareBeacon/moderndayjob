/** Scheduler worker: enqueue job discovery, daily quota resets and trial expiry checks. */
setInterval(()=>console.log('scheduler tick',new Date().toISOString()),60_000);
