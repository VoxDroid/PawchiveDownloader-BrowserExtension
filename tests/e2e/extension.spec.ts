import {
  CREATOR_URL,
  expect,
  KEMONO_POST_URL,
  POST_URL,
  recordedDownloads,
  test,
} from './fixtures';

test.describe('in-page panel', () => {
  test("lists a post's files and downloads the selection", async ({ context, worker }) => {
    const page = await context.newPage();
    await page.goto(POST_URL);
    const ui = page.locator('pawchive-downloader');
    const fab = ui.locator('button.fab');
    await expect(fab).toBeVisible();
    await fab.click();

    const panel = ui.getByRole('complementary', { name: 'Pawchive Downloader' });
    await expect(
      panel.getByText('[RE4R] EARLY ACCESS: Neverness to Everness - Elyms'),
    ).toBeVisible();
    await expect(panel.locator('.tile')).toHaveCount(5);
    await expect(panel.getByText('5 of 5 selected')).toBeVisible();

    // Keep only the archive.
    await panel.getByRole('button', { name: 'Archives 1' }).click();
    await expect(panel.locator('.tile')).toHaveCount(1);
    await panel.getByRole('button', { name: 'Invert selection' }).click();
    await panel.getByRole('checkbox', { name: /Save post text/ }).click();
    await panel.locator('.tile').first().click();
    await panel.getByRole('button', { name: 'Download 1 file' }).click();
    await expect(ui.getByText('Added 1 file to the queue')).toBeVisible();

    await expect.poll(async () => (await recordedDownloads(worker)).length).toBe(1);
    const [download] = await recordedDownloads(worker);
    expect(download!.url).toMatch(/^https:\/\/n4\.pawchive\.pw\/data\/280\/57\//);
    expect(download!.filename).toBe(
      'Pawchive/Histy (patreon)/2026-11-17 [RE4R] EARLY ACCESS_ Neverness to Everness - Elyms [175580645]/04_Neverness to Everness - Elyms.rar',
    );
  });

  test('tooltips in the panel are not cut off by it', async ({ context }) => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1100, height: 760 });
    await page.goto(POST_URL);
    const ui = page.locator('pawchive-downloader');
    await ui.locator('button.fab').click();
    const panel = ui.getByRole('complementary', { name: 'Pawchive Downloader' });
    await expect(panel.locator('.tile')).toHaveCount(5);
    // The rightmost button with a tooltip, against the window's edge.
    const anchors = panel.locator('[data-tip]');
    let anchor = anchors.first();
    let right = -1;
    for (let i = 0; i < (await anchors.count()); i++) {
      const b = await anchors.nth(i).boundingBox();
      if (b && b.x + b.width > right) {
        right = b.x + b.width;
        anchor = anchors.nth(i);
      }
    }
    await anchor.hover();
    const tip = ui.locator('.tooltip.visible');
    await expect(tip).toHaveText((await anchor.getAttribute('data-tip')) ?? '');
    const box = (await tip.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(1100);
    expect(box.x).toBeGreaterThanOrEqual(0);
    // Floats outside the panel's scroll area rather than inside it.
    const style = await tip.evaluate((el) => getComputedStyle(el).position);
    expect(style).toBe('fixed');
  });

  test('selects posts on a creator page and loads the post list', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(CREATOR_URL);
    const ui = page.locator('pawchive-downloader');
    await ui.locator('button.fab').click();
    const panel = ui.getByRole('complementary', { name: 'Pawchive Downloader' });
    await expect(panel.getByRole('heading', { name: 'Histy' })).toBeVisible();

    // Selection boxes on the site's own cards.
    await panel.getByRole('switch', { name: 'Select posts on the page' }).click();
    await page.locator('article.post-card').nth(0).click();
    await page
      .locator('article.post-card')
      .nth(2)
      .click({ modifiers: ['Shift'] });
    await expect(panel.getByText('3 selected')).toBeVisible();
    await expect(page.locator('article.post-card.pdl-selected')).toHaveCount(3);

    await panel.getByRole('button', { name: 'Load posts' }).click();
    await expect(panel.getByText('2 of 2 posts selected, 10 files')).toBeVisible();
    await panel.getByRole('button', { name: 'Filters' }).click();
    await panel.getByRole('checkbox', { name: 'Only posts with files' }).click();
    await expect(panel.getByText('2 of 3 posts selected, 10 files')).toBeVisible();
  });
});

test.describe('extension pages', () => {
  test('dashboard navigation and live language switching', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html#settings`);
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();

    await page.getByRole('combobox', { name: 'Language' }).selectOption('de');
    await expect(page.getByRole('heading', { name: 'Einstellungen', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'Verlauf' }).click();
    await expect(page.getByRole('heading', { name: 'Verlauf', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'Einstellungen' }).click();
    await page.getByRole('combobox', { name: 'Sprache' }).selectOption('en');
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  });

  test('theme choice applies to the page', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html#settings`);
    await page.getByRole('button', { name: 'Light' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('tooltips float above everything and stay inside the window', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto(`chrome-extension://${extensionId}/options.html#settings`);
    const anchor = page.locator('[data-tip]').first();
    await anchor.hover();
    const tip = page.locator('.tooltip.visible');
    await expect(tip).toHaveText((await anchor.getAttribute('data-tip')) ?? '');
    const box = (await tip.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(900);
  });

  test('popup shows the empty state off site', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(page.getByText('Pawchive Downloader').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Downloads' })).toBeVisible();
  });
});

test.describe('Kemono', () => {
  test('works on Kemono with its links tab, and saves into the Kemono folder', async ({
    context,
    worker,
  }) => {
    const page = await context.newPage();
    await page.goto(KEMONO_POST_URL);
    const ui = page.locator('pawchive-downloader');
    await ui.locator('button.fab').click();
    const panel = ui.getByRole('complementary', { name: 'Pawchive Downloader' });
    await expect(panel.getByText('Kemono set')).toBeVisible();
    // The service and the site are shown separately.
    await expect(panel.getByText(/fanbox\s*\/\s*Kemono/)).toBeVisible();

    // Outside links and passwords have their own tab.
    await panel.getByRole('radio', { name: /1 link/ }).click();
    await expect(panel.getByText('https://mega.nz/folder/abc#key')).toBeVisible();
    await expect(panel.getByText('cat123')).toBeVisible();
    await panel.getByRole('radio', { name: /\d+ files/ }).click();

    await panel.getByRole('button', { name: 'Archives 1' }).click();
    await panel.getByRole('button', { name: 'Invert selection' }).click();
    await panel.locator('.tile').first().click();
    await panel.getByRole('button', { name: 'Download 1 file' }).click();
    // The media server answers in this mock; if the check ever times out
    // offline, queue the full files anyway.
    const dialog = ui.getByRole('dialog');
    const queued = ui.getByText(/Added 1 file to the queue/);
    await expect(dialog.or(queued)).toBeVisible({ timeout: 15_000 });
    if (await dialog.isVisible())
      await dialog.getByRole('button', { name: /Queue the full files/ }).click();

    await expect
      .poll(async () => (await recordedDownloads(worker)).map((d) => d.filename).join('\n'))
      .toContain('Kemono/Kemo (fanbox)/');
    const downloads = await recordedDownloads(worker);
    const file = downloads.find((d) => d.filename.endsWith('.rar'));
    expect(file?.url).toMatch(/^https:\/\/kemono\.cr\/data\//);
    // links.txt is saved next to it.
    expect(downloads.some((d) => d.filename.endsWith('/links.txt'))).toBe(true);
  });
});
