// PLOS Career URL resolver — maps Top Job Match employers to real career
// portal URLs so every match card has a live "View Posting →" link even for
// the fallback pipeline matches that don't ship with a URL from the source.
//
// Order matters: patterns are tried top-to-bottom and the first match wins.
// Where a match is generic, we route to the employer's aggregate careers
// page; where a match is very specific (e.g. USAID financial mgmt) we go
// straight to a pre-filtered search URL.
export type JobLike = {
  url?: string | null;
  apply_url?: string | null;
  employer?: string | null;
  company?: string | null;
  role_title?: string | null;
  title?: string | null;
};

type Rule = { employer_pattern: RegExp; role_pattern?: RegExp; url: string };

const RULES: Rule[] = [
  { employer_pattern: /asian development bank|\badb\b/i, url: "https://www.adb.org/work-with-us/careers" },
  { employer_pattern: /nato/i, url: "https://www.nato.int/cps/en/natohq/85321.htm" },
  { employer_pattern: /georgia state university|\bgsu\b|perimeter college/i, url: "https://careers.gsu.edu" },
  { employer_pattern: /usaid/i, url: "https://www.usajobs.gov/Search/Results?k=USAID+financial+management" },
  { employer_pattern: /state department|department of state/i, url: "https://careers.state.gov" },
  { employer_pattern: /world bank/i, url: "https://jobs.worldbank.org" },
  { employer_pattern: /undp|un development/i, url: "https://jobs.undp.org" },
  { employer_pattern: /\bimf\b|international monetary fund/i, url: "https://www.imf.org/en/About/Careers" },
  { employer_pattern: /devex/i, url: "https://www.devex.com/jobs" },
];

const FEDERAL_FALLBACK =
  "https://www.indeed.com/jobs?q=financial+management+federal&l=Atlanta%2C+GA";

export function resolveJobApplyUrl(job: JobLike): string {
  const direct = job.apply_url || job.url;
  if (direct && /^https?:\/\//i.test(direct)) return direct;

  const employer = (job.employer || job.company || "").trim();
  const role = (job.role_title || job.title || "").trim();
  for (const r of RULES) {
    if (r.employer_pattern.test(employer)) {
      if (!r.role_pattern || r.role_pattern.test(role)) return r.url;
    }
  }
  // Federal / government keyword hint → dedicated fallback
  if (/federal|government|dod|dept\.? of/i.test(`${employer} ${role}`)) {
    return FEDERAL_FALLBACK;
  }
  // Last resort — LinkedIn search for the exact role at the employer
  const q = encodeURIComponent(`${role} ${employer}`.trim());
  return `https://www.linkedin.com/jobs/search/?keywords=${q}`;
}
