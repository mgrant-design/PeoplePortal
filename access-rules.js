/* access-rules.js — the one copy of the rules that turn a roster record and its
   permission flags into an access level and capabilities. Loaded as a plain script by
   index.html and copied into api/_shared/ for the server (deploy workflow, npm run sync). */

(function () {
  const COMPANY_DOMAINS = ['puredental.com', 'foureversmile.com', 'puredentallab.com'];

  const LEVEL_LABELS = { admin: 'Administrator', hr: 'HR & Payroll', leadership: 'Leadership', accounting: 'Accounting', manager: 'Manager', supervisor: 'Supervisor', employee: 'Employee' };

  /* feature switches and their state before an admin saves any */
  const FEATURE_DEFAULTS = { scheduler: true, timeclock: true, reviews: true, automations: true, offboarding: true, offices: true, reports: true, ask: true, askhr: true, library: true, scrubs: true, applicants: true, paychex: true, provisionApi: false, resumeParse: true };

  /* a person who can sign in: anyone on the roster not Terminated or Suspended */
  const INACTIVE_STATUSES = ['Terminated', 'Suspended'];
  function isActive(emp) { return !!emp && !INACTIVE_STATUSES.includes(emp.status); }

  /* does this access see the whole company on a page? company-wide view always does;
     See Everyone does when its page list is empty or names the page */
  function seesAllOn(access, pageId) {
    if (!access) return false;
    if (access.caps && access.caps.viewAll) return true;
    const sa = access.seeAll;
    return !!(sa && sa.on && (!sa.pages.length || sa.pages.indexOf(pageId) >= 0));
  }

  /* me plus everyone below them, following managerEmail down every level */
  function reportingTree(me, employees) {
    const ids = new Set([me.id]);
    const emails = new Set([String(me.workEmail || '').toLowerCase()]);
    let changed = true;
    while (changed) {
      changed = false;
      employees.forEach(e => {
        if (!ids.has(e.id) && e.managerEmail && emails.has(e.managerEmail.toLowerCase())) {
          ids.add(e.id); emails.add(String(e.workEmail || '').toLowerCase()); changed = true;
        }
      });
    }
    return employees.filter(e => ids.has(e.id));
  }

  /* offboarding records about people in me's reporting tree (matched by empId) */
  function offboardingInTree(records, me, employees) {
    const ids = new Set(reportingTree(me, employees).map(e => e.id));
    return records.filter(r => ids.has(r.empId));
  }

  /* work email: first name dot last name; New Jersey hires get the second domain, everyone
     else the first. Letters only; a number is added when the address is taken. */
  function domainForOffice(office) { return /jersey|totowa/i.test(office || '') ? COMPANY_DOMAINS[1] : COMPANY_DOMAINS[0]; }
  function workEmailFor(first, last, office, takenEmails) {
    const PLAIN = { 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'ß': 'ss', 'ł': 'l', 'đ': 'd', 'ð': 'd', 'þ': 'th' };
    const plain = (s) => String(s || '').toLowerCase().replace(/[øæœßłđðþ]/g, (ch) => PLAIN[ch]).normalize('NFD').replace(/[^a-z]/g, '');
    const taken = new Set((takenEmails || []).map(e => String(e || '').toLowerCase()));
    const local = [plain(first), plain(last)].filter(Boolean).join('.');
    const domain = domainForOffice(office);
    let address = `${local}@${domain}`;
    for (let n = 2; taken.has(address); n++) address = `${local}${n}@${domain}`;
    return address;
  }

  /* folds a roster location into its office name */
  function normLoc(l) {
    const s = (l || '').toLowerCase();
    if (!s) return 'Unassigned';
    if (s.includes('remote')) return 'Remote';
    if (s.includes('hauppauge')) return 'Hauppauge';
    if (s.includes('garden')) return 'Garden City';
    if (s.includes('manorville')) return 'Manorville';
    if (s.includes('wading')) return 'Wading River';
    if (s.includes('islandia')) return 'Islandia';
    if (s.includes('jersey')) return 'New Jersey';
    if (s.includes('totowa')) return 'New Jersey';   /* Four Ever Smile Dental Spa — Totowa, NJ */
    if (s.includes('buffalo')) return 'Buffalo';
    return l;
  }

  /* offices a person may schedule, as folded office names: unset → their own office;
     ['*'] → all; a list → the listed offices that exist */
  function schedulableOffices({ me, perms, allOffices }) {
    const list = perms && Array.isArray(perms.schedLocations) ? perms.schedLocations : [];
    if (!list.length) return [normLoc(me.location)];
    const all = [...new Set(allOffices.map(normLoc))];
    if (list.includes('*')) return all;
    const picked = new Set(list.map(normLoc));
    return all.filter(o => picked.has(o));
  }

  /* a person's scheduling level for one office, from their Schedules setting:
     'edit' for an admin anywhere; for others with scheduling access, the offices in
     schedLocations (['*'] = all), or with none set their own office if they manage or
     supervise; HR and leadership otherwise read ('view'); everyone else sees only their own. */
  function scheduleLevel({ me, perms, flags, caps, office }) {
    const o = normLoc(office);
    if (flags.isAdmin) return 'edit';
    if (caps.schedule) {
      const list = perms && Array.isArray(perms.schedLocations) ? perms.schedLocations : [];
      if (list.length) { if (list.includes('*') || list.some(x => normLoc(x) === o)) return 'edit'; }
      else if ((flags.isManager || flags.isSupervisor) && o === normLoc(me.location)) return 'edit';
    }
    return caps.viewAll ? 'view' : 'none';
  }

  /* the offices (from a list of office names) this person may edit */
  function editableOfficeNames({ me, perms, flags, caps }, offices) {
    return offices.filter(o => scheduleLevel({ me, perms, flags, caps, office: o }) === 'edit');
  }

  /* may this person schedule someone from this department? Unset or ['*'] = any team. */
  function canScheduleTeam({ perms, flags }, department) {
    if (flags.isAdmin) return true;
    const list = perms && Array.isArray(perms.schedTeams) ? perms.schedTeams : [];
    return !list.length || list.includes('*') || list.includes(department);
  }

  function domainAllowed(email) {
    return COMPANY_DOMAINS.includes(String(email || '').toLowerCase().split('@')[1] || '');
  }

  /* viewAs: an admin preview level ('leadership', 'hr', 'accounting', 'supervisor',
     'manager', 'admin', or 'employee'); applied before capabilities are derived. */
  function deriveAccessCore({ me, perms, hasReports, isListedManager, viewAs }) {
    perms = perms || {};
    const dept = (me.department || '').toLowerCase();
    const title = (me.jobTitle || '').toLowerCase();

    let isExec = /\b(ceo|chief|coo|cfo|president|owner|principal)\b/.test(title) || ['leadership', 'management team', 'management', 'pure management'].includes(dept);
    let isHR = /human resources|payroll/.test(dept) || /\b(human resources|payroll|people ops)\b/.test(title);
    let isAccounting = /accounting/.test(dept) || /\b(controller|accountant|bookkeeper)\b/.test(title);
    let isSupervisor = (!!perms.supervisor || /\b(supervisor|team lead|lead)\b/.test(title)) && !/\b(manager|director)\b/.test(title) && !hasReports;
    let isManager = (!!perms.manager || !!me.isManager || !!isListedManager || !!hasReports
      || /\b(manager|director)\b/.test(title)) && !isSupervisor;
    let isAdmin = !!perms.admin;

    if (viewAs) {
      isExec = viewAs === 'leadership'; isHR = viewAs === 'hr'; isAccounting = viewAs === 'accounting';
      isSupervisor = viewAs === 'supervisor'; isManager = viewAs === 'manager'; isAdmin = viewAs === 'admin';
    }

    const seeAll = { on: !!perms.seeAll, pages: Array.isArray(perms.seeAllPages) ? perms.seeAllPages : [] };
    const level = isAdmin ? 'admin' : isHR ? 'hr' : isExec ? 'leadership' : isAccounting ? 'accounting' : isManager ? 'manager' : isSupervisor ? 'supervisor' : 'employee';

    const viewAll = isAdmin || isHR || isExec;
    const viewTeam = isManager || isSupervisor;
    const caps = {
      viewAll, viewTeam,
      seeInactive: viewAll,
      schedule: isAdmin || isHR || isExec || isManager || isSupervisor,
      onboardStatus: viewAll || isManager || isSupervisor,
      offboard: isAdmin || isHR || (isManager && !isExec),
      offboardView: isAdmin || isHR || isManager || isExec,
      print: !!perms.canPrint || isAdmin || isHR,
      suspend: !!perms.canSuspend || isAdmin || isHR,
      terminate: !!perms.canTerminate || isAdmin || isHR,
      manageUsers: isAdmin,
      hire: isAdmin || isHR || (isManager && !isExec),
      offices: isAdmin || isHR,
      payroll: isHR || isAccounting,
      reports: isAdmin || isHR || isExec || isManager || isSupervisor || isAccounting,
      relations: isAdmin || isHR || isManager,
      askHR: isAdmin || isHR || isExec || isManager || isSupervisor,
      recruiting: isAdmin || isHR || isExec || isManager,
      feedbackView: isAdmin || isHR || isExec || isManager,
    };
    return { level, label: LEVEL_LABELS[level], seeAll, flags: { isExec, isHR, isAccounting, isManager, isSupervisor, isAdmin }, caps, perms };
  }

  /* a birth date as month and day only ("03-14"), from "1990-03-14" or "3/14/1990"; managers
     see their team's birthdays this way, without the year */
  function monthDay(v) {
    const s = String(v || '').trim();
    let m = /^\d{4}-(\d{2})-(\d{2})/.exec(s);
    if (m) return m[1] + '-' + m[2];
    m = /^(\d{1,2})\/(\d{1,2})\/\d{2,4}/.exec(s);
    if (m) return m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
    return '';
  }
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  /* "03-14" reads "March 14"; a full date is shown as stored */
  function birthdayLabel(v) {
    const m = /^(\d{2})-(\d{2})$/.exec(String(v || ''));
    return m && MONTH_NAMES[+m[1] - 1] ? MONTH_NAMES[+m[1] - 1] + ' ' + (+m[2]) : (v || '');
  }

  const api = { monthDay, birthdayLabel, COMPANY_DOMAINS, LEVEL_LABELS, FEATURE_DEFAULTS, isActive, seesAllOn, scheduleLevel, editableOfficeNames, canScheduleTeam, reportingTree, offboardingInTree, domainForOffice, workEmailFor, normLoc, schedulableOffices, domainAllowed, deriveAccessCore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.PD_ACCESS_RULES = api;
})();
