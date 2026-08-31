import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import { chromium, test } from '@playwright/test';

import { releaseLaunchArgs } from './playwright.release.config';

const RUNNER_OWNER = 'scripts/release-canvas06-e2e-run.mjs';
const VIEWPORTS = Object.freeze({
  'VP-1440X900': Object.freeze({ width: 1440, height: 900 }),
  'VP-1280X800': Object.freeze({ width: 1280, height: 800 }),
  'VP-390X844': Object.freeze({ width: 390, height: 844 })
});

test('受控 Family E2E 只经 Runner session 执行', async () => {
  const ownerUrl = pathToFileURL(resolve(process.cwd(), RUNNER_OWNER)).href;
  const owner = await import(ownerUrl);
  const invocationContext = await owner.loadFamilyControlledInvocationContextFromEnvironment();
  const cycleHandler = Object.freeze(async ({
    cycle,
    origin,
    browser_executable_ref: browserExecutableRef,
    case_entry: caseEntry,
    observation_sink: observationSink,
    resolve_invocation: resolveInvocation
  }: any): Promise<undefined> => {
    const viewport = VIEWPORTS[caseEntry?.viewport_id as keyof typeof VIEWPORTS];
    if (!viewport || caseEntry?.zoom_id !== 'Z-100') throw new Error('Family cycle viewport/zoom不符合冻结Manifest。');
    if (cycle === 'INITIAL' && typeof resolveInvocation !== 'function' || cycle === 'REOPEN' && resolveInvocation !== null) {
      throw new Error('Family cycle resolver边界无效。');
    }

    const browser = await chromium.launch({ executablePath: browserExecutableRef.path, args: [...releaseLaunchArgs] });
    const browserContext = await browser.newContext({
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      colorScheme: 'light',
      reducedMotion: 'reduce',
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
      viewport
    });
    const page = await browserContext.newPage();
    let failure: unknown = null;
    try {
      observationSink.attachBrowserPage(page);
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.evaluate(async () => {
        if (document.readyState !== 'complete') await new Promise<void>(resolveReady => window.addEventListener('load', () => resolveReady(), { once: true }));
        await document.fonts.ready;
        await new Promise<void>(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame())));
      });
      if (cycle === 'INITIAL') {
        const invocation = await resolveInvocation(page);
        const result = await invocation.execute_case(invocation.call_context);
        if (result !== undefined) throw new Error('Family Driver必须返回undefined。');
      } else {
        await observationSink.verifyReopen();
      }
    } catch (error) {
      failure = error;
    } finally {
      for (const close of [() => page.close(), () => browserContext.close(), () => browser.close()]) {
        try { await close(); } catch (error) { failure ??= error; }
      }
      try {
        await observationSink.confirmBrowserClosed({ browser, context: browserContext, page });
      } catch (error) {
        failure ??= error;
      }
    }
    if (failure) throw failure;
    return undefined;
  });

  await owner.runFamilyControlledInvocationSession({ invocation_context: invocationContext, cycle_handler: cycleHandler });
});
