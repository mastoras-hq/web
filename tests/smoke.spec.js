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

test('public navigation and homepage accordions use delegated controls', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto('/');

  await page.locator('.hamburger').click();
  await expect(page.locator('.hamburger')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#mobile-nav')).toHaveClass(/open/);
  await page.locator('#mobile-nav a[href="#services"]').click();
  await expect(page.locator('.hamburger')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#mobile-nav')).not.toHaveClass(/open/);

  await page.locator('#svc-toggle-btn').click();
  await expect(page.locator('#svc-toggle-btn')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#svc-secondary-content')).toBeVisible();

  const questions = page.locator('.faq-q');
  await questions.nth(0).click();
  await expect(questions.nth(0)).toHaveAttribute('aria-expanded', 'true');
  await questions.nth(1).click();
  await expect(questions.nth(0)).toHaveAttribute('aria-expanded', 'false');
  await expect(questions.nth(1)).toHaveAttribute('aria-expanded', 'true');
});

test('homepage renders validated funding-register metadata', async ({ page }) => {
  await page.route(/\/digest$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      stats: { total_open: 17 },
      generated_at: '2026-07-02T09:00:00Z',
    }),
  }));
  await page.goto('/');
  await expect(page.locator('#fi-open')).toHaveText('17');
  await expect(page.locator('#fi-register-rev')).toContainText('Reviewed Jul 2026');
});

test('homepage serves modern backgrounds and omits unused originals', async ({ request }) => {
  for (const path of [
    '/dark-hedges-750.avif',
    '/dark-hedges-750.webp',
    '/carrick-a-rede-turquoise-750.avif',
    '/carrick-a-rede-turquoise-750.webp',
  ]) {
    expect((await request.get(path)).ok()).toBeTruthy();
  }
  for (const path of [
    '/marina-sunset.jpg',
    '/garry-nicholl.jpg.png',
    '/Carrick-a-rede.jpeg.jpg',
  ]) {
    expect((await request.get(path)).status()).toBe(404);
  }
  const homepage = await (await request.get('/')).text();
  expect(homepage).toContain('image-set(');
  expect(homepage).toContain("type('image/avif')");
  expect(homepage).toContain("type('image/webp')");
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

test('legacy public pages use the shared external analytics bootstrap', async ({ request }) => {
  for (const path of [
    '/tools/',
    '/readiness-check/',
    '/blog/grant-writing-northern-ireland.html',
    '/blog/pre-build-assessment-case-study.html',
  ]) {
    const response = await request.get(path);
    expect(response.ok()).toBeTruthy();
    const source = await response.text();
    const withoutJsonLd = source.replace(
      /<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,
      '',
    );
    expect(withoutJsonLd).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
    expect(source).toContain('/assets/js/analytics.js');
  }
});

test('security headers block script attributes and permit required GA4 origins', async ({ request }) => {
  const response = await request.get('/');
  expect(response.ok()).toBeTruthy();
  const csp = response.headers()['content-security-policy'];
  expect(csp).toContain("script-src-attr 'none'");
  expect(csp).toContain('https://*.googletagmanager.com');
  expect(csp).toContain('https://*.google-analytics.com');
  expect(csp).toContain('https://*.analytics.google.com');
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
  await page.route(/\/(?:admin\/.*|updates(?:\?.*)?|reports(?:\?.*)?)$/, route => route.fulfill({
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

test('Advisor CRM module loads report history and persists notes', async ({ page }) => {
  const patches = [];
  await page.route('**/assets/js/auth-bootstrap.js', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: 'window.mastorasAuth={requireSession:()=>Promise.resolve({access_token:"test"}),signOut:()=>{}};',
  }));
  await page.route(/\/(?:admin\/.*|updates(?:\?.*)?)$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }));
  await page.route(/\/reports(?:\/report-1|\?limit=20)$/, async route => {
    const request = route.request();
    if (request.method() === 'PATCH') {
      patches.push(request.postDataJSON());
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    if (new URL(request.url()).pathname.endsWith('/report-1')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          client_notes: '',
          application_tracking: {},
          report: { matches: [{ fund_id: 'fund-1', fund_name: 'Test Fund' }] },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 'report-1', created_at: '2026-07-01T09:00:00Z',
        client_ref: 'TEST-1', client_name: 'Test Founder',
        top_fund: 'Test Fund', total_matches: 1, application_tracking: {},
      }]),
    });
  });

  await page.goto('/advisor/');
  await expect(page.locator('#previous-reports')).toBeVisible();
  await expect(page.locator('#reports-tbody')).toContainText('Test Founder');
  await page.locator('[data-action="toggle-detail"][data-report-id="report-1"]').first().click();
  await expect(page.locator('#notes-report-1')).toBeVisible();
  await page.locator('#notes-report-1').fill('Awaiting funder response');
  await page.locator('#notes-report-1').blur();
  await expect.poll(() => patches.some(body => body.client_notes === 'Awaiting funder response')).toBe(true);
  await expect(page.locator('#notes-ind-report-1')).toContainText('Saved');
});

test('Advisor funding module validates and submits a report profile', async ({ page }) => {
  let submitted;
  await page.route('**/assets/js/auth-bootstrap.js', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: 'window.mastorasAuth={requireSession:()=>Promise.resolve({access_token:"test"}),signOut:()=>{}};',
  }));
  await page.route(/\/(?:admin\/.*|updates(?:\?.*)?|reports(?:\?.*)?)$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }));
  await page.route(/\/report$/, async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        report_id: 'report-new',
        applicant_summary: { organisation: 'Test Organisation' },
        matches: [],
      }),
    });
  });

  await page.goto('/advisor/');
  await page.locator('#org_name').fill('Test Organisation');
  await page.locator('#org_type').selectOption('SME');
  await page.locator('#sector').selectOption('Creative & Digital');
  await page.locator('#stage').selectOption('Early stage');
  await page.locator('#council_area').selectOption('Belfast City');
  await page.locator('#description').fill('Purchase production equipment and train staff.');
  await page.locator('#funding_ask').fill('15000');
  await page.locator('#submit-btn').click();

  await expect(page.locator('#results-heading')).toContainText('Found 0 matching schemes');
  expect(submitted.org_profile.org_name).toBe('Test Organisation');
  expect(submitted.project_profile.funding_ask).toBe(15000);
  expect(submitted.constraints.effort_capacity).toBe('medium');
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

async function completeBrick(page) {
  await page.locator('#name').fill('Test Founder');
  await page.locator('#email').fill('founder@example.com');
  await page.locator('#idea').fill('A useful project idea');
  for (let question = 1; question <= 12; question += 1) {
    await page.locator(`label[for="q${question}-1"]`).click();
    await expect(page.locator(`#q${question}-1`)).toBeChecked();
  }
  await page.locator('#consent').check();
  await injectTurnstile(page, '#brick-form');
}

test('contact submission uses the Mástoras API once', async ({ page }) => {
  let calls = 0;
  let submitted;
  await page.route(/\/contact$/, async route => {
    calls += 1;
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' });
  });
  await page.goto('/');
  await page.locator('#contact-form #name').fill('Test Founder');
  await page.locator('#contact-form #email').fill('founder@example.com');
  await page.locator('#contact-form #service').selectOption({ index: 1 });
  await page.locator('#contact-form #message').fill('Testing an idea.');
  await page.locator('#contact-consent').check();
  await injectTurnstile(page, '#contact-form');
  await page.locator('#contact-form button[type="submit"]').click();
  await expect(page.locator('#contact-status')).toContainText('Enquiry sent');
  expect(calls).toBe(1);
  expect(submitted.message).toContain('Service:');
  expect(submitted.message).toContain('Testing an idea.');
});

test('funding taster renders API matches', async ({ page }) => {
  await page.route(/\/taster$/, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      match_count: 2,
      top_funds: ['Fund A', '<img src=x onerror="window.__unsafe=true">'],
    }),
  }));
  await page.goto('/funding-check/');
  await page.locator('#org_type').selectOption('SME');
  await page.locator('#sector').selectOption('Digital & Technology');
  await page.locator('#council_area').selectOption('Belfast City');
  await page.locator('#funding_ask').fill('10000');
  await injectTurnstile(page, '.form-card');
  await page.locator('#submit-btn').click();
  await expect(page.locator('#result-number')).toHaveText('2');
  await expect(page.locator('.fr-scheme')).toHaveCount(2);
  await expect(page.locator('.fr-scheme').nth(1)).toContainText('<img src=x');
  await expect(page.locator('#result-next img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__unsafe)).toBeUndefined();
  await page.locator('#retry-btn').click();
  await expect(page.locator('#form-section')).toBeVisible();
});

test('funding digest renders hostile API fields as text and rejects unsafe links', async ({ page }) => {
  await page.route(/\/digest$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      stats: {
        total_active: 3,
        total_open: 2,
        deadlines_next_90_days: 1,
      },
      generated_at: '2026-07-02T09:00:00Z',
      recently_opened: [{
        fund_name: '<img src=x onerror="window.__unsafe=true">',
        provider: 'Test Provider',
        status: 'Open',
        source_url: 'javascript:window.__unsafe=true',
      }],
      closing_soon: [],
      watchlist: [],
    }),
  }));
  await page.goto('/funding-digest/');
  await expect(page.locator('#stats-row')).toContainText('3');
  await expect(page.locator('#recent-grid .fund-card-name')).toContainText('<img src=x');
  await expect(page.locator('#recent-grid img')).toHaveCount(0);
  await expect(page.locator('#recent-grid a')).toHaveCount(0);
  expect(await page.evaluate(() => window.__unsafe)).toBeUndefined();
});

test('BRICK displays the server-calculated score', async ({ page }) => {
  let submitted;
  await page.route(/\/brick$/, async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({
    status: 200, contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        id: 'test',
        score: 12,
        band: '<img src=x onerror="window.__unsafe=true">',
      }),
    });
  });
  await page.goto('/readiness-check/form/');
  await completeBrick(page);
  await page.locator('#submit-btn').click();
  await expect(page.locator('#result-score-num')).toHaveText('12/24');
  await expect(page.locator('#result-band-title')).toContainText('<img src=x');
  await expect(page.locator('#result-band-title img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__unsafe)).toBeUndefined();
  expect(submitted.q1_score).toBe(1);
  expect(submitted.q12_score).toBe(1);
  expect(submitted.consent).toBe(true);
});

test('BRICK fails closed on an invalid API response', async ({ page }) => {
  await page.route(/\/brick$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'ok', id: 'test', score: 99, band: 'Ready' }),
  }));
  await page.goto('/readiness-check/form/');
  await completeBrick(page);
  await page.locator('#submit-btn').click();
  await expect(page.locator('#form-error')).toContainText('Something went wrong');
  await expect(page.locator('#submit-btn')).toBeEnabled();
  await expect(page.locator('#result-section')).toBeHidden();
});
