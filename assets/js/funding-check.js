import { escapeHtml } from './safe-dom.js';

const API = 'https://api.mastoras.uk';
let lastProfile = {};

function buildFitReport(count, topFunds, profile) {
  const shown = (topFunds || []).slice(0, 5);
  const rows = shown.map((fund, index) => (
    '<div class="fr-row">' +
      '<span class="fr-rank">' + (index + 1) + '</span>' +
      '<span class="fr-scheme">' + escapeHtml(fund) + '</span>' +
      '<span class="fr-locked fr-fit" aria-hidden="true"></span>' +
      '<span class="fr-verdict">🔒 locked</span>' +
    '</div>'
  )).join('');

  const moreCount = count - shown.length;
  const more = moreCount > 0
    ? '<div class="fr-more">🔒 + ' + moreCount + ' more, scored &amp; ranked</div>'
    : '';

  const current = profile || {};
  const subject = encodeURIComponent('Funding Fit Report request');
  const body = encodeURIComponent(
    'Hi Garry,\n\n' +
    'I\'d like the full Funding Fit Report (£195).\n\n' +
    'My free-check profile to start:\n' +
    '- Organisation type: ' + (current.orgType || '') + '\n' +
    '- Sector: ' + (current.sector || '') + '\n' +
    '- Council area: ' + (current.council || '') + '\n' +
    '- Funding ask: £' + (current.fundingAsk || '') + '\n' +
    '- Free check matched: ' + count + ' schemes\n\n' +
    'I understand the full report goes deeper and you\'ll need more detail from me.\n\n' +
    'Thanks,'
  );
  const mailto = 'mailto:hello@mastoras.uk?subject=' + subject + '&body=' + body;

  return (
    '<div class="fit-report">' +
      '<div class="fit-report-head">' +
        '<div class="fr-title">The full Funding Fit Report</div>' +
        '<div class="fr-sub">Beyond the match — a reasoned fit, built for your profile</div>' +
      '</div>' +
      '<div class="fit-report-table">' +
        '<div class="fr-row fr-head"><span>#</span><span>Scheme</span><span class="fr-fit">Fit</span><span>Verdict</span></div>' +
        rows +
        more +
      '</div>' +
      '<div class="fit-report-foot">' +
        '<p class="fr-includes">Each scheme given a <strong>funding fit score out of 100 and ranked</strong>, with a clear ' +
        '<strong>verdict</strong> (Apply / Worth checking / Not worth it) — why it fits, ' +
        '<strong>the one thing to fix</strong> before you apply, the deadline and application intelligence ' +
        '(criteria, tips, pitfalls), Garry\'s view, and a <strong>first-draft application</strong> to build on.</p>' +
        '<a href="' + mailto + '" class="btn-report">Get the full Funding Fit Report — £195 →</a>' +
        '<p class="fr-meta">Scored by the engine, reasoned and written by Garry. Built from a fuller profile ' +
        'than the four questions above. PDF in ~3 working days.</p>' +
      '</div>' +
    '</div>'
  );
}

function showResult(data) {
  const count = data.match_count || 0;
  const topFunds = data.top_funds || [];

  document.getElementById('result-number').textContent = count;
  document.getElementById('result-label').textContent =
    'potential funding scheme' + (count !== 1 ? 's' : '') + ' matched your profile';

  let message;
  let next;
  if (count > 0) {
    message = 'Your profile matched ' + count + ' possible funding route' + (count !== 1 ? 's' : '') + '. ' +
      'But a match isn\'t the same as a fit — the real questions are which of these are genuinely worth pursuing, and whether the project is ready to apply.';
    next =
      buildFitReport(count, topFunds, lastProfile) +
      '<p style="font-size:13.5px;color:#666;margin-top:4px;padding-top:18px;border-top:1px solid var(--rule);line-height:1.6;">' +
        '<strong>Not sure the project\'s ready to apply?</strong> That\'s often the bigger issue. A ' +
        '<a href="/#services" style="color:var(--teal);font-weight:600;">Pre-Build Assessment or First Fix</a> ' +
        'gets the idea clear and costed first — so the application actually lands.' +
      '</p>';
  } else {
    message = 'No clean matches for this profile — and that\'s useful to know. When nothing fits, the issue is usually the project, not the funding pool.';
    next =
      '<p style="font-size:14.5px;color:#555;margin-bottom:20px;line-height:1.7;">' +
        'The fix isn\'t another application — it\'s getting the idea clear, costed and evidence-ready first. ' +
        'That\'s exactly what Mástoras does before a penny of effort goes into a form.' +
      '</p>' +
      '<a href="https://calendly.com/garynicholl1515/20min" target="_blank" rel="noopener" class="btn-cta">Talk it through — book a free call →</a>' +
      '<p style="font-size:13.5px;color:#666;margin-top:18px;padding-top:16px;border-top:1px solid var(--rule);line-height:1.6;">' +
        'A <a href="/#services" style="color:var(--teal);font-weight:600;">Pre-Build Assessment</a> stress-tests the idea before you commit; ' +
        '<a href="/#services" style="color:var(--teal);font-weight:600;">The First Fix</a> clears your single biggest blocker.' +
      '</p>';
  }

  document.getElementById('result-message').textContent = message;
  document.getElementById('result-next').innerHTML = next;
  document.getElementById('form-section').style.display = 'none';
  document.getElementById('result-section').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function runCheck() {
  const orgType = document.getElementById('org_type').value;
  const sector = document.getElementById('sector').value;
  const council = document.getElementById('council_area').value;
  const fundingAsk = parseFloat(document.getElementById('funding_ask').value);
  const errorMessage = document.getElementById('error-msg');
  const turnstileInput = document.querySelector('[name="cf-turnstile-response"]');
  const allFilled = orgType && sector && council && fundingAsk > 0 &&
    turnstileInput && turnstileInput.value;

  if (!allFilled) {
    errorMessage.style.display = 'block';
    ['org_type', 'sector', 'council_area', 'funding_ask'].forEach((id) => {
      const element = document.getElementById(id);
      const invalid = !element.value ||
        (id === 'funding_ask' && parseFloat(element.value) <= 0);
      element.classList.toggle('error', invalid);
    });
    return;
  }

  errorMessage.style.display = 'none';
  const button = document.getElementById('submit-btn');
  button.textContent = 'Checking…';
  button.disabled = true;

  const payload = {
    org_profile: {
      org_type: orgType,
      sector,
      council_area: council,
    },
    project_profile: {
      funding_ask: fundingAsk,
    },
    website: document.getElementById('website').value,
  };
  lastProfile = { orgType, sector, council, fundingAsk };

  fetch(API + '/taster', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Turnstile-Token': turnstileInput.value,
    },
    body: JSON.stringify(payload),
  })
    .then((response) => response.ok ? response.json() : Promise.reject(response.status))
    .then(showResult)
    .catch(() => {
      button.textContent = 'Check my funding →';
      button.disabled = false;
      errorMessage.textContent = 'Something went wrong — please try again.';
      errorMessage.style.display = 'block';
      if (window.turnstile) window.turnstile.reset();
    });
}

function resetForm() {
  document.getElementById('form-section').style.display = 'block';
  document.getElementById('result-section').style.display = 'none';
  document.getElementById('submit-btn').textContent = 'Check my funding →';
  document.getElementById('submit-btn').disabled = false;
  document.getElementById('top-funds-list').style.display = 'none';
  document.getElementById('error-msg').style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('submit-btn').addEventListener('click', runCheck);
document.getElementById('retry-btn').addEventListener('click', resetForm);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && document.getElementById('form-section').style.display !== 'none') {
    runCheck();
  }
});
