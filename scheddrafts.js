/* scheddrafts.js — the Builder's unpublished edits, kept for the life of the page, keyed
   by week and office. Leaving the Builder (another tab or page) and coming back finds them
   where they were; publishing or discarding clears them. Repeat copies for future weeks
   (made when a shift is repeated) are kept alongside. */
(function () {
  const drafts = {};
  let repeats = [];
  let view = null;
  const key = (weekKey, office) => weekKey + '__' + office;
  const copy = (v) => JSON.parse(JSON.stringify(v));

  window.PD_DRAFTS = {
    put(weekKey, office, doc) { drafts[key(weekKey, office)] = copy(doc); },
    get(weekKey, office) { const d = drafts[key(weekKey, office)]; return d ? copy(d) : null; },
    clear(weekKey, office) { delete drafts[key(weekKey, office)]; },
    clearWeek(weekKey, offices) { offices.forEach(o => delete drafts[key(weekKey, o)]); },
    has(weekKey, offices) { return offices.some(o => !!drafts[key(weekKey, o)]); },
    hasAny() { return Object.keys(drafts).length > 0 || repeats.length > 0; },
    getRepeats() { return copy(repeats); },
    getView() { return view ? copy(view) : null; },
    setView(v) { view = copy(v); },
    clearAll() { Object.keys(drafts).forEach(k => delete drafts[k]); repeats = []; view = null; },
    setRepeats(list) { repeats = copy(list); },
  };
})();
