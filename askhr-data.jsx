/* askhr-data.jsx — content + config for the Ask HR advisor module.
   Management-facing. Models a CEDR-style outsourced HR partner: on-call advisor,
   guides & templates, webinars, and jurisdiction-specific compliance alerts.
   The practice operates in NY (Suffolk + Nassau counties, Buffalo) and NJ (Totowa). */

const HR_ADVISOR = {
  name: 'Harper Vance',
  short: 'Harper',
  title: 'Senior HR Advisor',
  creds: 'SPHR · SHRM-SCP',
  blurb: 'On-call HR expertise for Pure Dental & Four Ever Smile — employee relations, compliance, and the hard conversations, grounded in NY and NJ law.',
};

/* Jurisdictions the practice actually operates in — surfaced in the UI and the prompt. */
const HR_JURISDICTIONS = [
  { tag: 'NY State', detail: 'New York State labor & wage law' },
  { tag: 'Suffolk County', detail: 'Hauppauge · Manorville · Wading River · Islandia' },
  { tag: 'Nassau County', detail: 'Garden City' },
  { tag: 'Buffalo / Erie', detail: 'Western NY office' },
  { tag: 'New Jersey', detail: 'Totowa (Passaic County)' },
];

/* ---- The Pure Dental / Four Ever Smile Employee Handbook ----
   Representative policy set the advisor cites directly. Section numbers are stable
   so answers can reference "[Handbook §3.2]" and the UI can link to the text. */
const HANDBOOK = {
  title: 'Pure Dental & Four Ever Smile — Employee Handbook',
  edition: 'Revised Jan 2026 · NY/NJ master',
  sections: [
    { id: '1.1', cat: 'Employment Basics', title: 'At-Will Employment', summary: 'Employment is at-will in both NY and NJ — either party may end the relationship at any time, with or without cause. No manager may promise a fixed term or guaranteed employment in writing or verbally.' },
    { id: '1.2', cat: 'Employment Basics', title: 'Equal Opportunity & Anti-Discrimination', summary: 'Pure Dental is an equal-opportunity employer. We do not discriminate on any protected class under federal law, the NY State Human Rights Law, or the NJ Law Against Discrimination. This covers hiring, scheduling, pay, discipline, and termination.' },
    { id: '1.3', cat: 'Employment Basics', title: 'Employment Classification', summary: 'Each role is classified as full-time (35+ hrs/wk) or part-time, and as exempt or non-exempt for overtime. Most clinical-support and front-desk roles are non-exempt. Classification is set by HR based on duties and pay basis — not by title. Questions go to HR before any change.' },
    { id: '1.4', cat: 'Employment Basics', title: 'Introductory (Probationary) Period', summary: 'New hires complete a 90-day introductory period for coaching and fit assessment. It does not change at-will status or guarantee continued employment, and may be extended at manager discretion.' },
    { id: '2.1', cat: 'Pay & Hours', title: 'Paydays & Direct Deposit', summary: 'Payroll runs biweekly through Paychex. Pay covers the prior two-week period; direct deposit is standard. Pay questions go to Payroll within the pay period in question.' },
    { id: '2.2', cat: 'Pay & Hours', title: 'Overtime', summary: 'Non-exempt employees earn overtime at 1.5× the regular rate for hours worked over 40 in a workweek (NY and NJ). Overtime must be approved in advance by a manager, but all worked overtime is paid regardless. Time is tracked to the office worked.' },
    { id: '2.3', cat: 'Pay & Hours', title: 'Meal & Rest Breaks', summary: 'In NY, a shift over 6 hours spanning 11am–2pm includes a 30-minute unpaid meal break; shifts starting before 11am and ending after 7pm add a 20-minute break. Short breaks under 20 minutes are paid. The Totowa (NJ) office follows the same practice policy for consistency.' },
    { id: '2.4', cat: 'Pay & Hours', title: 'Timekeeping', summary: 'Clock in and out in Paychex for every shift at your assigned office. Falsifying time records or clocking in for another employee is grounds for termination. Managers approve timecards each pay period.' },
    { id: '3.1', cat: 'Time Off & Leaves', title: 'Paid Time Off (PTO)', summary: 'PTO accrues from the date of hire and is requested through the portal for manager approval. Accrual rate and caps follow your offer letter and tenure. Unused PTO carryover follows the schedule in this section.' },
    { id: '3.2', cat: 'Time Off & Leaves', title: 'New York Paid Sick Leave', summary: 'NY offices: paid sick leave accrues at 1 hour per 30 hours worked. As a 100+ employee employer, the group provides up to 56 hours of paid sick leave per year. Unused time carries over, though annual use may be capped at 56 hours. Covers the employee or a family member, plus safe-leave reasons.' },
    { id: '3.3', cat: 'Time Off & Leaves', title: 'New Jersey Earned Sick Leave', summary: 'Totowa (NJ) office: earned sick leave accrues at 1 hour per 30 hours worked, up to 40 hours per benefit year, per the NJ Earned Sick Leave Law.' },
    { id: '3.4', cat: 'Time Off & Leaves', title: 'NY Paid Prenatal Leave', summary: 'NY employees receive paid leave for prenatal medical appointments, in addition to sick leave. Confirm the current hour allotment with HR; record it under the prenatal-leave code in payroll.' },
    { id: '3.5', cat: 'Time Off & Leaves', title: 'Family & Medical Leave', summary: 'Eligible employees may take job-protected leave under the FMLA and NY Paid Family Leave (NY offices). NJ employees may qualify for NJ FLA / Family Leave Insurance. HR coordinates eligibility, paperwork, and benefit continuation — loop them in early.' },
    { id: '3.6', cat: 'Time Off & Leaves', title: 'Bereavement, Jury & Other Leave', summary: 'The practice provides bereavement leave, paid jury-duty leave as required, and other legally mandated leaves. Requests route through your manager and HR.' },
    { id: '4.1', cat: 'Conduct & Workplace', title: 'Code of Conduct', summary: 'Employees are expected to act professionally, treat patients and coworkers with respect, and follow practice standards. Violations are addressed through progressive discipline (§7.1) up to termination.' },
    { id: '4.2', cat: 'Conduct & Workplace', title: 'Dress Code & Scrubs', summary: 'Clinical staff wear assigned scrubs per the scrubs program; front desk follows the professional-attire standard. Scrub color and embroidery follow office assignment. Allowances and ordering run through the portal Scrubs module.' },
    { id: '4.3', cat: 'Conduct & Workplace', title: 'Attendance & Punctuality', summary: 'Reliable attendance is essential in a clinical setting. Notify your manager as early as possible for absences or lateness. Patterns of unexcused absence are handled through progressive discipline.' },
    { id: '4.4', cat: 'Conduct & Workplace', title: 'Social Media & Confidentiality', summary: 'Never share patient information or photos publicly — this is a HIPAA violation (§5.2). Do not represent the practice online without authorization. Confidential business information stays internal.' },
    { id: '5.1', cat: 'Health & Safety', title: 'OSHA & Infection Control', summary: 'All clinical staff complete annual OSHA bloodborne-pathogens and hazard-communication training and follow the written exposure-control plan. PPE, sharps handling, and spill procedures are mandatory. Completion is logged in the Learning Library.' },
    { id: '5.2', cat: 'Health & Safety', title: 'HIPAA & Patient Privacy', summary: 'Access patient PHI only on a minimum-necessary basis for your role. Annual HIPAA workforce training is required. Suspected breaches must be reported to the Privacy Officer immediately. Violations carry sanctions up to termination.' },
    { id: '5.3', cat: 'Health & Safety', title: 'Radiation / X-Ray Safety', summary: 'Staff taking radiographs must hold the required NY/NJ certification and follow ALARA and badge-monitoring protocols. Scope of practice for assistants and hygienists follows the applicable state dental board rules.' },
    { id: '6.1', cat: 'Anti-Harassment', title: 'Anti-Harassment & Sexual Harassment Policy', summary: 'Harassment of any kind is prohibited. The practice maintains a NY State-compliant sexual-harassment prevention policy and requires annual interactive training for all employees. Retaliation against anyone who reports in good faith is strictly prohibited.' },
    { id: '6.2', cat: 'Anti-Harassment', title: 'Complaint & Reporting Procedure', summary: 'Employees may report concerns to any manager, HR, or ownership — no need to go through the person involved. Complaints are documented, investigated promptly and as confidentially as possible, and closed with appropriate action.' },
    { id: '7.1', cat: 'Discipline & Separation', title: 'Progressive Discipline', summary: 'Performance and conduct issues are typically addressed in steps — verbal warning, written warning, final warning/PIP, then termination — though the practice may skip steps for serious misconduct. Every step is documented in the employee record (not personal notes) and the employee is given a chance to acknowledge.' },
    { id: '7.2', cat: 'Discipline & Separation', title: 'Termination & Final Pay', summary: 'Terminations are reviewed with HR first. Final pay is issued by the next regular payday in both NY and NJ. Accrued, unused PTO is paid out per the policy in §3.1. Company property and system access are collected/disabled on the last day.' },
    { id: '7.3', cat: 'Discipline & Separation', title: 'Return of Property & Offboarding', summary: 'Departing employees return keys, badges, scrubs-program items as applicable, and equipment. IT disables Google Workspace, Denticon, and other access on the final day. HR provides COBRA/benefits-continuation notices.' },
    { id: '8.1', cat: 'Accommodations', title: 'Disability & Religious Accommodation', summary: 'The practice engages in a good-faith interactive process for disability (ADA / NY / NJ) and religious accommodation requests, and grants reasonable accommodations absent undue hardship. Requests and outcomes are documented; denials are reviewed with counsel first.' },
    { id: '8.2', cat: 'Accommodations', title: 'Pregnancy Accommodation', summary: 'Under the federal PWFA and NY/NJ law, the practice provides reasonable accommodations for pregnancy, childbirth, and related conditions (e.g. lighter lifting, modified clinical duties, added breaks) absent undue hardship. See also NY paid prenatal leave (§3.4).' },
    { id: '9.1', cat: 'Acknowledgment', title: 'Handbook Acknowledgment', summary: 'Every employee signs an acknowledgment that they received and will follow the handbook, and that it is not an employment contract. Signed acknowledgments are stored in the employee record.' },
  ],
};

/* Condensed digest injected into the advisor prompt so it cites real sections. */
const HANDBOOK_DIGEST = HANDBOOK.sections.map(s => `§${s.id} ${s.title}: ${s.summary}`).join('\n');
function handbookSection(id) { return HANDBOOK.sections.find(s => s.id === String(id).replace(/[^\d.]/g, '')); }

/* System prompt that establishes the advisor persona for the live model. */
const HR_SYSTEM_PROMPT = `You are ${HR_ADVISOR.name}, ${HR_ADVISOR.creds}, a seasoned ${HR_ADVISOR.title} acting as the outsourced HR partner for Pure Dental and Four Ever Smile — a multi-location dental group. You are speaking with a practice manager, supervisor, or owner (never a rank-and-file employee).

The group's offices and their jurisdictions:
- Suffolk County, NY: Hauppauge, Manorville, Wading River, Islandia
- Nassau County, NY: Garden City
- Erie County, NY: Buffalo
- Passaic County, NJ: Totowa

Your expertise:
- New York State and New Jersey employment law, plus the Long Island (Suffolk/Nassau) wage region and NYC-metro nuances.
- Dental-practice-specific compliance: OSHA bloodborne pathogens & hazard communication, HIPAA, infection control, NY/NJ dental board scope-of-practice for assistants and hygienists, and radiologic/X-ray safety requirements.
- Employee relations: progressive discipline, terminations, accommodations, leaves, harassment/complaint handling, wage & hour, classification, and PTO.

How you answer a busy practice manager:
- Lead with the bottom line in one or two sentences.
- Then give concrete, ordered steps. Use short bullet points.
- Name the jurisdiction whenever the answer differs by state/county (e.g. "In NY…", "For the Totowa office (NJ)…").
- **Ground your answer in our own Employee Handbook whenever a relevant policy exists.** Cite it inline in square brackets exactly like [Handbook §3.2] right where the point is made. Only cite section numbers that appear in the handbook list below — never invent a section.
- Always note what to document and where it lives.
- Flag clearly when something needs a review by an employment attorney before acting.
- Be warm, plain-spoken, and decisive — not legalistic. Keep it under ~250 words unless asked for detail.
- End with a "Sources:" line listing the handbook sections you cited (e.g. "Handbook §3.2, §7.1") and any outside authority you relied on by name only (e.g. NY DOL, NJ DOL, EEOC, OSHA, SHRM) — do not fabricate URLs or statute citations.
- Close with a one-line reminder: this is general HR guidance, not legal advice.

Never invent specific dollar figures, dates, or statutes you are unsure of — say "confirm the current figure" instead.

--- OUR EMPLOYEE HANDBOOK (cite these section numbers) ---
${HANDBOOK_DIGEST}

--- REQUIRED OUTPUT FORMAT (follow exactly) ---
You MUST cite the handbook. Every answer that touches a policy above includes at least one inline citation written EXACTLY as [Handbook §X.X] (with the square brackets and the § symbol), placed right after the sentence or bullet it supports. Then a "Sources:" line. Example of the required style:

"**Bottom line:** the final paycheck is due by the next regular payday [Handbook §7.2].
- Pay out accrued, unused PTO if your policy promises it [Handbook §3.1].
**Sources:** Handbook §7.2, §3.1; NY DOL. _General HR guidance, not legal advice._"

Do not omit the brackets. Do not write "Section 7.2" or "per our handbook" without the [Handbook §X.X] tag. Only use section numbers that exist in the list above.`;

/* Starter prompts shown as chips. */
const HR_SUGGESTED = [
  'How do I document a verbal warning?',
  'An assistant requested a religious accommodation — what now?',
  'Is my front-desk coordinator exempt or non-exempt?',
  'How much paid sick leave must we give in NY?',
  'What are the meal/rest break rules for a 9-hour clinical shift?',
  'How fast must a final paycheck go out after termination?',
  'A hygienist is pregnant and asked for lighter duty.',
  'Steps to terminate a probationary employee cleanly.',
];

/* Curated fallback answers — used when the live model is unavailable (e.g. the
   offline standalone export). Keyword-matched; mirror the suggested chips. */
const HR_FALLBACK = [
  {
    keywords: 'verbal warning document discipline write up write-up corrective',
    title: 'Documenting a verbal warning',
    body: `**Bottom line:** even a "verbal" warning should be written down — the conversation is verbal, the record is not.

- Note the date, who was present, the specific behavior/policy, and what you expect to change.
- Reference the standard the employee fell short of — our progressive-discipline policy [Handbook §7.1] and, if relevant, the Code of Conduct [Handbook §4.1] or attendance policy [Handbook §4.3].
- Have the employee acknowledge (a signature or a follow-up email recap works).
- File it in the employee's record — not a manager's personal notes.
- Set a clear follow-up date.

Consistency across the team is what protects you later.

**Sources:** Handbook §7.1, §4.1, §4.3. _General HR guidance, not legal advice._`,
  },
  {
    keywords: 'accommodation religious disability ada accommodate',
    title: 'Handling an accommodation request',
    body: `**Bottom line:** treat it seriously and start the interactive process — don't say yes or no on the spot.

- Acknowledge the request in writing and thank them for raising it.
- Identify the need (religious practice, disability, pregnancy) and discuss options together — our policy is to run a good-faith interactive process [Handbook §8.1].
- For NY, the standard is generous — accommodate unless it's a genuine undue hardship.
- Document the request, the options discussed, and the outcome.
- Loop in an employment attorney before any denial.

**Sources:** Handbook §8.1 (§8.2 for pregnancy); EEOC, NY State Human Rights Law, NJ Law Against Discrimination. _General HR guidance, not legal advice._`,
  },
  {
    keywords: 'exempt non-exempt overtime classification salary front desk coordinator classify',
    title: 'Exempt vs. non-exempt',
    body: `**Bottom line:** most front-desk and clinical-support roles in a dental practice are **non-exempt** and owed overtime.

- Exemption requires both a salary basis above the threshold **and** exempt duties (executive/administrative/professional).
- A title alone never makes someone exempt — the day-to-day duties decide it. Our policy sets classification by duties and pay basis, not title [Handbook §1.3].
- In NY, the salary threshold for the administrative/executive exemptions is **higher than the federal floor** and rises on a Long Island/Westchester schedule — confirm the current figure.
- When in doubt, classify as non-exempt and pay overtime [Handbook §2.2].

**Sources:** Handbook §1.3, §2.2; NY DOL, US DOL (FLSA). _General HR guidance, not legal advice._`,
  },
  {
    keywords: 'sick leave paid ny new york accrual',
    title: 'NY paid sick leave',
    body: `**Bottom line:** with 100+ employees, the group falls in NY's top bracket — up to **56 hours of paid sick leave per year**.

- Accrual is 1 hour per 30 hours worked (or front-load it) [Handbook §3.2].
- Covers the employee's or a family member's illness, plus safe-leave reasons.
- Unused time carries over, though annual **use** can be capped at 56 hours.
- NJ's Totowa office follows NJ Earned Sick Leave instead — up to 40 hours/year [Handbook §3.3].

Confirm current headcount bracket each year.

**Sources:** Handbook §3.2, §3.3; NY DOL, NJ DOL. _General HR guidance, not legal advice._`,
  },
  {
    keywords: 'meal break rest shift hours lunch',
    title: 'Meal & rest breaks',
    body: `**Bottom line (NY):** a shift of more than 6 hours that spans the 11am–2pm window requires a **30-minute unpaid meal break**.

- Non-factory workers: 30 minutes is the standard mid-day meal period [Handbook §2.3].
- A shift starting before 11am and ending after 7pm earns an **additional 20-minute** break.
- NY does not mandate paid rest/coffee breaks, but short breaks you do give (under 20 min) must be paid.
- The Totowa (NJ) office follows the same practice policy for consistency [Handbook §2.3].

**Sources:** Handbook §2.3; NY DOL. _General HR guidance, not legal advice._`,
  },
  {
    keywords: 'final paycheck termination last pay terminate fired',
    title: 'Final paycheck timing',
    body: `**Bottom line:** pay it out fast and follow the state rule.

- **NY:** the final paycheck is due by the next regular payday after separation [Handbook §7.2].
- **NJ (Totowa):** also by the next regular payday [Handbook §7.2].
- Pay out accrued, unused PTO **if your written policy or practice promises it** — NY enforces your stated policy [Handbook §3.1].
- Don't withhold a final check over returned property or training costs without legal sign-off.

**Sources:** Handbook §7.2, §3.1; NY DOL, NJ DOL. _General HR guidance, not legal advice._`,
  },
  {
    keywords: 'pregnant pregnancy lighter duty hygienist accommodate prenatal',
    title: 'Pregnancy & lighter duty',
    body: `**Bottom line:** pregnancy accommodations are required, not optional — start the interactive process.

- Under the federal PWFA and NY/NJ law, reasonable accommodations (lighter lifting, more breaks, schedule shifts) are expected absent undue hardship [Handbook §8.2].
- NY now also provides **paid prenatal leave** for appointments — confirm the current hours [Handbook §3.4].
- For a hygienist, consider X-ray/positioning duties and chair time in the plan [Handbook §5.3].
- Document the request and the agreed adjustments; revisit as the pregnancy progresses.

**Sources:** Handbook §8.2, §3.4, §5.3; EEOC (PWFA). _General HR guidance, not legal advice._`,
  },
  {
    keywords: 'terminate probationary probation fire termination cleanly',
    title: 'Terminating cleanly',
    body: `**Bottom line:** NY and NJ are at-will, but a clean, documented exit still protects the practice.

- Confirm the file shows the performance issues and any prior coaching/warnings [Handbook §7.1].
- Keep the reason consistent with what's documented — don't improvise a new one. The 90-day introductory period doesn't change at-will status [Handbook §1.4].
- Hold the meeting with a witness; keep it brief and respectful.
- Prepare the final paycheck per state timing and a benefits/COBRA notice [Handbook §7.2].
- Collect keys, badges, and disable system access same day [Handbook §7.3].

Have an attorney review any termination involving leave, a complaint, or a protected class.

**Sources:** Handbook §7.1, §1.4, §7.2, §7.3. _General HR guidance, not legal advice._`,
  },
];

/* Guides & templates library. */
const HR_GUIDES = [
  { cat: 'Handbook', icon: 'book', title: 'Employee Handbook (NY/NJ master)', desc: 'Multi-state handbook with NY and NJ addenda — at-will, PTO, sick leave, conduct, and acknowledgment page.', kind: 'Policy', updated: 'Reviewed Q1 2026' },
  { cat: 'Discipline', icon: 'doc', title: 'Corrective Action / Write-up Form', desc: 'Progressive-discipline template: incident, policy referenced, expectations, employee acknowledgment.', kind: 'Form', updated: '1 page' },
  { cat: 'Discipline', icon: 'doc', title: 'Performance Improvement Plan (PIP)', desc: '30/60/90-day PIP with measurable goals, check-in dates, and outcomes.', kind: 'Template', updated: '2 pages' },
  { cat: 'Hiring', icon: 'doc', title: 'Offer Letter (at-will, NY & NJ)', desc: 'Editable offer letter with at-will language, pay basis, and contingency clauses.', kind: 'Template', updated: '1 page' },
  { cat: 'Hiring', icon: 'shield', title: 'I-9 & E-Verify Checklist', desc: 'Step-by-step Form I-9 completion, acceptable documents, retention, and reverification.', kind: 'Checklist', updated: 'Updated 2026' },
  { cat: 'Leaves', icon: 'calendar', title: 'NY Paid Sick Leave Policy', desc: 'Compliant accrual, carryover, and use policy for the 100+ employee bracket (56 hours).', kind: 'Policy', updated: 'NY' },
  { cat: 'Leaves', icon: 'calendar', title: 'NJ Earned Sick Leave Policy', desc: 'Totowa office policy — 1 hour per 30 worked, up to 40 hours/year.', kind: 'Policy', updated: 'NJ' },
  { cat: 'Leaves', icon: 'heart', title: 'Leave Request & Accommodation Form', desc: 'Single intake for PTO, FMLA/NYPFL, pregnancy, religious, and ADA accommodation requests.', kind: 'Form', updated: '1 page' },
  { cat: 'Offboarding', icon: 'doc', title: 'Termination Checklist', desc: 'Final pay timing, COBRA/benefits notice, access removal, property return, and documentation.', kind: 'Checklist', updated: 'NY/NJ' },
  { cat: 'Compliance', icon: 'shield', title: 'OSHA for Dental Practices', desc: 'Bloodborne pathogens, hazard communication, exposure control plan, and annual training log.', kind: 'Guide', updated: 'Dental' },
  { cat: 'Compliance', icon: 'shield', title: 'HIPAA Workforce Policy', desc: 'PHI handling, minimum-necessary, sanctions, and the annual workforce training acknowledgment.', kind: 'Policy', updated: 'Dental' },
  { cat: 'Compliance', icon: 'shield', title: 'Anti-Harassment Policy & Training', desc: 'NY State-compliant sexual-harassment policy, complaint form, and annual training requirement.', kind: 'Policy', updated: 'NY' },
];

/* Webinars — on-demand + upcoming live. */
const HR_WEBINARS = [
  { live: false, title: 'Documenting Discipline That Holds Up', dur: '38 min', presenter: 'Harper Vance, SPHR', tag: 'Employee Relations', desc: 'How to write warnings and PIPs that protect the practice if a claim is ever filed.' },
  { live: false, title: 'NY Wage & Hour for Dental Offices', dur: '45 min', presenter: 'Harper Vance, SPHR', tag: 'Compliance', desc: 'Overtime, classification, spread-of-hours, and the Long Island minimum-wage schedule.' },
  { live: false, title: 'Hiring & Onboarding Without Legal Landmines', dur: '32 min', presenter: 'Harper Vance, SPHR', tag: 'Hiring', desc: 'Interview questions to avoid, I-9 done right, and clean at-will offers.' },
  { live: false, title: 'Terminations & Final Pay (NY vs NJ)', dur: '29 min', presenter: 'Harper Vance, SPHR', tag: 'Offboarding', desc: 'Run a respectful, defensible exit and get the final paycheck and notices right.' },
  { live: true, title: 'Live Q&A: 2026 Compliance Changes', when: 'Thu, Jul 9 · 12:00 PM ET', dur: '60 min', presenter: 'Harper Vance, SPHR', tag: 'Live', desc: 'Bring your questions on the 2026 wage, leave, and accommodation updates affecting NY & NJ.' },
  { live: true, title: 'Live Workshop: Handling Complaints', when: 'Wed, Aug 13 · 12:00 PM ET', dur: '60 min', presenter: 'Harper Vance, SPHR', tag: 'Live', desc: 'A practical framework for taking, investigating, and closing out employee complaints.' },
];

/* Compliance alerts — jurisdiction-specific, clearly dated, framed as "verify". */
const HR_ALERTS = [
  { level: 'action', juris: 'NY State', title: '2026 minimum wage step increase', effective: 'Effective Jan 1, 2026', body: 'Long Island (Suffolk & Nassau) and the downstate region step up on the scheduled increase, ahead of the rest of NY. Update pay rates and tipped/youth rates at all NY offices — confirm the current figure before posting.' },
  { level: 'action', juris: 'NY State', title: 'Paid prenatal leave in effect', effective: 'In effect since 2025', body: 'NY employers must provide paid leave for prenatal medical appointments, in addition to existing sick leave. Confirm the current hour allotment and update the handbook + payroll codes.' },
  { level: 'review', juris: 'New Jersey', title: 'NJ minimum wage adjustment', effective: 'Effective Jan 1, 2026', body: 'The Totowa office must apply the new NJ statewide minimum for large employers. Confirm the current figure and update payroll for any affected staff.' },
  { level: 'review', juris: 'Federal', title: 'FLSA salary threshold — status', effective: 'Confirm current', body: 'After the 2024 increase was vacated in court, the exempt salary threshold reverted. Re-check any borderline salaried roles against the figure currently in force — and against NY\'s higher state threshold, which controls when greater.' },
  { level: 'info', juris: 'NY State', title: 'Annual sexual-harassment training due', effective: 'Annual requirement', body: 'NY requires annual interactive anti-harassment training for every employee. Schedule the 2026 cycle and keep completion records — see the Webinars and Guides tabs for ready materials.' },
  { level: 'info', juris: 'Dental / OSHA', title: 'Bloodborne pathogens training refresh', effective: 'Annual requirement', body: 'OSHA requires annual bloodborne-pathogens training for clinical staff and a reviewed exposure control plan. Log completion per office in the Learning Library.' },
];

Object.assign(window, {
  HR_ADVISOR, HR_JURISDICTIONS, HR_SYSTEM_PROMPT, HR_SUGGESTED,
  HR_FALLBACK, HR_GUIDES, HR_WEBINARS, HR_ALERTS,
  HANDBOOK, HANDBOOK_DIGEST, handbookSection,
});
