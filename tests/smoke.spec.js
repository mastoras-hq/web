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

test('protected surfaces are not browser cacheable', async ({ request }) => {
  for (const path of ['/advisor/', '/hq/', '/login/', '/auth/callback/']) {
    const response = await request.get(path);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['cache-control']).toBe('no-store');
    expect(response.headers()['pragma']).toBe('no-cache');
    expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow');
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

test('protected surfaces use internal Workspace navigation, not marketing navigation', async ({ request }) => {
  const advisor = await (await request.get('/advisor/')).text();
  expect(advisor).toContain('Mástoras Workspace');
  expect(advisor).toContain('Funding Desk');
  expect(advisor).toContain('href="/hq/"');
  expect(advisor).toContain('href="#admin-section"');
  expect(advisor).not.toContain('mastoras.uk/#services');
  expect(advisor).not.toContain('mastoras.uk/#about');
  expect(advisor).not.toContain('calendly.com');

  const hq = await (await request.get('/hq/')).text();
  expect(hq).toContain('Mástoras Workspace');
  expect(hq).toContain('href="/advisor/"');
  expect(hq).toContain('data-action="sign-out"');
});

test('legacy public pages use the shared external analytics bootstrap', async ({ request }) => {
  for (const path of [
    '/tools/',
    '/readiness-check/',
    '/blog/grant-writing-northern-ireland.html',
    '/blog/launch-package-case-study.html',
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
  let downloadRequests = 0;
  let deleteRequests = 0;
  await page.addInitScript(() => {
    window.confirm = () => true;
    window.open = url => { window.__openedDocumentUrl = url; };
  });
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
        reports: [], brick: [], calls: [], documents: [{
          id: 'doc-1',
          filename: 'Evidence.pdf',
          kind: 'uploaded',
          size_bytes: 2048,
          content_type: 'application/pdf',
          created_at: '2026-07-01T09:05:00Z',
        }],
        stats: { report_count: 0, applied: 0, approved: 0, value_awarded: 0 },
      }),
    });
  });
  await page.route(/\/documents\/doc-1\/download$/, async route => {
    downloadRequests += 1;
    await new Promise(resolve => setTimeout(resolve, 250));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'https://documents.example/doc-1' }),
    });
  });
  await page.route(/\/documents\/doc-1$/, async route => {
    if (route.request().method() !== 'DELETE') {
      return route.fulfill({ status: 405, contentType: 'application/json', body: '{}' });
    }
    deleteRequests += 1;
    await new Promise(resolve => setTimeout(resolve, 250));
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/hq/');
  await expect(page.locator('#clients-tbody')).toContainText('Test Founder');
  await page.locator('[data-action="open-client"][data-client-id="client-1"]').click();
  await expect(page.locator('#profile-content h2')).toHaveText('Test Founder');

  const downloadButton = page.locator('[data-action="download-document"][data-document-id="doc-1"]');
  await downloadButton.click();
  await downloadButton.evaluate(button => button.click());
  await expect(downloadButton).toBeDisabled();
  await expect.poll(() => downloadRequests).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__openedDocumentUrl)).toBe('https://documents.example/doc-1');
  await expect(downloadButton).toBeEnabled();

  const deleteButton = page.locator('[data-action="delete-document"][data-document-id="doc-1"]');
  await deleteButton.click();
  await deleteButton.evaluate(button => button.click());
  await expect(deleteButton).toBeDisabled();
  await expect.poll(() => deleteRequests).toBe(1);
  await expect(deleteButton).toBeEnabled();

  await page.locator('#client-notes').fill('Follow up next week');
  await page.locator('#client-notes').blur();
  await expect.poll(() => patches.some(body => body.notes === 'Follow up next week')).toBe(true);
  await expect(page.locator('#notes-ind')).toContainText('Saved');
});

test('HQ exposes privacy controls only to the owner and keeps erasure fail-safe', async ({ page }) => {
  let staffRequests = 0;
  let previewRequests = 0;
  let exportRequests = 0;
  let eraseRequests = 0;
  await page.addInitScript(() => {
    window.confirm = () => true;
    window.prompt = () => 'WRONG PHRASE';
    URL.createObjectURL = () => 'blob:test-export';
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function () {
      window.__privacyDownload = this.download;
    };
  });
  await page.route('**/assets/js/auth-bootstrap.js', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: 'window.mastorasAuth={requireSession:()=>Promise.resolve({access_token:"test"}),signOut:()=>{}};',
  }));
  await page.route(/\/staff\/me$/, route => {
    staffRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user_id: 'owner-1', role: 'owner_admin' }),
    });
  });
  await page.route(/\/clients$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{
      id: 'client-1', name: 'Privacy Test', source: 'test', status: 'Lead',
      report_count: 0, brick_score: null, last_activity: '2026-07-01T09:00:00Z',
    }]),
  }));
  await page.route(/\/clients\/client-1$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      client: {
        id: 'client-1', name: 'Privacy Test', source: 'test', status: 'Lead',
        notes: '', created_at: '2026-07-01T09:00:00Z',
      },
      reports: [], brick: [], calls: [], documents: [],
      stats: { report_count: 0, applied: 0, approved: 0, value_awarded: 0 },
    }),
  }));
  await page.route(/\/clients\/client-1\/privacy-preview$/, async route => {
    previewRequests += 1;
    await new Promise(resolve => setTimeout(resolve, 250));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        legal_hold: false,
        counts: {
          reports: 1, applications: 2, enquiries: 0,
          brick_submissions: 0, calls: 1, documents: 1,
        },
      }),
    });
  });
  await page.route(/\/clients\/client-1\/export$/, route => {
    exportRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ request_id: 'request-1', documents: [] }),
    });
  });
  await page.route(/\/clients\/client-1\/erase$/, route => {
    eraseRequests += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/hq/');
  await expect.poll(() => staffRequests).toBe(1);
  await expect.poll(() => page.evaluate(() => window.state && window.state.staff)).toEqual({
    user_id: 'owner-1',
    role: 'owner_admin',
  });
  await page.locator('[data-action="open-client"][data-client-id="client-1"]').click();
  await expect(page.locator('.privacy-panel')).toBeVisible();
  await page.locator('[data-action="privacy-preview"]').click();
  await expect(page.locator('#privacy-status')).toContainText('1 reports, 2 applications');

  await page.locator('[data-action="privacy-export"]').click();
  await page.locator('[data-action="privacy-export"]').evaluate(button => button.click());
  await expect(page.locator('[data-action="privacy-export"]')).toBeDisabled();
  await expect.poll(() => exportRequests).toBe(1);
  expect(previewRequests).toBe(2);
  await expect(page.locator('#privacy-status')).toContainText('Export created');
  await expect.poll(() => page.evaluate(() => window.__privacyDownload)).toContain(
    'mastoras-client-export-client-1.json',
  );

  await page.locator('[data-action="privacy-erase"]').click();
  await expect(page.locator('#privacy-status')).toContainText('Nothing was deleted');
  expect(eraseRequests).toBe(0);
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
  let candidateActions = 0;
  let proposalActions = 0;
  let flagActions = 0;
  await page.addInitScript(() => {
    window.prompt = () => 'Reviewed';
  });
  await page.route('**/assets/js/auth-bootstrap.js', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: 'window.mastorasAuth={requireSession:()=>Promise.resolve({access_token:"test"}),signOut:()=>{}};',
  }));
  await page.route(/\/(?:admin\/.*|updates(?:\?.*)?|reports(?:\?.*)?)$/, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/admin/candidates/action') {
      candidateActions += 1;
      await new Promise(resolve => setTimeout(resolve, 250));
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    if (url.pathname === '/admin/proposals/action') {
      proposalActions += 1;
      await new Promise(resolve => setTimeout(resolve, 250));
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    if (url.pathname === '/admin/flags/action') {
      flagActions += 1;
      await new Promise(resolve => setTimeout(resolve, 250));
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    if (url.pathname === '/admin/candidates') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'cand-1',
          fund_name: 'Candidate Fund',
          provider: 'Provider',
          source_url: 'https://example.com/candidate',
          confidence: 0.9,
          evidence: {},
        }]),
      });
    }
    if (url.pathname === '/admin/proposals') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'prop-1',
          fund_id: 'fund-1',
          fund_name: 'Proposal Fund',
          fund_provider: 'Provider',
          source_url: 'https://example.com/proposal',
          diff: { grant_size: { old: '£1,000', new: '£2,000' } },
          flags: {},
          evidence: {},
        }]),
      });
    }
    if (url.pathname === '/admin/flags') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          fund_id: 'fund-flag',
          fund_name: 'Flagged Fund',
          change_type: 'link_dead',
          source_url: 'https://example.com/dead',
        }]),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    });
  });

  await page.goto('/advisor/');
  await expect(page.locator('#admin-section')).toBeVisible();
  await expect(page.locator('#candidates-list')).toContainText('Candidate Fund');
  await expect(page.locator('#proposals-list')).toContainText('Proposal Fund');
  await expect(page.locator('#flags-list')).toContainText('Flagged Fund');
  await expect(page.locator('#runs-list')).toContainText('No runs recorded');

  const candidateButton = page.locator('[data-action="approve-candidate"][data-candidate-id="cand-1"]');
  await candidateButton.click();
  await candidateButton.evaluate(button => button.click());
  await expect(candidateButton).toBeDisabled();
  await expect(candidateButton).toHaveAttribute('aria-busy', 'true');
  await expect.poll(() => candidateActions).toBe(1);
  await expect(candidateButton).toBeEnabled();

  const proposalButton = page.locator('[data-action="apply-proposal"][data-proposal-id="prop-1"]');
  await proposalButton.click();
  await proposalButton.evaluate(button => button.click());
  await expect(proposalButton).toBeDisabled();
  await expect(proposalButton).toHaveAttribute('aria-busy', 'true');
  await expect.poll(() => proposalActions).toBe(1);
  await expect(proposalButton).toBeEnabled();

  const flagButton = page.locator('[data-action="resolve-flag"][data-fund-id="fund-flag"][data-resolution="dismiss"]');
  await flagButton.click();
  await flagButton.evaluate(button => button.click());
  await expect(flagButton).toBeDisabled();
  await expect(flagButton).toHaveAttribute('aria-busy', 'true');
  await expect.poll(() => flagActions).toBe(1);
  await expect(flagButton).toBeEnabled();
});

test('Advisor CRM records outcomes and founder validation evidence', async ({ page }) => {
  const patches = [];
  const pilotSaves = [];
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
  await page.route(/\/pilot\/summary$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      participants_completed: 5,
      participants_useful: 4,
      repeat_use_requests: 3,
      willingness_to_pay_count: 2,
      standalone_pilot_ready: true,
      criteria: {
        five_participants_completed: true,
        most_rate_useful: true,
        three_repeat_requests: true,
        two_willing_to_pay: true,
      },
    }),
  }));
  await page.route(/\/reports\/report-1\/pilot-feedback$/, async route => {
    pilotSaves.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(route.request().postDataJSON()),
    });
  });
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
          pilot_feedback: null,
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
  await expect(page.locator('#pilot-summary')).toBeVisible();
  await expect(page.locator('#pilot-useful')).toHaveText('4/5');
  await expect(page.locator('#pilot-summary-status')).toContainText('standalone software pilot');
  await page.locator('[data-action="toggle-detail"][data-report-id="report-1"]').first().click();
  await expect(page.locator('#notes-report-1')).toBeVisible();
  await page.locator('#notes-report-1').fill('Awaiting funder response');
  await page.locator('#notes-report-1').blur();
  await expect.poll(() => patches.some(body => body.client_notes === 'Awaiting funder response')).toBe(true);
  await expect(page.locator('#notes-ind-report-1')).toContainText('Saved');
  await page.locator('#pilot-usefulness-report-1').selectOption('5');
  await page.locator('#pilot-repeat-report-1').selectOption('true');
  await page.locator('#pilot-pay-report-1').selectOption('false');
  await page.locator('#pilot-value-report-1').selectOption('both');
  await page.locator('#pilot-minutes-report-1').fill('45');
  await page.locator('#pilot-retained-report-1').fill('4');
  await page.locator('#pilot-removed-report-1').fill('1');
  await page.locator('#pilot-annotated-report-1').fill('2');
  await page.locator('#pilot-notes-report-1').fill('Founder interpretation clarified the shortlist.');
  await page.locator('[data-action="save-pilot-feedback"]').click();
  await expect.poll(() => pilotSaves.length).toBe(1);
  expect(pilotSaves[0]).toEqual({
    usefulness_rating: 5,
    repeat_use_requested: true,
    willingness_to_pay: false,
    value_source: 'both',
    report_preparation_minutes: 45,
    matches_retained: 4,
    matches_removed: 1,
    matches_annotated: 2,
    notes: 'Founder interpretation clarified the shortlist.',
  });
  await expect(page.locator('#pilot-status-report-1')).toContainText('Saved');
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
        matches: [{
          fund_id: 'fund-new',
          fund_name: 'Bounded Score Fund',
          provider: 'Test Provider',
          status: 'open',
          eligibility_status: 'eligible',
          match_score: 150,
          score_coverage: 125,
          match_confidence: 3,
          why_it_fits: ['Relevant sector'],
          risks: [],
          missing_information: [],
        }],
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

  await expect(page.locator('#results-heading')).toContainText('Found 1 matching scheme');
  await expect(page.locator('.match-card')).toContainText('Bounded Score Fund');
  await expect(page.locator('.match-score')).toContainText('100/100');
  await expect(page.locator('.match-card')).toContainText('100/100 profile coverage · confidence 100%');
  await expect(page.locator('.score-bar-fill')).toHaveAttribute('style', /width:\s*100%/);
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
