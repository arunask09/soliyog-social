/*
 * fetchJob(idOrUrl) -> normalised facts from ONE soliyog.com listing.
 * Source of truth: the page's JSON-LD <script type="application/ld+json"> JobPosting.
 * Throws if the page has no usable JobPosting — callers should skip that post rather
 * than publish invented data. Empty fields are omitted from the returned object.
 */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDay = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const stripHtml = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();

const LABELS = 'Location|Interview Mode|Employment Type|Work Schedule|Work Mode|Package|Salary|Stipend|CTC|Experience|Qualification|Education|Note|About|Company|Job Title|Role|Responsibilities|Requirements|Key Skills|Skills';

export async function fetchJob(idOrUrl) {
  const id = String(idOrUrl).match(/(\d+)\s*$/)?.[1];
  if (!id) throw new Error(`no numeric job id in "${idOrUrl}"`);
  const url = `https://www.soliyog.com/jobs/${id}`;

  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (soliyog-social fetch-job)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();

  const m = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) throw new Error(`no JSON-LD on ${url}`);

  let ld = JSON.parse(m[1]);
  if (Array.isArray(ld)) ld = ld.find((x) => x['@type'] === 'JobPosting') || ld[0];
  if (!ld || ld['@type'] !== 'JobPosting' || !ld.title) throw new Error(`no JobPosting.title on ${url}`);

  const descriptionText = stripHtml(ld.description);
  const descField = (label) =>
    descriptionText.match(new RegExp(`${label}\\s*:?\\s*([\\s\\S]{2,60}?)\\s*(?=(?:${LABELS})\\s*:|$)`, 'i'))?.[1]
      ?.trim().replace(/[.,;|]+$/, '').trim() || '';

  // location
  let loc = ld.jobLocation;
  if (Array.isArray(loc)) loc = loc[0];
  const locality = (loc?.address?.addressLocality || loc?.address?.addressRegion || '').split(',')[0].trim();
  const remote = ld.jobLocationType === 'TELECOMMUTE' || /\b(work from home|wfh|remote|fully remote)\b/i.test(descriptionText);
  const location = locality ? (remote ? `${locality} / remote` : locality) : (remote ? 'Remote' : '');

  // employment type
  const ET = { FULL_TIME: 'Full-time', PART_TIME: 'Part-time', CONTRACTOR: 'Contract', TEMPORARY: 'Temporary', INTERN: 'Internship', OTHER: '' };
  let employmentType = descField('Employment Type').replace(/\bfull.?time\b/i, 'Full-time').replace(/\bpart.?time\b/i, 'Part-time')
    || [].concat(ld.employmentType || []).map((x) => ET[x] ?? '').filter(Boolean).join(' / ');
  employmentType = employmentType.replace(/\s*\|\s*work from office\b/i, ' · On-site').replace(/\s*\|\s*work from home\b/i, ' · Remote').trim();
  if (remote && employmentType && !/remote/i.test(employmentType)) employmentType += ' · Remote';
  else if (remote && !employmentType) employmentType = 'Remote';

  // experience
  let experience = descField('Experience').replace(/\s*years?\b/i, ' yrs').replace(/\s+/g, ' ').trim();
  if (/^0\s*yrs|^fresh/i.test(experience)) experience = 'Freshers welcome';
  // Guard: a description that spells out "N years experience" must not be downgraded to
  // "Freshers welcome" by a JSON-LD experienceRequirements.monthsOfExperience of 0.
  if (!experience) {
    const ym = descriptionText.match(
      /(\d{1,2})\s*(?:\+|-|–|to|and)?\s*(\d{1,2})?\+?\s*years?['’]?\s+(?:[\w-]+\s+){0,3}?experience/i,
    );
    if (ym && +ym[1] > 0) experience = ym[2] && +ym[2] > +ym[1] ? `${ym[1]}–${ym[2]} yrs` : `${ym[1]}+ yrs`;
  }
  if (!experience) {
    const months = ld.experienceRequirements?.monthsOfExperience;
    if (typeof months === 'number') {
      experience = months <= 0 ? 'Freshers welcome' : months <= 24 ? '0–2 yrs' : months <= 60 ? '2–5 yrs' : '5+ yrs';
    }
  }

  // apply-by (drop if missing / past)
  let applyBy = '';
  if (ld.validThrough && new Date(ld.validThrough) > new Date()) applyBy = fmtDay(ld.validThrough);

  const datePosted = ld.datePosted ? fmtDay(ld.datePosted) : '';

  // salary
  let salary = '';
  const bs = ld.baseSalary?.value;
  if (bs) {
    const cur = ld.baseSalary.currency === 'INR' ? '₹' : (ld.baseSalary.currency ? ld.baseSalary.currency + ' ' : '');
    const unit = ({ HOUR: '/hr', DAY: '/day', WEEK: '/wk', MONTH: '/mo', YEAR: '/yr' })[bs.unitText] || '';
    if (bs.minValue && bs.maxValue) salary = `${cur}${(+bs.minValue).toLocaleString('en-IN')}–${(+bs.maxValue).toLocaleString('en-IN')}${unit}`;
    else if (bs.value) salary = `${cur}${(+bs.value).toLocaleString('en-IN')}${unit}`;
  }
  if (!salary) {
    const s = descriptionText.match(/(?:package|salary|stipend|ctc)\s*:?\s*((?:₹|rs\.?|inr)?\s*\d[\d,]*(?:\s*[-–]\s*\d[\d,]*)?\s*(?:\/?\s*(?:month|pm|lpa|per annum|annum|year))?)/i);
    if (s) {
      salary = s[1].replace(/\s+/g, ' ').trim()
        .replace(/^(\d)/, '₹$1')
        .replace(/(\d)\s*[-–]\s*(\d)/, '$1–$2')
        .replace(/\/?\s*month$/i, '/mo').replace(/\/?\s*(lpa|per annum|annum|year)$/i, '/yr');
    }
  }
  if (salary) {
    salary = salary.replace(/\d{4,}/g, (n) => (+n).toLocaleString('en-IN'));
  }

  let education = '';
  const er = ld.educationRequirements;
  education = typeof er === 'string' ? er : (er?.credentialCategory || '');
  if (/see job description/i.test(education)) education = '';

  const out = {
    id, url,
    title: String(ld.title).trim(),
    company: (ld.hiringOrganization?.name || '').trim(),
    location, employmentType, experience,
    industry: (ld.industry || '').trim(),
    datePosted, applyBy, salary, education,
    descriptionText: descriptionText.slice(0, 1400),
  };
  for (const k of Object.keys(out)) if (out[k] === '') delete out[k];
  return out;
}
