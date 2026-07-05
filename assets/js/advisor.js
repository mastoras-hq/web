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
    else if (action === 'save-pilot-feedback') savePilotFeedback(control.dataset.reportId);
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

  /* ── MOBILE NAV ── */
  function toggleMobileNav() {
    var nav = document.getElementById('mobile-nav');
    var btn = document.querySelector('.hamburger');
    var open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
  }
