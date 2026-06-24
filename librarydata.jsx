/* librarydata.jsx — Learning Library seed catalog + clerical/clinical orientation timelines.
   Timelines transcribed from the Pure Dental orientation guides. */

/* Intranet topic links — required for all new hires */
const INTRANET_LINKS = {
  'Dental Procedures / Terminology': [
    'Oral Anatomy & Tooth Numbering (1–32)', 'Maxillary / Mandibular & Quadrants', 'Tooth Surfaces',
    'Dental Conditions & Mouth-Related Terms', 'Dental Procedures & Treatment Terminology',
  ],
  'New Employee Onboarding': [
    'New Employee Orientation', 'Getting to Know Us', 'Office Tours / Introductions', 'Get to Know Our Doctors',
    'Our Rules to Live By', 'Standards of Conduct', 'Reality Check Quiz', 'The Wisdom of Geese',
  ],
};

const LIBRARY_CATEGORIES = ['Required', 'New Employee Onboarding', 'Dental Procedures / Terminology', 'Conflict Resolution', 'Basic Dental', 'Advanced Dental', 'Compliance', 'Software', 'Leadership & Management'];

/* Management / leadership development — articles, videos & webinars from reputable
   providers. Assigned to 'Management' (visible to managers & up). */
const MGMT_TRAINING = [
  { title: 'New Manager Fundamentals', category: 'Leadership & Management', type: 'video', source: 'LinkedIn Learning', required: true, assign: 'Management', dueDays: 30, url: 'https://www.linkedin.com/learning/topics/management' },
  { title: 'Coaching Skills Every Manager Needs', category: 'Leadership & Management', type: 'webinar', source: 'SHRM', required: true, assign: 'Management', dueDays: 30, url: 'https://www.shrm.org/topics-tools/topics/leadership-development' },
  { title: 'Giving Feedback That Actually Lands', category: 'Leadership & Management', type: 'article', source: 'Harvard Business Review', required: false, assign: 'Management', dueDays: null, url: 'https://hbr.org/topic/subject/giving-feedback' },
  { title: 'Handling Difficult Conversations at Work', category: 'Leadership & Management', type: 'article', source: 'MindTools', required: false, assign: 'Management', dueDays: null, url: 'https://www.mindtools.com/' },
  { title: 'Delegation & Prioritization for Leaders', category: 'Leadership & Management', type: 'video', source: 'American Management Assn.', required: false, assign: 'Management', dueDays: null, url: 'https://www.amanet.org/' },
  { title: 'Leading a Multi-Office Team', category: 'Leadership & Management', type: 'article', source: 'Gallup', required: false, assign: 'Management', dueDays: null, url: 'https://www.gallup.com/cliftonstrengths/en/management.aspx' },
  { title: 'Performance Reviews That Motivate', category: 'Leadership & Management', type: 'webinar', source: 'CEDR HR Solutions', required: false, assign: 'Management', dueDays: null, url: 'https://www.cedrsolutions.com/webinars/' },
  { title: 'Emotional Intelligence for Leaders', category: 'Leadership & Management', type: 'video', source: 'Center for Creative Leadership', required: false, assign: 'Management', dueDays: null, url: 'https://www.ccl.org/' },
  { title: 'Interviewing & Hiring Without Bias', category: 'Leadership & Management', type: 'webinar', source: 'SHRM', required: false, assign: 'Management', dueDays: null, url: 'https://www.shrm.org/topics-tools/topics/talent-acquisition' },
  { title: 'Building a Healthy Team Culture', category: 'Leadership & Management', type: 'article', source: 'Harvard Business Review', required: false, assign: 'Management', dueDays: null, url: 'https://hbr.org/topic/subject/organizational-culture' },
];

/* seed courses; assign:'all' = every new hire. type: video|doc|link */
function seedLibrary() {
  const out = [];
  let n = 1;
  INTRANET_LINKS['New Employee Onboarding'].forEach(t => out.push({ id: 'lib' + n++, title: t, category: 'New Employee Onboarding', type: 'link', source: 'Intranet', required: true, assign: 'all', dueDays: 5 }));
  INTRANET_LINKS['Dental Procedures / Terminology'].forEach(t => out.push({ id: 'lib' + n++, title: t, category: 'Dental Procedures / Terminology', type: 'link', source: 'Intranet', required: true, assign: 'all', dueDays: 14 }));
  out.push(
    { id: 'lib' + n++, title: 'Sexual Harassment Prevention Training', category: 'Compliance', type: 'video', source: 'Intranet', required: true, assign: 'all', dueDays: 3 },
    { id: 'lib' + n++, title: 'OSHA & Compliance', category: 'Compliance', type: 'video', source: 'Intranet', required: true, assign: 'all', dueDays: 3 },
    { id: 'lib' + n++, title: 'HIPAA Privacy & Security', category: 'Compliance', type: 'video', source: 'Intranet', required: true, assign: 'all', dueDays: 3 },
    { id: 'lib' + n++, title: 'Conflict Resolution in the Workplace', category: 'Conflict Resolution', type: 'video', source: 'Drive', required: false, assign: 'all', dueDays: null },
    { id: 'lib' + n++, title: 'Basic Dental: Oral Anatomy', category: 'Basic Dental', type: 'video', source: 'Drive', required: false, assign: 'all', dueDays: null },
    { id: 'lib' + n++, title: 'Customer Service & Phone Expectations', category: 'Basic Dental', type: 'doc', source: 'Drive', required: false, assign: 'Front Desk', dueDays: null },
    { id: 'lib' + n++, title: 'Advanced Dental: Implant & Surgical Assisting', category: 'Advanced Dental', type: 'video', source: 'Drive', required: false, assign: 'Clinical Team', dueDays: null },
    { id: 'lib' + n++, title: 'Advanced Dental: TRIOS Scanning', category: 'Advanced Dental', type: 'video', source: 'Drive', required: false, assign: 'Clinical Team', dueDays: null },
    { id: 'lib' + n++, title: 'Denticon University — Clerical Track', category: 'Software', type: 'link', source: 'Denticon', required: true, assign: 'Front Desk', dueDays: 14 },
  );
  MGMT_TRAINING.forEach(m => out.push({ id: 'lib' + n++, ...m }));
  return out;
}

/* ---- Orientation timelines (from the guides) ---- */
const CLINICAL_TIMELINE = [
  { wk: 'Week 1', focus: 'Room setup, sterilization & daily procedures', items: ['Room setup & disinfecting (counters, chair, hoses, barrier tape)', 'Lighting & suction: operation and cleaning', 'Sterilization: ultrasonic, instruments, sharps, cold sterile/Sporox', 'Statim / Statclave: use, water chamber, loading', 'Biohazard waste & Quattrocare', 'Sterilization area: case & supply storage, Nomads, imaging sensors', 'Room stock & supply levels', 'Beginning/end of day: compressor, O2/nitrous tanks, autoclave'] },
  { wk: 'Week 2', focus: 'Seating patients & Denticon', items: ['Seating & releasing patients, patient handoff', 'COVID protocol: hand washing, Peroxyl rinse', 'Preparing for the doctor: chart, basic setup', 'Denticon: navigation, login, chart, progress notes', 'Denticon Scheduler: indicators, looking up appointments', 'Imaging/X-rays: capture, view, search, move', 'Patient overview & medical history'] },
  { wk: 'Week 3', focus: 'Imaging & oral anatomy', items: ['Rinn positioning: BW / PA / FMS / Panorex', 'Nomad / wall-mounted: handling, use & care', 'Tooth numbering & identification (1–32)', 'Maxillary / Mandibular / Deciduous', 'Tooth surfaces & quadrants'] },
  { wk: 'Week 4', focus: 'Basic assisting, nitrous, handpieces & burs', items: ['Suctioning: angulation & techniques', 'Cheek & tongue retraction; Isolite', 'Nitrous/oxygen: tanks, gauges, Sentinel, flowmeter, masks', 'Handpieces: identification & lubrication (high/slow speed, implant)', 'Bur blocks: diamond/carbide, sterilization, lab burs'] },
  { wk: 'Week 5', focus: 'New patient consults, emergencies & post-op', items: ['New patient consults: evaluation, imaging, models, medical history', 'Emergencies: evaluation, imaging, communication to doctor', 'Post-op / follow-up: surgical post-op, suture removal, AOF surgery'] },
  { wk: 'Week 6', focus: 'Inserts & composite fillings', items: ['Inserts: cemented & screw-retained crowns, custom abutments', 'PMMA try-in & final zirconia bridge', 'Master models, temporaries, bleaching tray, nightguard', 'Composite fillings: room setup, anterior & posterior'] },
  { wk: 'Week 7', focus: 'Endo, posts & crown prep', items: ['Root canal therapy: assistant & side counter, bracket tray', 'Posts: counter & tray setup', 'Crown preparation: counter & tray setup', 'Lab scripts: creating, initials, receiving, pulling, archiving cases'] },
  { wk: 'Week 8', focus: 'Extractions', items: ['Extractions: assistant counter, side counter, bracket tray', 'Post-op instructions'] },
  { wk: 'Week 9', focus: 'Impressions, models & nightguards', items: ['Impressions: alginate & putty', 'Stone models: pouring & trimming', 'Nightguards/bleaching trays: Ministar, trimming, packaging'] },
  { wk: 'Week 10', focus: 'TRIOS training', items: ['Hardware & software', 'Setting up patient cases', 'Scan path & techniques', 'Sending cases'] },
  { wk: 'Week 11', focus: 'AOF surgeries & IV sedation', items: ['AOF surgery: back/side counters, surgical table setup, post-op', 'IV sedation: monitor, BP cuff, electrodes, sodium chloride, catheter, Tegaderm'] },
];

const CLERICAL_TIMELINE = [
  { wk: 'Week 1 · Day 1', focus: 'HR, mandated training & orientation', items: ['Employment / HR / payroll documentation', 'Sexual Harassment Prevention Training', 'OSHA & Compliance', 'Employee handbook & policies, dress code', 'New Employee Orientation, Getting to Know Us, office tours', 'Get to know our doctors, Rules to Live By, Standards of Conduct', 'Reality Check Quiz & The Wisdom of Geese'] },
  { wk: 'Week 1 · Day 2', focus: 'Systems & basic dental', items: ['Paychex: clocking in and out', 'Pure Dental Employee Intranet', 'Windows login / Chrome profile / Email / Google Chat', 'Denticon: navigation, scheduler, providers, toolbars', 'NexHealth: message center, forms, waitlist', 'Basic Dental Training (Oral Anatomy)', 'Customer service, phone expectations & call greetings', 'Confirmation & follow-up call guidelines', 'Insurance scripting & scheduling guidelines'] },
  { wk: 'Week 1 · Days 3–5', focus: 'Shadowing', items: ['Shadow provider consultations', 'Shadow check-in', 'Shadow provider surgery', 'Shadow check-out', 'Shadow front desk (manager discretion)'] },
  { wk: 'Week 2', focus: 'Dental terminology & Denticon University', items: ['Dental terminology, conditions & mouth-related terms', 'Adult oral dentition & tooth numbering', 'Procedures & treatment terminology', 'Denticon University (Clerical): add patient/dependent, notes, flash alerts', 'Email/text a patient; message team members', 'Scheduling an appointment; clerical practicum & survey', 'Buddy training: calls, scheduling, NexHealth, payments, Swell', 'Voicemail / email / faxes, restocking, new patient folders & welcome bags'] },
  { wk: 'Week 3', focus: 'Scheduling & records', items: ['Scheduling in Denticon: new patients, consults, hygiene, emergencies', 'Scheduling guidelines', 'Record requests / x-ray releases (unassisted)'] },
  { wk: 'Week 4', focus: 'Huddles & daily reports', items: ['Daily huddle / end of day', 'Daily reports: journal / chronological', 'Missing ledger entries & progress notes', 'New / missed / canceled patients'] },
  { wk: 'Week 5', focus: 'Insurance', items: ['Insurance terminology', 'Frequencies / limitations / benefits overview', 'Explanation of Benefits (EOB)', 'Kleer / Clerri'] },
  { wk: 'Week 6', focus: 'Route slips, treatment & financial', items: ['Route slip guidelines (doctor & hygiene)', 'Cancellations & quick fill', 'Unscheduled / pre-authorized treatment calls', 'Patient account breakdowns & treatment planning', 'Downgrades & insurance estimates', 'Financial planning'] },
];

/* ---- Training source-finder bot ---- */
/* Suggested management topics shown as chips. */
const MGMT_TOPICS = [
  'Coaching & feedback', 'Difficult conversations', 'Delegation', 'New manager basics',
  'Conflict resolution', 'Performance management', 'Time management', 'Team motivation',
  'Interviewing & hiring', 'Emotional intelligence', 'Running effective huddles', 'Leading a dental team',
];

/* Reputable providers the finder favors (also drives the offline fallback). */
const TRUSTED_SOURCES = [
  { provider: 'SHRM', formats: 'articles, webinars, toolkits', domain: 'shrm.org', note: 'The HR profession\u2019s standard body.' },
  { provider: 'Harvard Business Review', formats: 'articles, guides', domain: 'hbr.org', note: 'Research-backed management thinking.' },
  { provider: 'MindTools', formats: 'articles, videos', domain: 'mindtools.com', note: 'Practical, bite-size management skills.' },
  { provider: 'LinkedIn Learning', formats: 'video courses', domain: 'linkedin.com/learning', note: 'On-demand courses with certificates.' },
  { provider: 'American Management Assn.', formats: 'courses, webinars', domain: 'amanet.org', note: 'Established management-training nonprofit.' },
  { provider: 'CEDR HR Solutions', formats: 'webinars, guides', domain: 'cedrsolutions.com', note: 'HR + compliance for healthcare/dental.' },
  { provider: 'Gallup', formats: 'articles, assessments', domain: 'gallup.com', note: 'Manager & engagement research.' },
  { provider: 'Center for Creative Leadership', formats: 'articles, programs', domain: 'ccl.org', note: 'Leadership-development specialists.' },
];

/* System prompt for the live model. */
const SOURCE_FINDER_PROMPT = `You help a dental-practice manager find REPUTABLE management & leadership training. Given a topic, return 4-6 sources from well-established, credible providers only (e.g. SHRM, Harvard Business Review, MindTools, LinkedIn Learning, American Management Association, CEDR HR Solutions, Gallup, Center for Creative Leadership, ADA/AGD for dental-specific). Never invent obscure blogs or fake organizations.

Respond with ONLY a JSON array, no prose. Each item:
{"title": "specific resource title", "provider": "organization name", "format": "article" | "video" | "webinar" | "course", "url": "best stable URL you are confident about \u2014 prefer the provider's topic/landing page over a deep link you are unsure of", "why": "one short sentence on why it's reputable and useful"}

Favor a mix of formats (articles, videos, webinars). Keep titles realistic. If unsure of an exact URL, use the provider's main domain.`;

/* Topic-agnostic fallback used when the live model is unavailable. */
function trainingSourceFallback(topic) {
  const t = (topic || 'management skills').trim();
  const fmt = ['article', 'webinar', 'video', 'article', 'course', 'webinar'];
  return TRUSTED_SOURCES.slice(0, 6).map((s, i) => ({
    title: `${t.charAt(0).toUpperCase() + t.slice(1)} \u2014 ${s.provider}`,
    provider: s.provider,
    format: fmt[i],
    url: 'https://' + s.domain,
    why: s.note + ' (' + s.formats + ')',
  }));
}

Object.assign(window, {
  INTRANET_LINKS, LIBRARY_CATEGORIES, seedLibrary, CLINICAL_TIMELINE, CLERICAL_TIMELINE,
  MGMT_TRAINING, MGMT_TOPICS, TRUSTED_SOURCES, SOURCE_FINDER_PROMPT, trainingSourceFallback,
});