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
