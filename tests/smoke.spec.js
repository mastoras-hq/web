const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.route(/^https:/, route => route.abort());
});

test('public pages render their primary controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#contact-form')).toBeVisible();
  await page.goto('/funding-check/');
  await expect(page.locator('#submit-btn')).toContainText('Check my funding');
  await page.goto('/readiness-check/form/');
  await expect(page.locator('#brick-form')).toBeVisible();
});

test('protected surfaces are marked noindex', async ({ page }) => {
  for (const path of ['/advisor/', '/hq/', '/login/']) {
    await page.goto(path);
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
  }
});

test('protected surfaces do not use inline event handlers', async ({ request }) => {
  for (const path of ['/advisor/', '/hq/']) {
    const response = await request.get(path);
    expect(response.ok()).toBeTruthy();
    const source = await response.text();
    expect(source).not.toMatch(/\son[a-z]+\s*=/i);
  }
});

test('protected application pages use external scripts', async ({ request }) => {
  for (const path of ['/login/', '/auth/callback/', '/advisor/', '/hq/']) {
    const response = await request.get(path);
    expect(response.ok()).toBeTruthy();
    const source = await response.text();
    expect(source).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
    expect(source).toContain('/assets/js/');
  }
});

test('HQ external script loads and updates a client through authenticated routes', async ({ page }) => {
  const patches = [];
  await page.route('**/assets/js/auth-bootstrap.js', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: 'window.mastorasAuth={requireSession:()=>Promise.resolve({access_token:"test"})};',
  }));
  await page.route(/\/clients$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{
      id: 'client-1', name: 'Test Founder', org_name: 'Test Organisation',
      email: 'founder@example.com', source: 'test', status: 'Lead',
      report_count: 0, brick_score: null, last_activity: '2026-07-01T09:00:00Z',
    }]),
  }));
  await page.route(/\/clients\/client-1$/, async route => {
    if (route.request().method() === 'PATCH') {
      patches.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        client: {
          id: 'client-1', name: 'Test Founder', org_name: 'Test Organisation',
          email: 'founder@example.com', source: 'test', status: 'Lead',
          notes: '', created_at: '2026-07-01T09:00:00Z',
        },
        reports: [], brick: [], calls: [], documents: [],
        stats: { report_count: 0, applied: 0, approved: 0, value_awarded: 0 },
      }),
    });
  });

  await page.goto('/hq/');
  await expect(page.locator('#clients-tbody')).toContainText('Test Founder');
  await page.locator('[data-action="open-client"][data-client-id="client-1"]').click();
  await expect(page.locator('#profile-content h2')).toHaveText('Test Founder');
  await page.locator('#client-notes').fill('Follow up next week');
  await page.locator('#client-notes').blur();
  await expect.poll(() => patches.some(body => body.notes === 'Follow up next week')).toBe(true);
  await expect(page.locator('#notes-ind')).toContainText('Saved');
});

test('login submits a safe magic-link redirect', async ({ page }) => {
  await page.route('**/assets/js/auth-bootstrap.js', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: `window.mastorasAuth={
      getSession:()=>Promise.resolve(null),
      client:{auth:{signInWithOtp:async payload=>{window.__otpPayload=payload;return {error:null};}}}
    };`,
  }));
  await page.goto('/login/?returnTo=https://evil.example/');
  await page.locator('#email').fill('founder@example.com');
  await page.locator('#submit').click();
  await expect(page.locator('#message')).toContainText('Check your inbox');
  const payload = await page.evaluate(() => window.__otpPayload);
  expect(payload.email).toBe('founder@example.com');
  expect(payload.options.shouldCreateUser).toBe(false);
  expect(payload.options.emailRedirectTo).toContain('returnTo=%2Fadvisor%2F');
});

test('Advisor delegated controls remain interactive', async ({ page }) => {
  await page.route('**/assets/js/auth-bootstrap.js', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: 'window.mastorasAuth={requireSession:()=>new Promise(()=>{}),signOut:()=>{window.__signedOut=true;}};',
  }));
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto('/advisor/');

  await page.locator('#vat_yes').click();
  await expect(page.locator('#vat_yes')).toHaveClass(/active/);
  await page.locator('.effort-btn[data-value="low"]').click();
  await expect(page.locator('.effort-btn[data-value="low"]')).toHaveClass(/active/);

  await page.locator('.hamburger').click();
  await expect(page.locator('.hamburger')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#mobile-nav')).toHaveClass(/open/);
  await page.locator('#mobile-nav [data-action="sign-out"]').click();
  await expect.poll(() => page.evaluate(() => window.__signedOut)).toBe(true);
});

test('Advisor admin module initializes review queues after authentication', async ({ page }) => {
  await page.route('**/assets/js/auth-bootstrap.js', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: 'window.mastorasAuth={requireSession:()=>Promise.resolve({access_token:"test"}),signOut:()=>{}};',
  }));
  await page.route('https://api.mastoras.uk/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }));

  await page.goto('/advisor/');
  await expect(page.locator('#admin-section')).toBeVisible();
  await expect(page.locator('#candidates-list')).toContainText('No candidates waiting');
  await expect(page.locator('#proposals-list')).toContainText('No proposed updates');
  await expect(page.locator('#flags-list')).toContainText('Nothing flagged');
  await expect(page.locator('#runs-list')).toContainText('No runs recorded');
});

async function injectTurnstile(page, selector) {
  await page.locator(selector).evaluate(form => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'cf-turnstile-response';
    input.value = 'test-token';
    form.appendChild(input);
  });
}

test('contact submission uses the Mástoras API once', async ({ page }) => {
  let calls = 0;
  await page.route(/\/contact$/, async route => {
    calls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' });
  });
  await page.goto('/');
  await page.locator('#contact-form #name').fill('Test Founder');
  await page.locator('#contact-form #email').fill('founder@example.com');
  await page.locator('#contact-form #message').fill('Testing an idea.');
  await page.locator('#contact-consent').check();
  await injectTurnstile(page, '#contact-form');
  await page.locator('#contact-form button[type="submit"]').click();
  await expect(page.locator('#contact-status')).toContainText('Enquiry sent');
  expect(calls).toBe(1);
});

test('funding taster renders API matches', async ({ page }) => {
  await page.route(/\/taster$/, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ match_count: 2, top_funds: ['Fund A', 'Fund B'] }),
  }));
  await page.goto('/funding-check/');
  await page.locator('#org_type').selectOption('SME');
  await page.locator('#sector').selectOption('Digital & Technology');
  await page.locator('#council_area').selectOption('Belfast City');
  await page.locator('#funding_ask').fill('10000');
  await injectTurnstile(page, '.form-card');
  await page.locator('#submit-btn').click();
  await expect(page.locator('#result-number')).toHaveText('2');
});

test('BRICK displays the server-calculated score', async ({ page }) => {
  await page.route(/\/brick$/, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ status: 'ok', id: 'test', score: 12, band: 'Needs more evidence' }),
  }));
  await page.goto('/readiness-check/form/');
  await page.locator('#name').fill('Test Founder');
  await page.locator('#email').fill('founder@example.com');
  await page.locator('#idea').fill('A useful project idea');
  for (let question = 1; question <= 12; question += 1) {
    await page.locator(`label[for="q${question}-1"]`).click();
    await expect(page.locator(`#q${question}-1`)).toBeChecked();
  }
  await page.locator('#consent').check();
  await injectTurnstile(page, '#brick-form');
  await page.locator('#submit-btn').click();
  await expect(page.locator('#result-score-num')).toHaveText('12/24');
});
