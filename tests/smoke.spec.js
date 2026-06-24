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
  await page.route('https://api.example.test/contact', async route => {
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
  await page.route('https://api.example.test/taster', route => route.fulfill({
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
  await page.route('https://api.example.test/brick', route => route.fulfill({
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
