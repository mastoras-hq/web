const API = 'https://api.mastoras.uk';

fetch(API + '/digest')
  .then((response) => response.ok ? response.json() : null)
  .then((digest) => {
    if (!digest) return;

    const openCount = digest.stats?.total_open;
    if (Number.isInteger(openCount) && openCount >= 0) {
      const openElement = document.getElementById('fi-open');
      if (openElement) openElement.textContent = String(openCount);
    }

    const reviewedElement = document.getElementById('fi-register-rev');
    if (reviewedElement && typeof digest.generated_at === 'string') {
      const generatedAt = new Date(digest.generated_at);
      if (!Number.isNaN(generatedAt.getTime())) {
        reviewedElement.textContent = 'Reviewed ' + generatedAt.toLocaleDateString(
          'en-GB',
          { month: 'short', year: 'numeric' },
        );
      }
    }
  })
  .catch(() => {});

const contactForm = document.getElementById('contact-form');
if (contactForm) {
  contactForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const button = contactForm.querySelector('button[type="submit"]');
    const status = document.getElementById('contact-status');
    const turnstileInput = contactForm.querySelector('[name="cf-turnstile-response"]');
    if (button.disabled) return;
    if (!contactForm.reportValidity() || !turnstileInput?.value) {
      status.textContent = 'Please complete every required field and the verification check.';
      return;
    }

    button.disabled = true;
    status.textContent = 'Sending…';

    try {
      const service = document.getElementById('service').value;
      const message = document.getElementById('message').value.trim();
      const response = await fetch(API + '/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Turnstile-Token': turnstileInput.value,
        },
        body: JSON.stringify({
          name: document.getElementById('name').value.trim(),
          email: document.getElementById('email').value.trim(),
          message: service ? 'Service: ' + service + '\n\n' + message : message,
          website: contactForm.elements.website.value,
          consent: document.getElementById('contact-consent').checked,
          privacy_policy_version: '2026-06-23',
        }),
      });
      if (!response.ok) throw new Error('Submission failed');

      contactForm.reset();
      status.textContent = 'Enquiry sent. I’ll reply within one working day.';
      button.textContent = 'Sent ✓';
    } catch (_) {
      status.textContent = 'I could not send that just now. Please try again or email hello@mastoras.uk.';
      button.disabled = false;
      if (window.turnstile) window.turnstile.reset();
    }
  });
}

try {
  console.log(
    '%cMástoras',
    'font:700 22px Merriweather,Georgia,serif;color:#B08D57;',
  );
  console.log(
    '%cStructure → Story → Soul',
    'font-style:italic;color:#0F595E;',
  );
  console.log(
    '%cCrafted by Garry Nicholl on the Causeway Coast.\nCo-built in the workshop with Claude — a.k.a. “Whetstone”, who keeps the chisels sharp. 🔨',
    'color:#8a8a8a;font-size:12px;line-height:1.6;',
  );
} catch (_) {
  // Console styling is optional and must never affect the page.
}
