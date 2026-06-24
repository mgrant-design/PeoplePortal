/* i18n.jsx — runtime translation. Walks DOM text nodes + placeholders/titles and
   swaps them via per-language dictionaries. Extensible: addLanguage(code,name,dict).
   English is the source; unmatched strings fall back to English. */

const I18N = {
  langs: [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
    { code: 'uk', name: 'Українська' },
  ],
  dict: {
    es: {
      // nav + chrome
      'Dashboard': 'Panel', 'My onboarding': 'Mi incorporación', 'Onboarding status': 'Estado de incorporación',
      'Directory': 'Directorio', 'Scheduling': 'Horarios', 'My schedule': 'Mi horario', 'Time clock': 'Reloj de tiempo',
      'Learning': 'Formación', 'Reviews': 'Evaluaciones', 'Reports': 'Informes', 'Automations': 'Automatizaciones',
      'Offboarding': 'Salida', 'Offices': 'Oficinas', 'Admin': 'Administración', 'Roadmap': 'Hoja de ruta',
      'Ask Riley': 'Pregúntale a Riley', 'Sign out': 'Cerrar sesión', 'Help & navigation': 'Ayuda y navegación',
      'People Portal': 'Portal de personal', 'My profile': 'Mi perfil', 'Notifications': 'Notificaciones',
      // common
      'Required': 'Obligatorio', 'Recommended': 'Recomendado', 'Complete': 'Completado', 'Completed': 'Completado',
      'Done': 'Hecho', 'In progress': 'En curso', 'Pending': 'Pendiente', 'Approved': 'Aprobado', 'Active': 'Activo',
      'Submitted': 'Enviado', 'Under review': 'En revisión', 'Planned': 'Planificado', 'Declined': 'Rechazado',
      'Not started': 'Sin comenzar', 'Locked': 'Bloqueado', 'Action needed': 'Acción requerida',
      'Save': 'Guardar', 'Save changes': 'Guardar cambios', 'Cancel': 'Cancelar', 'Edit': 'Editar', 'Add': 'Añadir',
      'Start': 'Comenzar', 'Submit': 'Enviar', 'Next': 'Siguiente', 'Back': 'Atrás', 'Skip': 'Omitir', 'Finish': 'Finalizar',
      'Publish': 'Publicar', 'Published': 'Publicado', 'Draft': 'Borrador', 'Clock in': 'Fichar entrada', 'Clock out': 'Fichar salida',
      'Start break': 'Iniciar descanso', 'End break': 'Terminar descanso', 'Required *': 'Obligatorio *',
      'Add training': 'Añadir formación', 'Assign': 'Asignar', 'Make required': 'Marcar obligatorio', 'Make optional': 'Marcar opcional',
      'Submit a request': 'Enviar solicitud', 'Add planned feature': 'Añadir función planificada', 'Requests': 'Solicitudes',
      'Search name, title, email…': 'Buscar nombre, puesto, correo…', 'All offices': 'Todas las oficinas', 'All departments': 'Todos los departamentos',
      'Edit my info': 'Editar mi información', 'View full record': 'Ver expediente completo',
      'Add new hire': 'Añadir nueva contratación', 'Submit a new hire': 'Registrar nueva contratación', 'Send to HR': 'Enviar a RR. HH.',
      'Take the interactive tour': 'Hacer el recorrido interactivo', 'Resume where you left off': 'Continuar donde lo dejaste',
      'All locations': 'Todas las ubicaciones', 'Smart fill': 'Relleno inteligente', 'Copy': 'Copiar', 'Remove': 'Quitar',
      'Manager': 'Gerente', 'Supervisor': 'Supervisor', 'Employee': 'Empleado', 'Leadership': 'Dirección', 'Administrator': 'Administrador',
      'HR & Payroll': 'RR. HH. y Nómina', 'Provider': 'Profesional', 'Open shifts': 'Turnos abiertos', 'Coverage': 'Cobertura',
      'Welcome to Pure Dental': 'Bienvenido a Pure Dental', 'Personal': 'Personal', 'Employment': 'Empleo', 'Credentials': 'Credenciales',
      'Learning Library': 'Biblioteca de formación', 'Orientation timelines': 'Cronogramas de orientación', 'Library': 'Biblioteca',
      'Performance reviews': 'Evaluaciones de desempeño', 'Feature requests & roadmap': 'Solicitudes y hoja de ruta',
      'Request off': 'Pedir libre', 'Swap': 'Cambiar', 'Next shift': 'Próximo turno', 'Today': 'Hoy', 'Off': 'Libre',
    },
    uk: {
      'Dashboard': 'Панель', 'My onboarding': 'Моя адаптація', 'Onboarding status': 'Статус адаптації',
      'Directory': 'Довідник', 'Scheduling': 'Розклад', 'My schedule': 'Мій розклад', 'Time clock': 'Облік часу',
      'Learning': 'Навчання', 'Reviews': 'Оцінювання', 'Reports': 'Звіти', 'Automations': 'Автоматизації',
      'Offboarding': 'Звільнення', 'Offices': 'Офіси', 'Admin': 'Адміністрування', 'Roadmap': 'Дорожня карта',
      'Ask Riley': 'Запитати Райлі', 'Sign out': 'Вийти', 'Help & navigation': 'Довідка та навігація',
      'People Portal': 'Портал персоналу', 'My profile': 'Мій профіль', 'Notifications': 'Сповіщення',
      'Required': 'Обовʼязково', 'Recommended': 'Рекомендовано', 'Complete': 'Завершено', 'Completed': 'Завершено',
      'Done': 'Готово', 'In progress': 'У процесі', 'Pending': 'Очікує', 'Approved': 'Затверджено', 'Active': 'Активний',
      'Submitted': 'Надіслано', 'Under review': 'На розгляді', 'Planned': 'Заплановано', 'Declined': 'Відхилено',
      'Not started': 'Не розпочато', 'Locked': 'Заблоковано', 'Action needed': 'Потрібна дія',
      'Save': 'Зберегти', 'Save changes': 'Зберегти зміни', 'Cancel': 'Скасувати', 'Edit': 'Редагувати', 'Add': 'Додати',
      'Start': 'Почати', 'Submit': 'Надіслати', 'Next': 'Далі', 'Back': 'Назад', 'Skip': 'Пропустити', 'Finish': 'Завершити',
      'Publish': 'Опублікувати', 'Published': 'Опубліковано', 'Draft': 'Чернетка', 'Clock in': 'Почати зміну', 'Clock out': 'Завершити зміну',
      'Start break': 'Почати перерву', 'End break': 'Завершити перерву', 'Required *': 'Обовʼязково *',
      'Add training': 'Додати навчання', 'Assign': 'Призначити', 'Make required': 'Зробити обовʼязковим', 'Make optional': 'Зробити необовʼязковим',
      'Submit a request': 'Надіслати запит', 'Add planned feature': 'Додати заплановану функцію', 'Requests': 'Запити',
      'Search name, title, email…': 'Пошук імені, посади, пошти…', 'All offices': 'Усі офіси', 'All departments': 'Усі відділи',
      'Edit my info': 'Редагувати мої дані', 'View full record': 'Переглянути повний запис',
      'Add new hire': 'Додати нового працівника', 'Submit a new hire': 'Подати нового працівника', 'Send to HR': 'Надіслати у відділ кадрів',
      'Take the interactive tour': 'Пройти інтерактивний тур', 'Resume where you left off': 'Продовжити з того місця',
      'All locations': 'Усі локації', 'Smart fill': 'Розумне заповнення', 'Copy': 'Копіювати', 'Remove': 'Видалити',
      'Manager': 'Менеджер', 'Supervisor': 'Керівник', 'Employee': 'Працівник', 'Leadership': 'Керівництво', 'Administrator': 'Адміністратор',
      'HR & Payroll': 'Кадри та зарплата', 'Provider': 'Лікар', 'Open shifts': 'Відкриті зміни', 'Coverage': 'Покриття',
      'Welcome to Pure Dental': 'Ласкаво просимо до Pure Dental', 'Personal': 'Особисте', 'Employment': 'Працевлаштування', 'Credentials': 'Облікові дані',
      'Learning Library': 'Бібліотека навчання', 'Orientation timelines': 'Графіки орієнтації', 'Library': 'Бібліотека',
      'Performance reviews': 'Оцінювання ефективності', 'Feature requests & roadmap': 'Запити та дорожня карта',
      'Request off': 'Запросити вихідний', 'Swap': 'Обмін', 'Next shift': 'Наступна зміна', 'Today': 'Сьогодні', 'Off': 'Вихідний',
    },
  },
};

let _lang = (() => { try { return localStorage.getItem('pd_lang') || 'en'; } catch (e) { return 'en'; } })();
const _orig = new WeakMap();   // textNode -> original English
const _origAttr = new WeakMap(); // element -> {placeholder, title}
let _observer = null, _pending = false;

function tr(s, lang) { const d = I18N.dict[lang]; if (!d) return s; const key = s.trim(); const hit = d[key]; if (!hit) return s; return s.replace(key, hit); }

function translateNode(node, lang) {
  if (node.nodeType === 3) { // text
    const orig = _orig.has(node) ? _orig.get(node) : node.nodeValue;
    if (!/\S/.test(orig)) return;
    if (!_orig.has(node)) _orig.set(node, orig);
    const next = lang === 'en' ? orig : tr(orig, lang);
    if (node.nodeValue !== next) node.nodeValue = next;
  } else if (node.nodeType === 1) {
    const el = node;
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.isContentEditable) return;
    ['placeholder', 'title'].forEach(attr => {
      if (el.hasAttribute && el.hasAttribute(attr)) {
        const store = _origAttr.get(el) || {};
        const orig = (attr in store) ? store[attr] : el.getAttribute(attr);
        store[attr] = orig; _origAttr.set(el, store);
        el.setAttribute(attr, lang === 'en' ? orig : tr(orig, lang));
      }
    });
    for (let c = node.firstChild; c; c = c.nextSibling) translateNode(c, lang);
  }
}

function applyLang(lang) {
  _lang = lang; try { localStorage.setItem('pd_lang', lang); } catch (e) {}
  document.documentElement.setAttribute('lang', lang);
  if (document.body) translateNode(document.body, lang);
  ensureObserver();
}

function ensureObserver() {
  if (_observer || !document.body) return;
  _observer = new MutationObserver(muts => {
    if (_lang === 'en' || _pending) return;
    _pending = true;
    requestAnimationFrame(() => {
      _pending = false;
      muts.forEach(m => { m.addedNodes && m.addedNodes.forEach(n => translateNode(n, _lang)); if (m.type === 'characterData' && m.target) translateNode(m.target, _lang); });
    });
  });
  _observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

function setLang(lang) { applyLang(lang); }
function getLang() { return _lang; }
function getLanguages() { return I18N.langs.slice(); }
function addLanguage(code, name, dict) {
  if (!I18N.langs.find(l => l.code === code)) I18N.langs.push({ code, name });
  I18N.dict[code] = Object.assign(I18N.dict[code] || {}, dict || {});
  try { localStorage.setItem('pd_langs_custom', JSON.stringify(I18N.langs.filter(l => !['en', 'es', 'uk'].includes(l.code)))); localStorage.setItem('pd_dict_' + code, JSON.stringify(I18N.dict[code])); } catch (e) {}
}
/* restore any custom languages added previously */
(() => { try { const cl = JSON.parse(localStorage.getItem('pd_langs_custom')) || []; cl.forEach(l => { if (!I18N.langs.find(x => x.code === l.code)) I18N.langs.push(l); const d = JSON.parse(localStorage.getItem('pd_dict_' + l.code) || '{}'); I18N.dict[l.code] = d; }); } catch (e) {} })();

/* apply saved language once DOM is ready */
if (_lang !== 'en') { if (document.body) setTimeout(() => applyLang(_lang), 0); else window.addEventListener('DOMContentLoaded', () => applyLang(_lang)); }
else ensureObserver();

/* ---- Riley voice (speech synthesis) ---- */
const VOICE_LANG = { en: 'en-US', es: 'es-ES', uk: 'uk-UA' };
function pickVoice(lang) {
  const vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  const want = VOICE_LANG[lang] || 'en-US';
  const base = want.slice(0, 2);
  // 1) premium neural / natural voices first
  const natural = vs.filter(x => x.lang && x.lang.startsWith(base) && /natural|neural|online|premium|enhanced/i.test(x.name));
  const femaleNames = ['Aria', 'Jenny', 'Ava', 'Samantha', 'Sonia', 'Emma', 'Libby', 'Michelle', 'Google US English', 'Google español', 'Sabina', 'Paulina', 'Polina', 'Zira'];
  let v = natural.find(x => femaleNames.some(n => x.name.includes(n))) || natural[0];
  if (!v) v = vs.find(x => x.lang === want && femaleNames.some(n => x.name.includes(n)));
  if (!v) v = vs.find(x => x.lang === want);
  if (!v) v = vs.find(x => x.lang && x.lang.startsWith(base) && femaleNames.some(n => x.name.includes(n)));
  if (!v) v = vs.find(x => x.lang && x.lang.startsWith(base));
  return v || vs[0] || null;
}
function speak(text, opts) {
  opts = opts || {};
  if (!window.speechSynthesis || !text) return;
  try {
    speechSynthesis.cancel();
    const clean = String(text).replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim(); // strip [direction tags]
    const u = new SpeechSynthesisUtterance(clean);
    const v = pickVoice(opts.lang || _lang);
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = VOICE_LANG[opts.lang || _lang] || 'en-US'; }
    u.rate = opts.rate || 0.9;   // calm, unhurried
    u.pitch = 1.0;
    u.volume = 1;
    if (opts.onend) u.onend = opts.onend;
    speechSynthesis.speak(u);
  } catch (e) {}
}
function stopSpeak() { try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) {} }
// warm the voice list
if (window.speechSynthesis) { speechSynthesis.onvoiceschanged = () => {}; }

Object.assign(window, { I18N, setLang, getLang, getLanguages, addLanguage, speak, stopSpeak, pickVoice });
