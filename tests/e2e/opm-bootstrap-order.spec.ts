import { expect, test } from '@playwright/test';

const BOOTSTRAP = 'window.__OPM_LOCAL_SESSION__ = "session-test-value";window.__OPM_ACTIVE_PROFILE_BINDING__ = {profile_id: "profile.iso19450.2024.draft", profile_version: "0.2.0", rule_set_id: "rules.iso19450.2024.draft", rule_version: "0.1.0"};';

test('Bootstrap 响应完成前应用不挂载，执行后才进入 Vue 入口', async ({ page }) => {
  let releaseBootstrap: (() => void) | undefined;
  let markBootstrapRequested: (() => void) | undefined;
  const bootstrapRequested = new Promise<void>(resolve => {
    markBootstrapRequested = resolve;
  });
  await page.route('**/opm-bootstrap.js', async route => {
    markBootstrapRequested?.();
    await new Promise<void>(resolve => { releaseBootstrap = resolve; });
    await route.fulfill({ contentType: 'application/javascript', body: BOOTSTRAP });
  });

  const navigation = page.goto('/projects', { waitUntil: 'domcontentloaded' });
  await bootstrapRequested;
  await expect.poll(() => page.locator('#app').evaluate(element => element.childElementCount)).toBe(0);

  releaseBootstrap?.();
  await navigation;
  await expect(page.getByTestId('p01-project-library')).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    session: typeof window.__OPM_LOCAL_SESSION__,
    keys: Object.keys(window.__OPM_ACTIVE_PROFILE_BINDING__ ?? {})
  }))).toEqual({ session: 'string', keys: ['profile_id', 'profile_version', 'rule_set_id', 'rule_version'] });
});
