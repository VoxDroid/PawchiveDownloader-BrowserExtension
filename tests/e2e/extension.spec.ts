import { CREATOR_URL, expect, POST_URL, recordedDownloads, test } from './fixtures';

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

  test('popup shows the empty state off site', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(page.getByText('Pawchive Downloader').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Downloads' })).toBeVisible();
  });
});
