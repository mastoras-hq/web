var API = 'https://api.mastoras.uk';
var state = { clients: [], notesTimer: null };

/* ── INIT ── */
window.addEventListener('DOMContentLoaded', function () {
  document.getElementById('search').addEventListener('input', renderList);
  document.getElementById('status-filter').addEventListener('change', renderList);
  document.addEventListener('click', handleActionClick);
  document.addEventListener('change', handleControlChange);
  document.addEventListener('input', handleControlInput);
  document.addEventListener('focusout', handleControlFocusOut);
  document.addEventListener('keydown', handleActionKeydown);

  mastorasAuth.requireSession().then(function () {
    loadClients();
  }).catch(function () {});
});

function handleActionClick(event) {
  var control = event.target.closest('[data-action]');
  if (!control) return;
  var action = control.dataset.action;
  if (action === 'sign-out') { event.preventDefault(); mastorasAuth.signOut(); }
  else if (action === 'submit-new-call') submitNewCall();
  else if (action === 'close-call-modal') closeCallModal();
  else if (action === 'open-call-modal') openCallModal();
  else if (action === 'show-list') showList();
  else if (action === 'open-client') openClient(control.dataset.clientId);
  else if (action === 'toggle-call-form') toggleCallForm();
  else if (action === 'log-call') logCall(control.dataset.clientId);
  else if (action === 'download-document') downloadDoc(control.dataset.documentId);
  else if (action === 'delete-document') deleteDoc(control.dataset.documentId, control.dataset.clientId);
}

function handleControlChange(event) {
  if (event.target.id === 'status-select') {
    saveStatus(event.target.dataset.clientId, event.target.value);
  } else if (event.target.id === 'doc-file') {
    uploadDoc(event.target.dataset.clientId);
  }
}

function handleControlInput(event) {
  if (event.target.id === 'client-notes') scheduleNotes(event.target.dataset.clientId);
}

function handleControlFocusOut(event) {
  if (event.target.id === 'client-notes') saveNotes(event.target.dataset.clientId);
}

function handleActionKeydown(event) {
  var control = event.target.closest('[data-action="open-client"]');
  if (!control || control.tagName !== 'TR' || (event.key !== 'Enter' && event.key !== ' ')) return;
  event.preventDefault();
  openClient(control.dataset.clientId);
}

function headers() { return { 'Content-Type': 'application/json' }; }

function escHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function safeHttpUrl(value) {
  try {
    var parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
  } catch (_) { return ''; }
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}
function money(n) { return '£' + (Number(n)||0).toLocaleString('en-GB'); }
function isValidEmail(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }

var STATUS_BADGE = {
  'Lead':'badge-lead', 'Clarity Call Booked':'badge-call', 'Clarity Call Done':'badge-call',
  'Active Engagement':'badge-active', 'Delivered':'badge-delivered',
  'Closed — Won':'badge-won', 'Closed — Lost':'badge-lost', 'Not a Fit':'badge-nofit'
};
function statusBadge(s) {
  var cls = STATUS_BADGE[s] || 'badge-closed';
  return '<span class="badge ' + cls + '">' + escHtml(s || 'Lead') + '</span>';
}

/* ── LIST ── */
function loadClients() {
  fetch(API + '/clients', { headers: headers() })
  .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(function (data) { state.clients = data || []; renderStats(); renderList(); })
  .catch(function () {
    document.getElementById('clients-tbody').innerHTML =
      '<tr><td colspan="6" class="empty">Couldn\'t load clients. Check your connection and try again.</td></tr>';
  });
}

function renderStats() {
  var c = state.clients;
  var active = c.filter(function (x) {
    return ['Clarity Call Booked','Clarity Call Done','Active Engagement'].indexOf(x.status) !== -1;
  }).length;
  var reports = c.reduce(function (a,x) { return a + (x.report_count||0); }, 0);
  var approved = c.reduce(function (a,x) { return a + (x.approved||0); }, 0);
  var value = c.reduce(function (a,x) { return a + (x.value_awarded||0); }, 0);
  document.getElementById('s-clients').textContent = c.length;
  document.getElementById('s-active').textContent = active;
  document.getElementById('s-reports').textContent = reports;
  document.getElementById('s-approved').textContent = approved;
  document.getElementById('s-value').textContent = money(value);
}

function renderList() {
  var q = (document.getElementById('search').value || '').toLowerCase();
  var sf = document.getElementById('status-filter').value;
  var rows = state.clients.filter(function (c) {
    var hay = ((c.name||'') + ' ' + (c.org_name||'') + ' ' + (c.email||'')).toLowerCase();
    var okQ = !q || hay.indexOf(q) !== -1;
    var okS = !sf || c.status === sf;
    return okQ && okS;
  });
  var tb = document.getElementById('clients-tbody');
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="6" class="empty">No clients yet. They\'ll appear here as reports, BRICK assessments and enquiries come in.</td></tr>';
    return;
  }
  tb.innerHTML = rows.map(function (c) {
    var nameLine = c.name ? escHtml(c.name) : (c.org_name ? escHtml(c.org_name) : '<em style="color:#bbb">No name</em>');
    var orgLine = (c.name && c.org_name) ? '<div class="client-org">' + escHtml(c.org_name) + '</div>' : '';
    var brick = (c.brick_score !== null && c.brick_score !== undefined) ? (c.brick_score + '/24') : '—';
    return '<tr data-action="open-client" data-client-id="' + escHtml(c.id) + '" tabindex="0" role="button">' +
      '<td><span class="client-name">' + nameLine + '</span>' + orgLine +
        (c.email ? '<div class="client-org">' + escHtml(c.email) + '</div>' : '') + '</td>' +
      '<td><span class="badge badge-source">' + escHtml(c.source || '—') + '</span></td>' +
      '<td>' + statusBadge(c.status) + '</td>' +
      '<td class="col-hide">' + (c.report_count||0) + '</td>' +
      '<td class="col-hide">' + brick + '</td>' +
      '<td class="col-hide">' + fmtDate(c.last_activity) + '</td>' +
    '</tr>';
  }).join('');
}

/* ── PROFILE ── */
function showList() {
  document.getElementById('profile-view').style.display = 'none';
  document.getElementById('list-view').style.display = 'block';
  document.querySelector('.stats').style.display = 'grid';
  loadClients();
  window.scrollTo(0,0);
}

function openClient(id) {
  document.getElementById('list-view').style.display = 'none';
  document.getElementById('profile-view').style.display = 'block';
  document.getElementById('profile-content').innerHTML = '<p class="loading">Loading client…</p>';
  window.scrollTo(0,0);
  fetch(API + '/clients/' + id, { headers: headers() })
  .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
  .then(function (data) { renderProfile(data); })
  .catch(function () {
    document.getElementById('profile-content').innerHTML = '<p class="empty">Couldn\'t load this client.</p>';
  });
}

var STATUSES = ['Lead','Clarity Call Booked','Clarity Call Done','Active Engagement','Delivered','Closed — Won','Closed — Lost','Not a Fit'];

function renderProfile(data) {
  var c = data.client;
  var reports = data.reports || [];
  var bricks = data.brick || [];
  var calls = data.calls || [];
  var documents = data.documents || [];
  var stats = data.stats || {};

  var statusOpts = STATUSES.map(function (s) {
    return '<option value="' + escHtml(s) + '"' + (c.status === s ? ' selected' : '') + '>' + escHtml(s) + '</option>';
  }).join('');

  var metaBits = [];
  if (c.email) metaBits.push('<span><strong>Email:</strong> ' + escHtml(c.email) + '</span>');
  if (c.phone) metaBits.push('<span><strong>Phone:</strong> ' + escHtml(c.phone) + '</span>');
  if (c.council_area) metaBits.push('<span><strong>Area:</strong> ' + escHtml(c.council_area) + '</span>');
  metaBits.push('<span><strong>Source:</strong> ' + escHtml(c.source || '—') + '</span>');
  metaBits.push('<span><strong>Added:</strong> ' + fmtDate(c.created_at) + '</span>');

  var reportsHtml = reports.length ? reports.map(function (r) {
    var t = r.application_tracking || {};
    var applied = Object.keys(t).filter(function (k) { return t[k].applied; }).length;
    var track = applied ? '<div class="report-track">' + applied + ' fund' + (applied!==1?'s':'') + ' tracked as applied</div>' : '';
    return '<div class="report-item">' +
      '<div class="report-top"><span class="report-fund">' + escHtml(r.top_fund || 'Report') + '</span>' +
        '<span class="report-date">' + fmtDate(r.created_at) + '</span></div>' +
      '<div class="report-sub">' + (r.total_matches||0) + ' matched schemes' +
        (r.client_ref ? ' · ref: ' + escHtml(r.client_ref) : '') + '</div>' + track +
    '</div>';
  }).join('') : '<p style="color:#aaa;font-size:14px">No reports yet.</p>';

  var bricksHtml = bricks.length ? bricks.map(function (b) {
    return '<div class="brick-item"><span class="brick-score">' + (b.total_score!=null?b.total_score+'/24':'—') + '</span>' +
      (b.score_band ? ' · ' + escHtml(b.score_band) : '') +
      '<div style="color:#aaa;font-size:12px;margin-top:2px">' + fmtDate(b.created_at) + '</div></div>';
  }).join('') : '<p style="color:#aaa;font-size:13px">No BRICK assessment.</p>';

  var callsHtml = calls.length ? calls.map(function (cl) {
    var st = cl.status || 'scheduled';
    return '<div class="call-item"><div class="call-top">' +
      '<span class="call-when">' + (cl.scheduled_for ? fmtDateTime(cl.scheduled_for) : 'No date set') + '</span>' +
      '<span class="call-status cs-' + escHtml(st) + '">' + escHtml(st) + '</span></div>' +
      (cl.notes ? '<div class="call-notes">' + escHtml(cl.notes) + '</div>' : '') +
    '</div>';
  }).join('') : '<p style="color:#aaa;font-size:13px">No calls logged.</p>';

  var callFormHtml =
    '<button type="button" class="btn-log-toggle" style="margin-top:14px" data-action="toggle-call-form">+ Log a call</button>' +
    '<div class="call-form" id="call-form">' +
      '<div class="row">' +
        '<input type="datetime-local" class="call-input" id="cf-when">' +
        '<select class="call-select" id="cf-status">' +
          '<option value="scheduled">Scheduled</option><option value="completed">Completed</option>' +
          '<option value="no-show">No-show</option><option value="cancelled">Cancelled</option>' +
        '</select>' +
      '</div>' +
      '<textarea class="call-textarea" id="cf-notes" placeholder="Notes (optional)"></textarea>' +
      '<button type="button" class="btn-log" data-action="log-call" data-client-id="' + escHtml(c.id) + '">Save call</button>' +
    '</div>';

  var docsHtml = documents.length ? documents.map(function (d) {
    var ext = (d.filename || '').indexOf('.') !== -1 ? d.filename.split('.').pop().toUpperCase().slice(0,4) : 'DOC';
    var kb = d.size_bytes ? Math.max(1, Math.round(d.size_bytes/1024)) : null;
    var sizeStr = kb ? (kb > 1024 ? (kb/1024).toFixed(1) + ' MB' : kb + ' KB') : '';
    var isReport = d.kind === 'report_pdf';
    return '<div class="doc-item">' +
      '<div class="doc-icon">' + escHtml(ext) + '</div>' +
      '<div class="doc-info"><div class="doc-name">' + escHtml(d.filename) +
        (isReport ? ' <span class="doc-badge">report</span>' : '') + '</div>' +
        '<div class="doc-meta">' + fmtDate(d.created_at) + (sizeStr ? ' · ' + sizeStr : '') + '</div></div>' +
      '<div class="doc-actions">' +
        '<button type="button" class="doc-btn" data-action="download-document" data-document-id="' + escHtml(d.id) + '">Open</button>' +
        '<button type="button" class="doc-btn del" data-action="delete-document" data-document-id="' + escHtml(d.id) + '" data-client-id="' + escHtml(c.id) + '">Delete</button>' +
      '</div>' +
    '</div>';
  }).join('') : '<p style="color:#aaa;font-size:13px">No documents yet.</p>';

  var uploadHtml =
    '<div class="upload-row">' +
      '<label class="upload-label">+ Upload document' +
        '<input type="file" id="doc-file" style="display:none" data-client-id="' + escHtml(c.id) + '">' +
      '</label>' +
      '<div class="upload-status" id="upload-status"></div>' +
    '</div>';

  var events = [];
  events.push({ d: c.created_at, t: 'Client record created (' + escHtml(c.source||'manual') + ')' });
  reports.forEach(function (r) { events.push({ d: r.created_at, t: 'Funding report — ' + escHtml(r.top_fund || 'generated') }); });
  bricks.forEach(function (b) { events.push({ d: b.created_at, t: 'BRICK assessment (' + (b.total_score!=null?b.total_score+'/24':'') + ')' }); });
  calls.forEach(function (cl) { events.push({ d: cl.scheduled_for || cl.created_at, t: 'Clarity call — ' + escHtml(cl.status||'scheduled') }); });
  documents.forEach(function (d) { events.push({ d: d.created_at, t: (d.kind==='report_pdf'?'Report filed':'Document added') + ' — ' + escHtml(d.filename) }); });
  events.sort(function (a,b) { return (b.d||'').localeCompare(a.d||''); });
  var timelineHtml = events.map(function (e) {
    return '<div class="timeline-item"><span class="timeline-dot"></span><div>' + e.t +
      '<div class="timeline-date">' + fmtDate(e.d) + '</div></div></div>';
  }).join('');

  var displayName = c.name || c.org_name || 'Unnamed client';

  document.getElementById('profile-content').innerHTML =
    '<div class="profile-head">' +
      '<h2>' + escHtml(displayName) + '</h2>' +
      (c.org_name && c.name ? '<p class="profile-org">' + escHtml(c.org_name) + '</p>' : '') +
      '<div class="profile-meta">' + metaBits.join('') + '</div>' +
      '<div class="profile-controls">' +
        '<label>Status</label>' +
        '<select class="status-select" id="status-select" data-client-id="' + escHtml(c.id) + '">' + statusOpts + '</select>' +
        '<a class="run-report-link" href="/advisor/">Run new report →</a>' +
      '</div>' +
    '</div>' +
    '<div class="profile-grid">' +
      '<div>' +
        '<div class="panel"><h3>Client Notes</h3>' +
          '<textarea class="notes-area" id="client-notes" data-client-id="' + escHtml(c.id) + '" placeholder="Running notes on this client — calls, decisions, follow-ups…">' +
            escHtml(c.notes || '') + '</textarea>' +
          '<div class="save-ind" id="notes-ind"></div>' +
        '</div>' +
        '<div class="panel"><h3>Funding Reports (' + reports.length + ')</h3>' + reportsHtml + '</div>' +
        '<div class="panel"><h3>Clarity Calls (' + calls.length + ')</h3>' + callsHtml + callFormHtml + '</div>' +
        '<div class="panel"><h3>Documents (' + documents.length + ')</h3>' + docsHtml + uploadHtml + '</div>' +
      '</div>' +
      '<div>' +
        '<div class="mini-stats">' +
          '<div class="mini-stat"><span class="n">' + (stats.report_count||0) + '</span><span class="l">Reports</span></div>' +
          '<div class="mini-stat"><span class="n">' + (stats.applied||0) + '</span><span class="l">Applied</span></div>' +
          '<div class="mini-stat"><span class="n">' + (stats.approved||0) + '</span><span class="l">Approved</span></div>' +
          '<div class="mini-stat"><span class="n">' + money(stats.value_awarded||0) + '</span><span class="l">Awarded</span></div>' +
        '</div>' +
        '<div class="panel"><h3>BRICK</h3>' + bricksHtml + '</div>' +
        '<div class="panel"><h3>Timeline</h3>' + timelineHtml + '</div>' +
      '</div>' +
    '</div>';
}

/* ── SAVE ── */
function patchClient(id, body, onOk) {
  fetch(API + '/clients/' + id, { method:'PATCH', headers: headers(), body: JSON.stringify(body) })
  .then(function (r) { if (onOk) onOk(r.ok); })
  .catch(function () { if (onOk) onOk(false); });
}
function saveStatus(id, status) { patchClient(id, { status: status }); }
function scheduleNotes(id) {
  clearTimeout(state.notesTimer);
  document.getElementById('notes-ind').textContent = '';
  state.notesTimer = setTimeout(function () { saveNotes(id); }, 1500);
}
function saveNotes(id) {
  clearTimeout(state.notesTimer);
  var el = document.getElementById('client-notes'); if (!el) return;
  var ind = document.getElementById('notes-ind');
  if (ind) ind.textContent = 'Saving…';
  patchClient(id, { notes: el.value }, function (ok) {
    if (ind) { ind.textContent = ok ? 'Saved ✓' : 'Save failed'; ind.className = 'save-ind' + (ok ? ' ok' : ''); }
  });
}

/* ── CLARITY CALLS ── */
function fmtDateTime(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) +
    ', ' + d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
}
function toLocalIso(val) { return val ? new Date(val).toISOString() : null; }

function toggleCallForm() {
  var f = document.getElementById('call-form');
  if (f) f.classList.toggle('open');
}

function logCall(clientId) {
  var body = {
    client_id: clientId,
    scheduled_for: toLocalIso(document.getElementById('cf-when').value),
    status: document.getElementById('cf-status').value,
    notes: document.getElementById('cf-notes').value.trim() || null
  };
  fetch(API + '/calls', { method:'POST', headers: headers(), body: JSON.stringify(body) })
  .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
  .then(function () { openClient(clientId); })
  .catch(function () { alert('Could not log the call — try again.'); });
}

function openCallModal() { document.getElementById('call-modal').style.display = 'flex'; }
function closeCallModal() {
  document.getElementById('call-modal').style.display = 'none';
  ['cm-name','cm-email','cm-org','cm-when','cm-notes'].forEach(function (id) {
    var e = document.getElementById(id); if (e) e.value = '';
  });
  document.getElementById('cm-error').style.display = 'none';
}
function submitNewCall() {
  var name = document.getElementById('cm-name').value.trim();
  var email = document.getElementById('cm-email').value.trim();
  var err = document.getElementById('cm-error');
  if (!name && !email) { err.textContent = 'Enter at least a name or email.'; err.style.display = 'block'; return; }
  if (email && !isValidEmail(email)) { err.textContent = 'That email doesn\'t look right — please check it.'; err.style.display = 'block'; return; }
  var body = {
    name: name || null,
    email: email || null,
    org_name: document.getElementById('cm-org').value.trim() || null,
    scheduled_for: toLocalIso(document.getElementById('cm-when').value),
    status: document.getElementById('cm-status').value,
    notes: document.getElementById('cm-notes').value.trim() || null
  };
  fetch(API + '/calls', { method:'POST', headers: headers(), body: JSON.stringify(body) })
  .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
  .then(function () { closeCallModal(); loadClients(); })
  .catch(function () { err.textContent = 'Could not log the call — try again.'; err.style.display = 'block'; });
}

/* ── DOCUMENTS ── */
function uploadDoc(clientId) {
  var input = document.getElementById('doc-file');
  var status = document.getElementById('upload-status');
  if (!input.files || !input.files[0]) return;
  var f = input.files[0];
  if (f.size > 10 * 1024 * 1024) { status.className = 'upload-status err'; status.textContent = 'File too large (max 10 MB).'; return; }
  status.className = 'upload-status'; status.textContent = 'Uploading ' + f.name + '…';
  var fd = new FormData();
  fd.append('file', f);
  fetch(API + '/clients/' + clientId + '/documents', {
    method: 'POST',
    body: fd
  })
  .then(function (r) {
    if (!r.ok) { return r.json().then(function (j) { throw new Error(j.detail || ('HTTP ' + r.status)); }); }
    return r.json();
  })
  .then(function () { openClient(clientId); })
  .catch(function (e) { status.className = 'upload-status err'; status.textContent = e.message || 'Upload failed — try again.'; });
}

function downloadDoc(docId) {
  fetch(API + '/documents/' + docId + '/download', { headers: headers() })
  .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
  .then(function (data) { var url = safeHttpUrl(data.url); if (url) window.open(url, '_blank', 'noopener'); })
  .catch(function () { alert('Could not open the document — try again.'); });
}

function deleteDoc(docId, clientId) {
  if (!confirm('Delete this document? This cannot be undone.')) return;
  fetch(API + '/documents/' + docId, { method:'DELETE', headers: headers() })
  .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
  .then(function () { openClient(clientId); })
  .catch(function () { alert('Could not delete the document — try again.'); });
}
