import { expect, test } from '@playwright/test';

import { controlledAttemptEnvironmentKey } from './playwright.release.config';

test('受控 Common 浏览器入口只接受 Runner 注入的 loopback attempt origin', async ({ page }) => {
  const origin = process.env[controlledAttemptEnvironmentKey];
  expect(origin, `${controlledAttemptEnvironmentKey} 必须由受控 Runner 注入`).toMatch(/^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}$/);
  await page.goto(origin!, { waitUntil: 'domcontentloaded' });
  expect(new URL(page.url()).origin).toBe(origin);
});
