#!/usr/bin/env node
/*
 * CLI wrapper over lib-job.mjs. Prints one soliyog.com listing's portal facts as JSON.
 *   node fetch-job.mjs 213
 *   node fetch-job.mjs https://www.soliyog.com/jobs/213
 * Exits non-zero if the page has no usable JobPosting.
 */
import { fetchJob } from './lib-job.mjs';

const arg = process.argv[2];
if (!arg) { console.error('usage: fetch-job.mjs <job url or numeric id>'); process.exit(1); }

try {
  const job = await fetchJob(arg);
  process.stdout.write(JSON.stringify(job, null, 2) + '\n');
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
