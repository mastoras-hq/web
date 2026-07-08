  /* ── ADMIN ACTIONS ── */
  function _adminRun(endpoint, btnId, resultId, runningMsg, doneFn) {
    var btn = document.getElementById(btnId);
    var res = document.getElementById(resultId);
    btn.disabled = true;
    res.className = 'admin-result';
    res.textContent = runningMsg;
    fetch(API + endpoint, {
      method: 'POST',
      headers: {}
    })
    .then(function (r) {
      if (!r.ok) throw new Error('Error ' + r.status);
      return r.json();
    })
    .then(function (data) {
      res.className = 'admin-result ok';
      res.textContent = doneFn(data);
    })
    .catch(function (err) {
      res.className = 'admin-result err';
      res.textContent = err.message + ' — try again.';
    })
    .finally(function () { btn.disabled = false; });
  }

  function runFollowup() {
    _adminRun('/admin/run-followup-reminders', 'btn-followup', 'result-followup',
      'Checking reports…',
      function (d) { return d.message || ('Done — ' + (d.reminders_sent || 0) + ' sent.'); });
  }

  function runMonitor() {
    _adminRun('/admin/run-monitor', 'btn-monitor', 'result-monitor',
      'Starting monitor…',
      function (d) { setTimeout(function () { loadRuns(); loadChanges(); }, 30000); return d.status || 'Started.'; });
  }

  function runRadar() {
    _adminRun('/admin/run-radar', 'btn-radar', 'result-radar',
      'Starting radar…',
      function (d) { setTimeout(function () { loadRuns(); }, 30000); return d.status || 'Started.'; });
  }

  function runDiscovery() {
    _adminRun('/admin/run-discovery', 'btn-discovery', 'result-discovery',
      'Searching the funding landscape… (1–2 min)',
      function (d) { setTimeout(function () { loadCandidates(); loadRuns(); }, 90000); return d.status || 'Started.'; });
  }

  function runRefresh() {
    var lim = (document.getElementById('refresh-limit').value || '').trim();
    var path = '/admin/run-refresh' + (lim ? ('?limit=' + encodeURIComponent(lim)) : '');
    _adminRun(path, 'btn-refresh-funds', 'result-refresh',
      'Re-reading funder pages… proposals appear above as funds complete.',
      function (d) { setTimeout(function () { loadProposals(); loadRuns(); }, 60000); return d.status || 'Started.'; });
  }

  /* ── ADMIN REPORTS ── */
  function fmtWhen(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day:'numeric', month:'short' }) + ' ' +
           d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
  }

  function loadRuns() {
    var el = document.getElementById('runs-list');
    el.innerHTML = '<p class="admin-muted">Loading…</p>';
    fetch(API + '/admin/runs?limit=8')
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (runs) {
      if (!runs.length) { el.innerHTML = '<p class="admin-muted">No runs recorded yet.</p>'; return; }
      el.innerHTML = runs.map(function (run) {
        var c = run.counts || {}, d = run.detail || {};
        var chips = '';
        if (run.run_type === 'monitor') {
          chips =
            '<span class="chip">' + (c.new||0) + ' new</span>' +
            '<span class="chip">' + (c.updated||0) + ' updated</span>' +
            '<span class="chip">' + (c.closed||0) + ' closed</span>' +
            '<span class="chip">' + (c.deadline_flagged||0) + ' deadline flags</span>' +
            '<span class="chip">' + (c.links_dead||0) + ' dead links</span>';
          var src = d.sources ? Object.keys(d.sources).map(function (k) { return k + ': ' + d.sources[k]; }).join(' · ') : '';
          if (src) chips += '<div class="run-flagged">Scraped — ' + escHtml(src) + '</div>';
          var flags = [];
          (d.deadline_flagged||[]).forEach(function (f) { flags.push('Deadline passed: ' + escHtml(f.fund_name||f.fund_id)); });
          (d.links_dead||[]).forEach(function (f) { flags.push('Dead link: ' + escHtml(f.fund_name||f.fund_id)); });
          if (flags.length) chips += '<div class="run-flagged"><strong>Flagged for review:</strong><br>' + flags.join('<br>') + '</div>';
        } else {
          chips = '<span class="chip">' + (c.annotated||0) + ' funds annotated</span>' +
                  '<span class="chip">' + (c.closed_analysed||0) + ' analysed</span>';
        }
        return '<div class="run-card">' +
          '<div class="run-top"><span class="run-type">' + escHtml(run.run_type) + '</span>' +
            '<span class="run-status rs-' + escHtml(run.status) + '">' + escHtml(run.status) + '</span>' +
            '<span class="run-when">' + fmtWhen(run.started_at) + '</span></div>' +
          (run.status === 'error' ? '<div class="run-counts" style="color:var(--red)">' + escHtml(run.error||'error') + '</div>'
                                  : '<div class="run-counts">' + chips + '</div>') +
        '</div>';
      }).join('');
    })
    .catch(function () { el.innerHTML = '<p class="admin-muted">Could not load runs.</p>'; });
  }

  function loadChanges() {
    var el = document.getElementById('changes-list');
    el.innerHTML = '<p class="admin-muted">Loading…</p>';
    fetch(API + '/updates?limit=20')
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (rows) {
      if (!rows.length) { el.innerHTML = '<p class="admin-muted">No changes logged yet.</p>'; return; }
      el.innerHTML = rows.map(function (u) {
        var nv = u.new_value || {};
        var label = nv.fund_name || u.fund_id || '';
        var note = nv.note || '';
        return '<div class="change-item">' +
          '<span class="change-type ct-' + escHtml(u.change_type) + '">' + escHtml((u.change_type||'').replace('_',' ')) + '</span>' +
          '<span>' + escHtml(label) + (note ? ' — <span style="color:#999">' + escHtml(note) + '</span>' : '') + '</span>' +
          '<span class="change-when">' + fmtWhen(u.timestamp) + '</span>' +
        '</div>';
      }).join('');
    })
    .catch(function () { el.innerHTML = '<p class="admin-muted">Could not load changes.</p>'; });
  }

  /* ── DISCOVERED FUND CANDIDATES ── */
  function loadCandidates() {
    var el = document.getElementById('candidates-list');
    el.innerHTML = '<p class="admin-muted">Loading…</p>';
    fetch(API + '/admin/candidates')
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (cands) {
      if (!cands.length) { el.innerHTML = '<p class="flag-empty">✓ No candidates waiting — the discovery agent will drop new schemes here for approval.</p>'; return; }
      el.innerHTML = cands.map(renderCandidate).join('');
    })
    .catch(function () { el.innerHTML = '<p class="admin-muted">Could not load candidates.</p>'; });
  }

  function enrichUrl() {
    var url = (document.getElementById('enrich-url').value || '').trim();
    var prov = (document.getElementById('enrich-provider').value || '').trim();
    var statusEl = document.getElementById('enrich-status');
    var btn = document.getElementById('btn-enrich');
    if (!/^https?:\/\//.test(url)) { statusEl.textContent = 'Enter a valid http(s) URL.'; return; }
    btn.disabled = true; statusEl.textContent = 'Fetching + reading the page… (10–30s)';
    fetch(API + '/admin/enrich-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url, provider: prov || null })
    })
    .then(function (r) { if (!r.ok) return r.json().then(function (e) { throw new Error(e.detail || 'failed'); }); return r.json(); })
    .then(function (d) {
      btn.disabled = false;
      if (d.status === 'ok') {
        statusEl.textContent = '✓ Added: ' + (d.fund_name || 'candidate') + (d.dedupe_match ? ' (possible duplicate)' : '');
        document.getElementById('enrich-url').value = '';
        document.getElementById('enrich-provider').value = '';
        loadCandidates();
      } else {
        statusEl.textContent = '✕ Not added — ' + (d.result === 'rejected_validation'
          ? 'the URL did not validate live (dead, blocked, or scheme name not on the page).'
          : (d.error || d.result || 'could not enrich.'));
      }
    })
    .catch(function (e) { btn.disabled = false; statusEl.textContent = '✕ ' + (e.message || 'failed'); });
  }

  function renderCandidate(c) {
    var dup = !!c.dedupe_match;
    var conf = (c.confidence != null) ? 'Source confidence ' + Math.round(c.confidence * 100) + '%' : '';
    var checked = c.url_checked_at ? (' · checked ' + escHtml((c.url_checked_at || '').slice(0,10))) : '';
    var stale = c.deadline_date && /^\d{4}-\d{2}-\d{2}$/.test(c.deadline_date) &&
                (c.deadline_date < new Date().toISOString().slice(0,10));
    var badges = '<span class="cand-badge cb-live">✓ link live' + checked + '</span>';
    if (c.region) badges += '<span class="cand-badge cb-region">' + escHtml(c.region) + '</span>';
    if (conf) badges += '<span class="cand-badge cb-conf" title="How sure the engine is it read the funder page correctly — not a client match score">' + escHtml(conf) + '</span>';
    if (stale) badges += '<span class="cand-badge cb-stale">⚠ deadline passed — verify</span>';
    if (dup) badges += '<span class="cand-badge cb-dup">⚠ ' + escHtml(c.dedupe_match) + '</span>';

    var rows = [];
    if (c.grant_size) rows.push('<b>Grant:</b> ' + escHtml(c.grant_size));
    if (c.deadline_date || c.deadline_type) rows.push('<b>Deadline:</b> ' + escHtml(c.deadline_date || c.deadline_type));
    if (c.org_type && c.org_type.length) rows.push('<b>Who:</b> ' + escHtml(c.org_type.join(', ')));
    if (c.sector_focus && c.sector_focus.length) rows.push('<b>Sectors:</b> ' + escHtml(c.sector_focus.join(', ')));
    var grid = rows.length ? '<div class="cand-grid">' + rows.join('<br>') + '</div>' : '';

    var evidence = '';
    if (c.evidence && Object.keys(c.evidence).length) {
      var lines = Object.keys(c.evidence).map(function (k) { return k + ': ' + c.evidence[k]; }).join('\n');
      evidence = '<details class="cand-evidence"><summary>Show source evidence</summary><pre>' + escHtml(lines) + '</pre></details>';
    }

    return '<div class="cand-card' + (dup ? ' dup' : '') + '">' +
      '<div class="cand-top"><span class="cand-name">' + escHtml(c.fund_name || '(unnamed)') + '</span>' +
        '<span class="cand-prov">' + escHtml(c.provider || '') + '</span></div>' +
      '<div class="cand-badges">' + badges + '</div>' +
      grid +
      '<div class="cand-url">' + (safeHttpUrl(c.source_url) ? '<a href="' + escHtml(safeHttpUrl(c.source_url)) + '" target="_blank" rel="noopener">' + escHtml(c.source_url) + '</a>' : '—') + '</div>' +
      evidence +
      '<div class="cand-actions">' +
        '<button type="button" class="cand-btn approve" data-action="approve-candidate" data-candidate-id="' + escHtml(c.id) + '">✓ Approve</button>' +
        '<button type="button" class="cand-btn reject" data-action="reject-candidate" data-candidate-id="' + escHtml(c.id) + '">✕ Reject</button>' +
      '</div>' +
    '</div>';
  }

  function adminReviewKey(kind, id) {
    return kind + ':' + String(id || '');
  }

  function setAdminReviewBusy(kind, id, busy) {
    var key = adminReviewKey(kind, id);
    if (!id) return;
    if (busy) state.adminReviewBusy[key] = true;
    else delete state.adminReviewBusy[key];

    var attribute = kind === 'candidate' ? 'candidateId' : kind === 'proposal' ? 'proposalId' : 'fundId';
    var selector = '[data-' + attribute.replace(/[A-Z]/g, function (letter) { return '-' + letter.toLowerCase(); }) + ']';
    document.querySelectorAll(selector).forEach(function (button) {
      if (button.dataset[attribute] !== id || button.tagName !== 'BUTTON') return;
      button.disabled = busy;
      button.setAttribute('aria-busy', busy ? 'true' : 'false');
    });
  }

  function startAdminReviewAction(kind, id) {
    var key = adminReviewKey(kind, id);
    if (!id || state.adminReviewBusy[key]) return false;
    setAdminReviewBusy(kind, id, true);
    return true;
  }

  function finishAdminReviewAction(kind, id) {
    setAdminReviewBusy(kind, id, false);
  }

  function candidateAction(id, action, body) {
    if (!startAdminReviewAction('candidate', id)) return;
    var payload = body || { candidate_id: id, action: action };
    var request = fetch(API + '/admin/candidates/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(function (r) { if (!r.ok) return r.json().then(function (e) { throw new Error(e.detail || ''); }); return r.json(); })
    .then(function () { loadCandidates(); })
    .catch(function (e) { alert('Action failed — ' + (e.message || 'try again.')); });
    request.finally(function () { finishAdminReviewAction('candidate', id); });
  }

  function candidateReject(id) {
    var note = prompt('Reject this candidate? Optional note (why):');
    if (note === null) return;  // cancelled
    candidateAction(id, 'reject', { candidate_id: id, action: 'reject', review_note: note || null });
  }

  /* ── CHANGE PROPOSALS (existing-fund re-verification) ── */
  function loadProposals() {
    var el = document.getElementById('proposals-list');
    el.innerHTML = '<p class="admin-muted">Loading…</p>';
    fetch(API + '/admin/proposals')
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (props) {
      if (!props.length) { el.innerHTML = '<p class="flag-empty">✓ No proposed updates — run “Re-verify Existing Funds” to re-check the database against live funder pages.</p>'; return; }
      el.innerHTML = props.map(renderProposal).join('');
    })
    .catch(function () { el.innerHTML = '<p class="admin-muted">Could not load proposals.</p>'; });
  }

  function _fmtVal(v) {
    if (v === null || v === undefined || v === '') return '(blank)';
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
  }

  function renderProposal(p) {
    var diff = p.diff || {};
    var flags = p.flags || {};
    var name = escHtml(p.fund_name || p.fund_id || '(unknown fund)');
    var prov = escHtml(p.fund_provider || '');
    var url = escHtml(safeHttpUrl(p.source_url) || '');

    // Lightweight "verify URL" card — the scheme name no longer appears on the page.
    if (flags.name_missing || p.url_status === 'name_missing') {
      return '<div class="prop-card verify">' +
        '<div class="prop-top"><span class="prop-name">' + name + '</span><span class="prop-prov">' + prov + '</span></div>' +
        '<div class="prop-badges"><span class="prop-badge warn">⚠ scheme name not found on page</span></div>' +
        '<p class="admin-muted" style="margin:4px 0 6px">The page still loads, but the scheme name is no longer on it — the fund may have moved or been replaced. Check the link and fix or close the fund.</p>' +
        '<div class="prop-url"><a href="' + url + '" target="_blank" rel="noopener">' + (url || '—') + '</a></div>' +
        '<div class="prop-actions">' +
          '<button type="button" class="prop-btn dismiss" data-action="dismiss-proposal" data-proposal-id="' + escHtml(p.id) + '">Dismiss (mark checked)</button>' +
        '</div></div>';
    }

    var badges = '';
    if (p.fetch_backend === 'firecrawl') badges += '<span class="prop-badge be">via Firecrawl</span>';
    if (p.confidence != null) badges += '<span class="prop-badge conf">Source confidence ' + Math.round(p.confidence * 100) + '%</span>';
    if (flags.low_confidence != null) badges += '<span class="prop-badge warn">⚠ low confidence — verify</span>';
    if (flags.deadline_passed) badges += '<span class="prop-badge warn">⚠ deadline passed</span>';

    var pid = escHtml(p.id);
    var rows = Object.keys(diff).map(function (f) {
      var cb = 'cb_' + pid + '_' + f;
      return '<tr>' +
        '<td class="prop-chk"><input type="checkbox" id="' + cb + '" data-field="' + escHtml(f) + '" checked></td>' +
        '<td class="fld">' + escHtml(f) + '</td>' +
        '<td><span class="prop-old">' + escHtml(_fmtVal(diff[f].old)) + '</span><br>' +
            '<span class="prop-new">' + escHtml(_fmtVal(diff[f].new)) + '</span></td>' +
      '</tr>';
    }).join('');

    var statusRow = '';
    if (flags.status_suggested) {
      statusRow = '<tr>' +
        '<td class="prop-chk"><input type="checkbox" id="cb_' + pid + '_status" checked></td>' +
        '<td class="fld">status</td>' +
        '<td><span class="prop-old">' + escHtml(p.fund_status || 'open') + '</span><br>' +
            '<span class="prop-new">' + escHtml(flags.status_suggested) + ' (deadline passed)</span></td>' +
      '</tr>';
    }

    var table = (rows || statusRow)
      ? '<table class="prop-table"><tr><th></th><th>Field</th><th>Stored → Proposed</th></tr>' + rows + statusRow + '</table>'
      : '';

    var evidence = '';
    if (p.evidence && Object.keys(p.evidence).length) {
      var lines = Object.keys(p.evidence).map(function (k) { return k + ': ' + p.evidence[k]; }).join('\n');
      evidence = '<details class="prop-evidence"><summary>Show source evidence</summary><pre>' + escHtml(lines) + '</pre></details>';
    }

    return '<div class="prop-card">' +
      '<div class="prop-top"><span class="prop-name">' + name + '</span><span class="prop-prov">' + prov + '</span></div>' +
      '<div class="prop-badges">' + badges + '</div>' +
      '<div class="prop-url"><a href="' + url + '" target="_blank" rel="noopener">' + (url || '—') + '</a></div>' +
      table + evidence +
      '<div class="prop-actions">' +
        '<button type="button" class="prop-btn apply" data-action="apply-proposal" data-proposal-id="' + pid + '">✓ Apply selected</button>' +
        '<button type="button" class="prop-btn dismiss" data-action="dismiss-proposal" data-proposal-id="' + pid + '">Dismiss</button>' +
      '</div></div>';
  }

  function applyProposal(id) {
    var fields = [];
    document.querySelectorAll('#proposals-list input[type=checkbox][id^="cb_' + id + '_"]').forEach(function (cb) {
      if (cb.dataset.field && cb.checked) fields.push(cb.dataset.field);
    });
    var statusBox = document.getElementById('cb_' + id + '_status');
    var payload = { proposal_id: id, action: 'apply', fields: fields };
    if (statusBox && statusBox.checked) payload.set_status = 'closed';
    if (!fields.length && !payload.set_status) { alert('Tick at least one change to apply, or use Dismiss.'); return; }
    if (!startAdminReviewAction('proposal', id)) return;
    var request = fetch(API + '/admin/proposals/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(function (r) { if (!r.ok) return r.json().then(function (e) { throw new Error(e.detail || ''); }); return r.json(); })
    .then(function (d) {
      if (d.superseded && d.superseded.length) alert('Applied ' + (d.applied_fields || []).join(', ') + '.\nSkipped (changed since proposal): ' + d.superseded.join(', '));
      loadProposals();
    })
    .catch(function (e) { alert('Apply failed — ' + (e.message || 'try again.')); });
    request.finally(function () { finishAdminReviewAction('proposal', id); });
  }

  function dismissProposal(id) {
    var note = prompt('Dismiss this proposal? (the source is still marked re-checked today). Optional note:');
    if (note === null) return;
    if (!startAdminReviewAction('proposal', id)) return;
    var request = fetch(API + '/admin/proposals/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposal_id: id, action: 'dismiss', review_note: note || null })
    })
    .then(function (r) { if (!r.ok) return r.json().then(function (e) { throw new Error(e.detail || ''); }); return r.json(); })
    .then(function () { loadProposals(); })
    .catch(function (e) { alert('Dismiss failed — ' + (e.message || 'try again.')); });
    request.finally(function () { finishAdminReviewAction('proposal', id); });
  }

  /* ── REVIEW QUEUE ── */
  function loadFlags() {
    var el = document.getElementById('flags-list');
    el.innerHTML = '<p class="admin-muted">Loading…</p>';
    fetch(API + '/admin/flags')
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (flags) {
      if (!flags.length) { el.innerHTML = '<p class="flag-empty">✓ Nothing flagged — all funds look healthy.</p>'; return; }
      el.innerHTML = flags.map(function (f) {
        var dead = f.change_type === 'link_dead';
        var typeLabel = dead ? 'dead link' : 'deadline passed';
        var meta = dead
          ? 'URL: ' + (safeHttpUrl(f.source_url) ? '<a href="' + escHtml(safeHttpUrl(f.source_url)) + '" target="_blank" rel="noopener">' + escHtml(f.source_url) + '</a>' : '—')
          : 'Deadline: ' + escHtml(f.deadline_date||'—') + (f.provider ? ' · ' + escHtml(f.provider) : '');
        var fixBtn = dead
          ? '<button type="button" class="flag-btn fix" data-action="fix-flag-url" data-fund-id="' + escHtml(f.fund_id) + '">Fix URL</button>'
          : '';
        return '<div class="flag-card' + (dead?' dead':'') + '">' +
          '<div class="flag-top"><span class="flag-name">' + escHtml(f.fund_name||f.fund_id) + '</span>' +
            '<span class="flag-type ft-' + escHtml(f.change_type) + '">' + typeLabel + '</span></div>' +
          '<div class="flag-meta">' + meta + '</div>' +
          '<div class="flag-actions">' + fixBtn +
            '<button type="button" class="flag-btn closebtn" data-action="resolve-flag" data-fund-id="' + escHtml(f.fund_id) + '" data-change-type="' + escHtml(f.change_type) + '" data-resolution="close">Mark closed</button>' +
            '<button type="button" class="flag-btn dismiss" data-action="resolve-flag" data-fund-id="' + escHtml(f.fund_id) + '" data-change-type="' + escHtml(f.change_type) + '" data-resolution="dismiss">Dismiss</button>' +
          '</div>' +
        '</div>';
      }).join('');
    })
    .catch(function () { el.innerHTML = '<p class="admin-muted">Could not load flags.</p>'; });
  }

  function flagAction(fundId, changeType, action, newUrl) {
    if (!startAdminReviewAction('flag', fundId)) return;
    var body = { fund_id: fundId, change_type: changeType, action: action };
    if (newUrl) body.new_url = newUrl;
    var request = fetch(API + '/admin/flags/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function () { loadFlags(); })
    .catch(function () { alert('Action failed — try again.'); });
    request.finally(function () { finishAdminReviewAction('flag', fundId); });
  }

  function flagFixUrl(fundId) {
    var url = prompt('Enter the correct source URL for this fund:');
    if (url && url.trim()) flagAction(fundId, 'link_dead', 'fix_url', url.trim());
  }
