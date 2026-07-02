const questionNames = [
  'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6',
  'Q7', 'Q8', 'Q9', 'Q10', 'Q11', 'Q12',
];

const bands = [
  {
    min: 0,
    max: 8,
    title: 'Not ready yet',
    desc: 'Do not write a business plan. The idea needs more definition first — who the customer is, how money comes in, and what the core problem actually is. That is where to start.',
    colour: '#c0392b',
  },
  {
    min: 9,
    max: 15,
    title: 'Needs more evidence',
    desc: 'The idea has some shape but the gaps are significant. Test demand, clarify costs, or name the risks before committing to a full plan.',
    colour: '#e67e22',
  },
  {
    min: 16,
    max: 20,
    title: 'Ready for assessment',
    desc: 'The idea has enough structure to stress-test properly. A Pre-Build Assessment would expose what holds and what does not — before money goes in.',
    colour: '#0F595E',
  },
  {
    min: 21,
    max: 24,
    title: 'Ready to build',
    desc: 'The idea has enough clarity for a Business Build Pack after a review session. Book a Fit Call to confirm and agree next steps.',
    colour: '#27ae60',
  },
];

function getScoreValue(question) {
  const element = document.querySelector(`input[name="${question}_Score"]:checked`);
  return element ? Number.parseInt(element.value, 10) : null;
}

function getScore() {
  return questionNames.reduce(
    (total, question) => total + (getScoreValue(question) ?? 0),
    0,
  );
}

function getBand(score) {
  return bands.find((band) => score >= band.min && score <= band.max);
}

function getAnswer(question) {
  const element = document.querySelector(`textarea[name="${question}_Answer"]`);
  return element ? element.value.trim() || null : null;
}

function getChecked(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`))
    .map((checkbox) => checkbox.value);
}

function getAnsweredCount() {
  return questionNames.filter(
    (question) => document.querySelector(`input[name="${question}_Score"]:checked`),
  ).length;
}

function updateScoreBar() {
  const score = getScore();
  const band = getBand(score);
  document.getElementById('live-score').textContent = String(score);
  document.getElementById('bar-band').textContent = getAnsweredCount() === 0
    ? 'Answer the questions below to see your score'
    : band?.title || '';
}

function showError(message) {
  const errorElement = document.getElementById('form-error');
  errorElement.textContent = message;
  errorElement.style.display = 'block';
  errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderBand(savedScore, savedBand, fallbackBand) {
  const resultBand = document.getElementById('result-band-title');
  resultBand.replaceChildren();

  const serverBand = bands.find((band) => band.title === savedBand)
    || getBand(savedScore)
    || fallbackBand;
  if (!serverBand) return null;

  const badge = document.createElement('span');
  badge.className = 'decision-badge';
  badge.style.color = serverBand.colour;
  badge.style.borderColor = serverBand.colour;

  const dot = document.createElement('span');
  dot.className = 'db-dot';
  dot.style.backgroundColor = serverBand.colour;
  badge.append(dot, document.createTextNode(savedBand));
  resultBand.append(badge);
  return serverBand;
}

function buildRecord(form, name, email, idea) {
  return {
    name,
    email,
    business_idea: idea,
    q1_answer: getAnswer('Q1'),
    q1_score: getScoreValue('Q1'),
    q2_answer: getAnswer('Q2'),
    q2_score: getScoreValue('Q2'),
    q3_answer: getAnswer('Q3'),
    q3_score: getScoreValue('Q3'),
    q4_answer: getAnswer('Q4'),
    q4_score: getScoreValue('Q4'),
    q5_answer: getAnswer('Q5'),
    q5_score: getScoreValue('Q5'),
    q6_proof: getChecked('Q6_Proof'),
    q6_answer: getAnswer('Q6'),
    q6_score: getScoreValue('Q6'),
    q7_income: getChecked('Q7_Income'),
    q7_score: getScoreValue('Q7'),
    q8_answer: getAnswer('Q8'),
    q8_score: getScoreValue('Q8'),
    q9_answer: getAnswer('Q9'),
    q9_score: getScoreValue('Q9'),
    q10_answer: getAnswer('Q10'),
    q10_score: getScoreValue('Q10'),
    q11_answer: getAnswer('Q11'),
    q11_score: getScoreValue('Q11'),
    q12_answer: getAnswer('Q12'),
    q12_score: getScoreValue('Q12'),
    website: form.elements.website.value,
    consent: true,
    privacy_policy_version: '2026-06-23',
  };
}

document.querySelectorAll('input[type="radio"]').forEach((radio) => {
  radio.addEventListener('change', updateScoreBar);
});

document.getElementById('brick-form').addEventListener('submit', async function (event) {
  event.preventDefault();

  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const idea = document.getElementById('idea').value.trim();
  const consent = document.getElementById('consent').checked;
  const turnstileInput = this.querySelector('[name="cf-turnstile-response"]');

  if (!name || !email || !idea || !consent || getAnsweredCount() !== 12 ||
      !turnstileInput?.value) {
    showError(
      'Please complete your details, score all 12 questions, tick consent, and complete verification.',
    );
    return;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    showError('That email doesn\'t look right — please check it.');
    return;
  }

  const errorElement = document.getElementById('form-error');
  errorElement.style.display = 'none';
  const localBand = getBand(getScore());
  const button = document.getElementById('submit-btn');
  button.disabled = true;
  button.textContent = 'Sending...';

  try {
    const response = await fetch('https://api.mastoras.uk/brick', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Turnstile-Token': turnstileInput.value,
      },
      body: JSON.stringify(buildRecord(this, name, email, idea)),
    });
    if (!response.ok) throw new Error('Submission failed');

    const saved = await response.json();
    const savedScore = Number(saved.score);
    if (!Number.isInteger(savedScore) || savedScore < 0 || savedScore > 24 ||
        typeof saved.band !== 'string') {
      throw new Error('Invalid response');
    }

    const serverBand = renderBand(savedScore, saved.band, localBand);
    document.getElementById('result-score-num').textContent = savedScore + '/24';
    document.getElementById('result-band-desc').textContent = serverBand?.desc || '';
    const resultSection = document.getElementById('result-section');
    resultSection.style.display = 'block';
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    button.textContent = 'Submitted ✓';
  } catch (_) {
    button.disabled = false;
    button.textContent = 'Submit my BRICK →';
    showError('Something went wrong. Please try again or email hello@mastoras.uk directly.');
    if (window.turnstile) window.turnstile.reset();
  }
});
