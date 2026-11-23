import { expect, type Page } from '@playwright/test';

export async function layoutGeometry(page: Page) {
  return page.locator('[data-testid="p03-canvas"] .x6-node').evaluateAll(nodes => nodes.map(node => {
    const body = node.querySelector<SVGGraphicsElement>('[data-opm-capture-cell-id]');
    return { id: node.getAttribute('data-cell-id'), transform: node.getAttribute('transform'),
      width: body?.getAttribute('width'), height: body?.getAttribute('height') };
  }));
}

/** Local layout changes geometry/history, not the server edit sequence. */
export async function localLayout(page: Page, action: () => Promise<unknown>) {
  const before = await layoutGeometry(page), identity = await page.getByTestId('hs-draft-identity').innerText();
  const preview = await page.getByTestId('opd-auto-preview').isVisible();
  let commands = 0;
  const listener = (request: import('@playwright/test').Request) => { if (request.method() === 'POST' && request.url().endsWith('/draft/commands')) commands++; };
  page.on('request', listener);
  try {
    await action();
    if (preview) {
      await expect(page.getByTestId('opd-auto-preview')).not.toBeVisible();
      expect(await layoutGeometry(page)).toEqual(before);
      await expect(page.getByTestId('opd-undo-layout')).toBeEnabled();
    } else await expect.poll(() => layoutGeometry(page)).not.toEqual(before);
    await expect(page.getByTestId('hs-draft-identity')).toHaveText(identity);
    expect(commands).toBe(0);
  } finally { page.off('request', listener); }
}