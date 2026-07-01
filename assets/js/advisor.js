  /* ── STATE ── */
  var state = {
    lastPayload: null,
    lastReportId: null,
    fundNotes: {}
  };

  var API = 'https://api.mastoras.uk';

  /* ── INIT ── */
  window.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('click', handleActionClick);
    document.addEventListener('change', handleControlChange);
    document.addEventListener('input', handleControlInput);
    document.addEventListener('focusout', handleControlFocusOut);
    document.addEventListener('keydown', handleActionKeydown);

    setVat(null);
    mastorasAuth.requireSession().then(function () {
      loadPreviousReports();
      showAdminSection();
    }).catch(function () {});
  });

  function handleActionClick(event) {
    var control = event.target.closest('[data-action]');
    if (!control) return;
    var action = control.dataset.action;
    if (action === 'close-report-modal') closeReportModal();
    else if (action === 'sign-out') { event.preventDefault(); mastorasAuth.signOut(); }
    else if (action === 'toggle-mobile-nav') toggleMobileNav();
    else if (action === 'set-vat') setVat(control.dataset.vat === 'true');
    else if (action === 'set-effort') setEffort(control);
    else if (action === 'submit-form') submitForm();
    else if (action === 'download-pdf') downloadPdf();
    else if (action === 'run-followup') runFollowup();
    else if (action === 'run-monitor') runMonitor();
    else if (action === 'run-radar') runRadar();
    else if (action === 'run-discovery') runDiscovery();
    else if (action === 'run-refresh') runRefresh();
    else if (action === 'load-candidates') loadCandidates();
    else if (action === 'enrich-url') enrichUrl();
    else if (action === 'load-proposals') loadProposals();
    else if (action === 'load-flags') loadFlags();
    else if (action === 'load-runs') loadRuns();
    else if (action === 'load-changes') loadChanges();
    else if (action === 'toggle-detail') toggleDetail(control.dataset.reportId);
    else if (action === 'show-raw-json') showRawJson(control.dataset.reportId);
    else if (action === 'approve-candidate') candidateAction(control.dataset.candidateId, 'approve');
    else if (action === 'reject-candidate') candidateReject(control.dataset.candidateId);
    else if (action === 'apply-proposal') applyProposal(control.dataset.proposalId);
    else if (action === 'dismiss-proposal') dismissProposal(control.dataset.proposalId);
    else if (action === 'fix-flag-url') flagFixUrl(control.dataset.fundId);
    else if (action === 'resolve-flag') flagAction(control.dataset.fundId, control.dataset.changeType, control.dataset.resolution);
  }

  function handleControlChange(event) {
    if (event.target.classList.contains('consultant-note-input')) {
      saveNote(event.target);
    } else if (event.target.classList.contains('crm-applied-check')) {
      setApplied(event.target.dataset.reportId, event.target.dataset.fundId, event.target.checked);
    } else if (event.target.classList.contains('crm-outcome-select')) {
      setOutcome(event.target.dataset.reportId, event.target.dataset.fundId, event.target.value);
    }
  }

  function handleControlInput(event) {
    if (event.target.classList.contains('crm-notes-area')) {
      scheduleNotesSave(event.target.dataset.reportId);
    } else if (event.target.classList.contains('crm-amount-input')) {
      scheduleAmountSave(event.target.dataset.reportId, event.target.dataset.fundId, event.target.value);
    }
  }

  function handleControlFocusOut(event) {
    if (event.target.classList.contains('crm-notes-area')) saveNotes(event.target.dataset.reportId);
  }

  function handleActionKeydown(event) {
    var control = event.target.closest('[data-action="toggle-detail"]');
    if (!control || control.tagName !== 'TR' || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    toggleDetail(control.dataset.reportId);
  }

  function showAdminSection() {
    var el = document.getElementById('admin-section');
    if (el) { el.style.display = 'block'; loadCandidates(); loadProposals(); loadFlags(); loadRuns(); loadChanges(); }
  }

  /* ── VAT + EFFORT TOGGLES ── */
  function setVat(yes) {
    document.getElementById('vat_yes').classList.toggle('active', yes === true);
    document.getElementById('vat_no').classList.toggle('active', yes === false);
  }

  function setEffort(el) {
    document.querySelectorAll('.effort-btn').forEach(function (b) { b.classList.remove('active'); });
    el.classList.add('active');
  }

  /* ── BUILD PAYLOAD ── */
  function buildPayload() {
    var tags = Array.from(document.querySelectorAll('input[name="tags"]:checked')).map(function (el) { return el.value; });
    var evidence = Array.from(document.querySelectorAll('input[name="evidence"]:checked')).map(function (el) { return el.value; });
    var prevGrants = document.getElementById('previous_grants').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var effortBtn = document.querySelector('.effort-btn.active');
    var council = document.getElementById('council_area').value;

    return {
      client_ref: document.getElementById('client_ref').value.trim() || null,
      org_profile: {
        org_name: document.getElementById('org_name').value.trim(),
        org_type: document.getElementById('org_type').value,
        sector: document.getElementById('sector').value,
        stage: document.getElementById('stage').value,
        location: council,
        council_area: council,
        years_trading: document.getElementById('years_trading').value ? parseFloat(document.getElementById('years_trading').value) : null,
        vat_registered: document.getElementById('vat_yes').classList.contains('active') ? true : (document.getElementById('vat_no').classList.contains('active') ? false : null),
        previous_grants: prevGrants,
        contact_name: document.getElementById('contact_name').value.trim() || null,
        email: document.getElementById('client_email').value.trim() || null
      },
      project_profile: {
        project_name: document.getElementById('project_name').value.trim() || null,
        description: document.getElementById('description').value.trim(),
        funding_ask: parseFloat(document.getElementById('funding_ask').value) || 0,
        total_cost: document.getElementById('total_cost').value ? parseFloat(document.getElementById('total_cost').value) : null,
        tags: tags,
        evidence_available: evidence
      },
      constraints: {
        effort_capacity: effortBtn ? effortBtn.dataset.value : 'medium'
      }
    };
  }

  /* ── VALIDATE ── */
  function validateForm() {
    document.querySelectorAll('.field-error').forEach(function (el) { el.classList.remove('field-error'); });
    document.getElementById('validation-msg').textContent = '';
    document.getElementById('client-ref-hint').textContent = '';

    var valid = true;
    var checks = [
      { id: 'org_name',     check: function (v) { return v.trim().length > 0; } },
      { id: 'org_type',     check: function (v) { return v.length > 0; } },
      { id: 'sector',       check: function (v) { return v.length > 0; } },
      { id: 'council_area', check: function (v) { return v.length > 0; } },
      { id: 'description',  check: function (v) { return v.trim().length > 0; } },
      { id: 'funding_ask',  check: function (v) { return parseFloat(v) > 0; } }
    ];

    checks.forEach(function (c) {
      var el = document.getElementById(c.id);
      if (!c.check(el.value)) {
        el.classList.add('field-error');
        valid = false;
      }
    });

    // Contact email is optional, but if provided it must look valid (it links to HQ).
    var emailEl = document.getElementById('client_email');
    var emailVal = emailEl ? emailEl.value.trim() : '';
    if (emailVal && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailVal)) {
      emailEl.classList.add('field-error');
      valid = false;
      document.getElementById('validation-msg').textContent = 'The contact email doesn\'t look right — please check it.';
      return false;
    }

    if (!valid) {
      document.getElementById('validation-msg').textContent = 'Please complete all required fields (marked *) before generating.';
    }

    if (valid && !document.getElementById('client_ref').value.trim()) {
      document.getElementById('client-ref-hint').textContent = 'Consider adding a client reference for your records.';
    }

    return valid;
  }

  /* ── SUBMIT ── */
  function submitForm() {
    if (!validateForm()) return;

    var btn = document.getElementById('submit-btn');
    btn.textContent = 'Generating…';
    btn.disabled = true;
    document.getElementById('submit-error').style.display = 'none';

    state.fundNotes = {};
    var panel = document.getElementById('results-panel');
    panel.innerHTML = '<div class="match-loading">Matching against funding schemes…</div>';
    document.getElementById('pdf-btn').style.display = 'none';
    document.getElementById('results-heading').innerHTML = '';

    var payload = buildPayload();
    state.lastPayload = payload;

    fetch(API + '/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(function (res) {
      if (res.status === 401) { throw new Error('401'); }
      if (!res.ok) { return res.json().then(function (e) { throw new Error(res.status + ':' + (e.detail || 'error')); }); }
      return res.json();
    })
    .then(function (report) {
      state.lastReportId = report.report_id;
      renderResults(report);
      document.getElementById('results-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      loadPreviousReports();
    })
    .catch(function (err) {
      var msg = err.message;
      if (msg === '401') {
        showError('Your session has expired. Sign in again to continue.');
        setTimeout(function () { window.location.href = '/login/?returnTo=' + encodeURIComponent('/advisor/'); }, 800);
      } else {
        showError('Error ' + msg + ' — check your connection and try again.');
      }
      panel.innerHTML = '<div class="results-placeholder"><p>Something went wrong. Check the error above and try again.</p></div>';
    })
    .finally(function () {
      btn.textContent = 'Generate Funding Report →';
      btn.disabled = false;
    });
  }

  /* ── RENDER RESULTS ── */
  function renderResults(report) {
    var matches = report.matches || [];
    var panel = document.getElementById('results-panel');
    var heading = document.getElementById('results-heading');

    document.getElementById('pdf-btn').style.display = matches.length > 0 ? 'block' : 'none';

    heading.innerHTML = '<h2 style="font-family:\'Merriweather\',serif;font-size:1.1rem;color:var(--slate)">Found ' + matches.length + ' matching scheme' + (matches.length !== 1 ? 's' : '') + '</h2>' +
      '<p style="font-size:12px;color:#aaa;margin-top:2px">' + new Date().toLocaleTimeString('en-GB') + (report.applicant_summary && report.applicant_summary.organisation ? ' · ' + escHtml(report.applicant_summary.organisation) : '') + '</p>';

    if (matches.length === 0) {
      panel.innerHTML = '<div style="background:var(--linen);padding:28px 24px;border-radius:4px;text-align:center"><p style="color:#888">No matching schemes found for this profile.</p><p style="color:#aaa;font-size:13px;margin-top:8px">Try adjusting the sector, stage, or funding ask amount.</p></div>';
      return;
    }

    var html = '';
    matches.forEach(function (m) {
      var score = Math.round(m.match_score || 0);
      var scoreColour = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--amber)' : 'var(--red)';
      var status = (m.status || '').toLowerCase();
      var statusClass = status === 'open' ? 'badge-status-open' : status === 'rolling' ? 'badge-status-rolling' : status.indexOf('clos') === 0 && status !== 'closed' ? 'badge-status-closing' : status === 'closed' ? 'badge-status-closed' : 'badge-neutral';
      var eligibility = m.eligibility_status || 'needs_information';
      var eligibilityLabel = eligibility === 'eligible' ? 'Eligibility checks passed' : 'Needs information';
      var eligibilityClass = eligibility === 'eligible' ? 'badge-status-open' : 'badge-status-closing';
      var missingHtml = '';
      if (m.missing_information && m.missing_information.length) {
        missingHtml = '<div class="risk-block"><p class="block-label">Information still needed</p><ul class="block-list">' +
          m.missing_information.map(function (item) { return '<li>' + escHtml(item) + '</li>'; }).join('') +
          '</ul></div>';
      }

      var whyHtml = '';
      if (m.why_it_fits && m.why_it_fits.length) {
        whyHtml = '<div class="why-block"><p class="block-label">Why it fits</p><ul class="block-list">' +
          m.why_it_fits.map(function (w) { return '<li>' + escHtml(w) + '</li>'; }).join('') +
          '</ul></div>';
      }

      var riskHtml = '';
      if (m.risks && m.risks.length) {
        riskHtml = '<div class="risk-block"><p class="block-label">Watch out for</p><ul class="block-list">' +
          m.risks.map(function (r) { return '<li>' + escHtml(r) + '</li>'; }).join('') +
          '</ul></div>';
      }

      var intelHtml = '';
      if (m.application_intelligence) {
        var intel = m.application_intelligence;
        var intelLabels = {
          application_requirements: 'Requirements',
          evaluation_criteria: 'Evaluation criteria',
          application_tips: 'Tips for a strong application',
          common_pitfalls: 'Common pitfalls',
          typical_timeline: 'Typical timeline'
        };
        var intelItems = [];
        Object.keys(intelLabels).forEach(function (key) {
          var val = intel[key];
          if (val && val.indexOf('Not specified') === -1) {
            intelItems.push('<li><strong>' + intelLabels[key] + ':</strong> ' + escHtml(val) + '</li>');
          }
        });
        if (intelItems.length) {
          intelHtml = '<div class="intel-block"><p class="block-label">Application Intelligence</p><ul class="block-list">' +
            intelItems.join('') + '</ul></div>';
        }
      }

      var fundUrl = safeHttpUrl(m.source_url);
      var fundLink = fundUrl ? '<a href="' + escHtml(fundUrl) + '" target="_blank" rel="noopener" class="fund-link">View fund →</a>' : '';

      html += '<div class="match-card">' +
        '<div class="match-header">' +
          '<div><p class="match-name">' + escHtml(m.fund_name) + '</p><p class="match-provider">' + escHtml(m.provider || '') + '</p></div>' +
          '<div style="text-align:right"><span class="match-score" style="color:' + scoreColour + '">' + score + '<span style="font-size:11px;font-weight:400;color:#aaa">/100</span></span></div>' +
        '</div>' +
        '<div class="score-bar-track"><div class="score-bar-fill" style="background:' + scoreColour + ';width:' + score + '%"></div></div>' +
        '<p style="font-size:11px;color:#888;margin:5px 0 0">Funding fit score · ' + escHtml(m.score_coverage || 0) + '/100 profile coverage · confidence ' + Math.round((m.match_confidence || 0) * 100) + '%</p>' +
        '<div class="badge-row">' +
          '<span class="badge ' + statusClass + '">' + escHtml(m.status || 'Unknown') + '</span>' +
          '<span class="badge ' + eligibilityClass + '">' + eligibilityLabel + '</span>' +
          (m.grant_size ? '<span class="badge badge-neutral">' + escHtml(m.grant_size) + '</span>' : '') +
          (m.effort_level ? '<span class="badge badge-neutral">Effort: ' + escHtml(m.effort_level) + '</span>' : '') +
        '</div>' +
        whyHtml + riskHtml + missingHtml + intelHtml + fundLink +
        '<div class="consultant-note-wrap">' +
          '<p class="form-section-title" style="margin:12px 0 6px">Consultant\'s View <span style="font-weight:400;color:#bbb;text-transform:none;letter-spacing:0">(optional — appears in PDF)</span></p>' +
          '<textarea class="form-textarea consultant-note-input" rows="3" placeholder="Add your professional view on this fund for the client…" data-fund-id="' + escHtml(m.fund_id) + '">' + escHtml(state.fundNotes[m.fund_id] || '') + '</textarea>' +
        '</div>' +
        '</div>';
    });

    panel.innerHTML = html;
  }

  function saveNote(el) {
    var fundId = el.getAttribute('data-fund-id');
    state.fundNotes[fundId] = el.value;
  }

  /* ── PDF DOWNLOAD ── */
  function downloadPdf() {
    if (!state.lastPayload) return;
    var btn = document.getElementById('pdf-btn');
    btn.textContent = 'Preparing PDF…';
    btn.disabled = true;

    var pdfPayload = Object.assign({}, state.lastPayload, { fund_notes: state.fundNotes });
    fetch(API + '/report/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pdfPayload)
    })
    .then(function (res) {
      if (!res.ok) throw new Error('PDF error ' + res.status);
      return res.blob();
    })
    .then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      var orgName = ((state.lastPayload.org_profile && state.lastPayload.org_profile.org_name) || 'report').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
      a.download = 'mastoras_report_' + orgName + '.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    })
    .catch(function (err) {
      showError(err.message + ' — try again or check your connection.');
    })
    .finally(function () {
      btn.textContent = 'Download PDF Report';
      btn.disabled = false;
    });
  }

  /* ── PREVIOUS REPORTS (CRM) ── */
  var _detailCache = {};
  var _notesTimers = {};
  var _amountTimers = {};

  function loadPreviousReports() {
    fetch(API + '/reports?limit=20')
    .then(function(res) { return res.ok ? res.json() : []; })
    .then(function(reports) { renderReportsTable(reports); })
    .catch(function() {});
  }

  function calcStats(reports) {
    var applied = 0, approved = 0, value = 0;
    reports.forEach(function(r) {
      var t = r.application_tracking || {};
      Object.keys(t).forEach(function(k) {
        if (t[k].applied) {
          applied++;
          if (t[k].outcome === 'approved') {
            approved++;
            value += parseFloat(t[k].award_amount) || 0;
          }
        }
      });
    });
    return { applied: applied, approved: approved, value: value };
  }

  function renderReportsTable(reports) {
    var section = document.getElementById('previous-reports');
    if (!reports || reports.length === 0) { section.style.display = 'none'; return; }
    section.style.display = 'block';

    var stats = calcStats(reports);
    document.getElementById('stat-reports').textContent  = reports.length;
    document.getElementById('stat-applied').textContent  = stats.applied;
    document.getElementById('stat-approved').textContent = stats.approved;
    document.getElementById('stat-value').textContent    = stats.value > 0 ? '\xA3' + stats.value.toLocaleString('en-GB') : '\xA3' + '0';

    var tbody = document.getElementById('reports-tbody');
    tbody.innerHTML = reports.map(function(r) {
      var date     = r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB') : '—';
      var tracking = r.application_tracking || {};
      var nApplied = Object.keys(tracking).filter(function(k) { return tracking[k].applied; }).length;
      var badge    = nApplied > 0
        ? ' <span style="font-size:11px;color:var(--teal);font-weight:600">' + nApplied + ' tracked</span>'
        : '';
      var rid = escHtml(r.id);
      return '<tr class="report-summary-row" style="cursor:pointer" data-action="toggle-detail" data-report-id="' + rid + '" tabindex="0" role="button">' +
          '<td>' + date + '</td>' +
          '<td>' + escHtml(r.client_ref  || '—') + '</td>' +
          '<td>' + escHtml(r.client_name || '—') + '</td>' +
          '<td>' + escHtml(r.top_fund    || '—') + badge + '</td>' +
          '<td style="text-align:center">' + (r.total_matches || 0) + '</td>' +
          '<td><button type="button" class="btn-track" id="track-btn-' + rid + '" data-action="toggle-detail" data-report-id="' + rid + '">Track ▾</button></td>' +
        '</tr>' +
        '<tr class="report-detail-row" id="detail-row-' + rid + '">' +
          '<td colspan="6">' +
            '<div class="report-detail-wrap" id="detail-' + rid + '">' +
              '<div id="detail-content-' + rid + '"><p style="color:#aaa;font-size:13px;padding:4px 0">Loading…</p></div>' +
            '</div>' +
          '</td>' +
        '</tr>';
    }).join('');
  }

  function toggleDetail(id) {
    var wrap = document.getElementById('detail-' + id);
    var btn  = document.getElementById('track-btn-' + id);
    if (!wrap) return;
    var isOpen = wrap.classList.contains('open');
    if (isOpen) {
      wrap.classList.remove('open');
      if (btn) { btn.classList.remove('open'); btn.textContent = 'Track ▾'; }
    } else {
      wrap.classList.add('open');
      if (btn) { btn.classList.add('open'); btn.textContent = 'Close ✕'; }
      if (!_detailCache[id]) loadDetail(id);
    }
  }

  function loadDetail(id) {
    fetch(API + '/reports/' + id)
    .then(function(res) { return res.ok ? res.json() : null; })
    .then(function(data) {
      if (!data) return;
      _detailCache[id] = data;
      renderDetail(id, data);
    })
    .catch(function() {
      var el = document.getElementById('detail-content-' + id);
      if (el) el.innerHTML = '<p style="color:var(--red);font-size:13px">Failed to load report.</p>';
    });
  }

  function renderDetail(id, data) {
    var el = document.getElementById('detail-content-' + id);
    if (!el) return;
    var notes    = data.client_notes || '';
    var tracking = data.application_tracking || {};
    var matches  = (data.report && data.report.matches) ? data.report.matches : [];

    var reportId = escHtml(id);
    var html = '<span class="crm-label">Client Notes</span>' +
      '<textarea class="crm-notes-area" id="notes-' + reportId + '" data-report-id="' + reportId + '" ' +
        'placeholder="Notes about this client, their project, or the application process…">' +
        escHtml(notes) +
      '</textarea>' +
      '<div class="crm-save-indicator" id="notes-ind-' + id + '"></div>';

    if (matches.length > 0) {
      html += '<span class="crm-label" style="margin-top:20px;display:block">Application Tracking</span>' +
        '<table class="crm-track-table"><thead><tr>' +
          '<th>Fund</th><th style="text-align:center">Applied?</th><th>Outcome</th><th>Award (\xA3)</th>' +
        '</tr></thead><tbody>';

      matches.forEach(function(m) {
        var t       = tracking[m.fund_id] || {};
        var applied = t.applied  ? true  : false;
        var outcome = t.outcome  || '';
        var amount  = t.award_amount != null ? t.award_amount : '';
        var fid     = escHtml(m.fund_id);

        html += '<tr>' +
          '<td class="crm-fund-name">' + escHtml(m.fund_name) + '</td>' +
          '<td style="text-align:center">' +
            '<input type="checkbox" class="crm-applied-check" data-report-id="' + reportId + '" data-fund-id="' + fid + '"' + (applied ? ' checked' : '') + '>' +
          '</td>' +
          '<td><select class="crm-outcome-select" data-report-id="' + reportId + '" data-fund-id="' + fid + '"' + (applied ? '' : ' disabled') + '>' +
            '<option value=""'          + (!outcome                  ? ' selected' : '') + '>—</option>' +
            '<option value="pending"'   + (outcome === 'pending'     ? ' selected' : '') + '>Pending</option>' +
            '<option value="approved"'  + (outcome === 'approved'    ? ' selected' : '') + '>Approved</option>' +
            '<option value="declined"'  + (outcome === 'declined'    ? ' selected' : '') + '>Declined</option>' +
            '<option value="withdrawn"' + (outcome === 'withdrawn'   ? ' selected' : '') + '>Withdrawn</option>' +
          '</select></td>' +
          '<td><input type="number" class="crm-amount-input" min="0" data-report-id="' + reportId + '" data-fund-id="' + fid + '" ' +
            (applied && outcome === 'approved' ? '' : 'disabled ') +
            'value="' + escHtml(String(amount)) + '"></td>' +
        '</tr>';
      });
      html += '</tbody></table>';
    }

    html += '<button type="button" class="crm-json-link" data-action="show-raw-json" data-report-id="' + reportId + '">View full report JSON →</button>';
    el.innerHTML = html;
  }

  function scheduleNotesSave(id) {
    clearTimeout(_notesTimers[id]);
    var ind = document.getElementById('notes-ind-' + id);
    if (ind) ind.textContent = '';
    _notesTimers[id] = setTimeout(function() { saveNotes(id); }, 1500);
  }

  function saveNotes(id) {
    clearTimeout(_notesTimers[id]);
    var el  = document.getElementById('notes-' + id);
    var ind = document.getElementById('notes-ind-' + id);
    if (!el) return;
    if (ind) ind.textContent = 'Saving…';
    patchReport(id, { client_notes: el.value }, function(ok) {
      if (ind) ind.textContent = ok ? 'Saved ✓' : 'Save failed';
      if (ok && _detailCache[id]) _detailCache[id].client_notes = el.value;
    });
  }

  function scheduleAmountSave(rid, fid, val) {
    var key = rid + '_' + fid;
    clearTimeout(_amountTimers[key]);
    _amountTimers[key] = setTimeout(function() { setAmount(rid, fid, val); }, 1000);
  }

  function setApplied(rid, fid, applied) {
    var cache = _detailCache[rid];
    if (!cache) return;
    var tracking = JSON.parse(JSON.stringify(cache.application_tracking || {}));
    if (!tracking[fid]) tracking[fid] = {};
    tracking[fid].applied = applied;
    if (!applied) { delete tracking[fid].outcome; delete tracking[fid].award_amount; }
    patchReport(rid, { application_tracking: tracking }, function(ok) {
      if (ok) { cache.application_tracking = tracking; renderDetail(rid, cache); refreshStats(); }
    });
  }

  function setOutcome(rid, fid, outcome) {
    var cache = _detailCache[rid];
    if (!cache) return;
    var tracking = JSON.parse(JSON.stringify(cache.application_tracking || {}));
    if (!tracking[fid]) tracking[fid] = {};
    tracking[fid].outcome = outcome;
    if (outcome !== 'approved') delete tracking[fid].award_amount;
    patchReport(rid, { application_tracking: tracking }, function(ok) {
      if (ok) { cache.application_tracking = tracking; renderDetail(rid, cache); refreshStats(); }
    });
  }

  function setAmount(rid, fid, val) {
    var cache = _detailCache[rid];
    if (!cache) return;
    var tracking = JSON.parse(JSON.stringify(cache.application_tracking || {}));
    if (!tracking[fid]) tracking[fid] = {};
    tracking[fid].award_amount = parseFloat(val) || 0;
    patchReport(rid, { application_tracking: tracking }, function(ok) {
      if (ok) { cache.application_tracking = tracking; refreshStats(); }
    });
  }

  function patchReport(id, data, callback) {
    fetch(API + '/reports/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    .then(function(res) { if (callback) callback(res.ok); })
    .catch(function()   { if (callback) callback(false); });
  }

  function refreshStats() {
    fetch(API + '/reports?limit=20')
    .then(function(res) { return res.ok ? res.json() : []; })
    .then(function(reports) {
      var stats = calcStats(reports);
      document.getElementById('stat-applied').textContent  = stats.applied;
      document.getElementById('stat-approved').textContent = stats.approved;
      document.getElementById('stat-value').textContent    = stats.value > 0 ? '\xA3' + stats.value.toLocaleString('en-GB') : '\xA3' + '0';
    })
    .catch(function() {});
  }

  function showRawJson(id) {
    var data = _detailCache[id];
    if (!data) return;
    document.getElementById('report-modal-content').textContent = JSON.stringify(data.report || data, null, 2);
    document.getElementById('report-modal').style.display = 'flex';
  }

  function closeReportModal() {
    document.getElementById('report-modal').style.display = 'none';
  }

  /* Close modals on backdrop click */
  document.getElementById('report-modal').addEventListener('click', function (e) {
    if (e.target === this) closeReportModal();
  });

  /* ── HELPERS ── */
  function showError(msg) {
    var el = document.getElementById('submit-error');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(function () { el.style.display = 'none'; }, 10000);
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function safeHttpUrl(value) {
    try {
      var parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
    } catch (_) { return ''; }
  }

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

  function candidateAction(id, action, body) {
    var payload = body || { candidate_id: id, action: action };
    fetch(API + '/admin/candidates/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(function (r) { if (!r.ok) return r.json().then(function (e) { throw new Error(e.detail || ''); }); return r.json(); })
    .then(function () { loadCandidates(); })
    .catch(function (e) { alert('Action failed — ' + (e.message || 'try again.')); });
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
    fetch(API + '/admin/proposals/action', {
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
  }

  function dismissProposal(id) {
    var note = prompt('Dismiss this proposal? (the source is still marked re-checked today). Optional note:');
    if (note === null) return;
    fetch(API + '/admin/proposals/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposal_id: id, action: 'dismiss', review_note: note || null })
    })
    .then(function (r) { if (!r.ok) return r.json().then(function (e) { throw new Error(e.detail || ''); }); return r.json(); })
    .then(function () { loadProposals(); })
    .catch(function (e) { alert('Dismiss failed — ' + (e.message || 'try again.')); });
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
    var body = { fund_id: fundId, change_type: changeType, action: action };
    if (newUrl) body.new_url = newUrl;
    fetch(API + '/admin/flags/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function () { loadFlags(); })
    .catch(function () { alert('Action failed — try again.'); });
  }

  function flagFixUrl(fundId) {
    var url = prompt('Enter the correct source URL for this fund:');
    if (url && url.trim()) flagAction(fundId, 'link_dead', 'fix_url', url.trim());
  }

  /* ── MOBILE NAV ── */
  function toggleMobileNav() {
    var nav = document.getElementById('mobile-nav');
    var btn = document.querySelector('.hamburger');
    var open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
  }
