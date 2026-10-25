/* offersign.js — plain JS (no React/Babel) behind the candidate-facing offer link. Kept
   dependency-free on purpose: this page is reached by someone with no Google account and
   no app session, so it must not require sign-in or the rest of the app bundle to load. */
(function () {
  const params = new URLSearchParams(location.search);
  const id = params.get('id') || '';
  const token = params.get('token') || '';
  const card = document.getElementById('card');

  function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function money(o) { return o.pay ? esc(o.pay) + (o.payType === 'Salary' ? ' / yr' : ' / hr') : ''; }
  function fmtDate(d) { if (!d) return ''; try { return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return d; } }

  async function api(method, body) {
    const res = await fetch('/api/offersign' + (method === 'GET' ? ('?id=' + encodeURIComponent(id) + '&token=' + encodeURIComponent(token)) : ''), {
      method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify({ id, token, ...body }) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }

  function renderError(msg) {
    card.innerHTML = '<h1>This link isn’t valid</h1><p class="sub">' + esc(msg) + '</p><p class="desc">If you think this is a mistake, reach out to whoever sent you the offer and ask them to resend it.</p>';
  }

  function renderDone(decision) {
    if (decision === 'signed') {
      card.innerHTML = '<div class="status ok"><h1>You’re all set 🎉</h1><p>Thanks for accepting — we’ve let the team know, and someone will follow up with your orientation details shortly.</p></div>';
    } else {
      card.innerHTML = '<div class="status err"><h1>Thanks for letting us know</h1><p>We’ve recorded your decision. We appreciate the time you took to consider this role.</p></div>';
    }
  }

  function renderOffer(data) {
    const o = data.offer;
    const reasons = data.declineReasons || [];
    card.innerHTML =
      '<h1>Your offer from Pure Dental</h1>' +
      '<div class="sub">' + esc(o.name) + '</div>' +
      '<div class="row"><span class="label">Role</span><b>' + esc(o.role) + '</b></div>' +
      (o.office ? '<div class="row"><span class="label">Location</span><span>' + esc(o.office) + '</span></div>' : '') +
      (o.startDate ? '<div class="row"><span class="label">Start date</span><span>' + esc(fmtDate(o.startDate)) + '</span></div>' : '') +
      (o.pay ? '<div class="row"><span class="label">Pay</span><span>' + money(o) + '</span></div>' : '') +
      (o.jobDescription ? '<p class="desc">' + esc(o.jobDescription) + '</p>' : '') +
      (o.extra ? '<p class="desc">' + esc(o.extra) + '</p>' : '') +
      '<div class="actions">' +
      '<button class="btn-accept" id="goAccept">Accept &amp; sign</button>' +
      '<button class="btn-decline" id="goDecline">Decline</button>' +
      '</div>' +
      '<div id="panel"></div>';

    document.getElementById('goAccept').onclick = () => {
      document.getElementById('panel').innerHTML =
        '<div class="panel">' +
        '<div style="font-weight:600;margin-bottom:4px;">Type your full legal name to sign</div>' +
        '<input id="sigInput" placeholder="Full legal name" />' +
        '<div class="actions"><button class="btn-accept" id="submitSign" disabled>Confirm &amp; accept offer</button></div>' +
        '</div>';
      const sigInput = document.getElementById('sigInput');
      const submitBtn = document.getElementById('submitSign');
      sigInput.oninput = () => { submitBtn.disabled = !sigInput.value.trim(); };
      submitBtn.onclick = async () => {
        submitBtn.disabled = true; submitBtn.textContent = 'Submitting…';
        try { await api('POST', { decision: 'signed', signature: sigInput.value.trim() }); renderDone('signed'); }
        catch (e) { submitBtn.disabled = false; submitBtn.textContent = 'Confirm & accept offer'; alert('Couldn’t submit: ' + e.message); }
      };
    };

    document.getElementById('goDecline').onclick = () => {
      const opts = reasons.map(r => '<option value="' + esc(r) + '">' + esc(r) + '</option>').join('');
      document.getElementById('panel').innerHTML =
        '<div class="panel decline">' +
        '<div style="font-weight:600;margin-bottom:4px;">We’re sorry to hear that — can you tell us why?</div>' +
        '<select id="reasonSel"><option value="">— pick a reason —</option>' + opts + '</select>' +
        '<textarea id="noteInput" rows="2" placeholder="Anything else you’d like to share (optional)"></textarea>' +
        '<div class="actions"><button class="btn-decline" id="submitDecline" disabled>Submit decision</button></div>' +
        '</div>';
      const reasonSel = document.getElementById('reasonSel');
      const noteInput = document.getElementById('noteInput');
      const submitBtn = document.getElementById('submitDecline');
      const checkValid = () => { const needsNote = reasonSel.value === 'Other'; submitBtn.disabled = !reasonSel.value || (needsNote && !noteInput.value.trim()); };
      reasonSel.onchange = checkValid; noteInput.oninput = checkValid;
      submitBtn.onclick = async () => {
        submitBtn.disabled = true; submitBtn.textContent = 'Submitting…';
        try { await api('POST', { decision: 'declined', declineReason: reasonSel.value, declineNote: noteInput.value.trim() }); renderDone('declined'); }
        catch (e) { submitBtn.disabled = false; submitBtn.textContent = 'Submit decision'; alert('Couldn’t submit: ' + e.message); }
      };
    };
  }

  if (!id || !token) { renderError('This link is missing some information. Please use the exact link from your email.'); return; }
  api('GET').then(renderOffer).catch(e => renderError(e.message || 'This offer may have already been responded to.'));
})();
