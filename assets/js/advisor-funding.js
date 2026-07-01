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
