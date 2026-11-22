const { chromium, request } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const baseUrl = process.env.NEXO_E2E_URL || 'http://127.0.0.1:4000';
const screenshotDir = process.env.NEXO_E2E_SCREENSHOT_DIR || path.resolve('artifacts/e2e-ui');

async function expectOk(response, label) {
  if (!response.ok()) {
    throw new Error(label + ' failed (' + response.status() + '): ' + (await response.text()).slice(0, 1000));
  }
  return response.json();
}

async function loginPage(page, email, password) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('form').filter({ has: page.locator('input[type="email"]') }).locator('button[type="submit"]').click();
  await page.locator('.nexo-user-dock').waitFor({ state: 'visible', timeout: 30000 });
}

async function openDm(page, otherName) {
  const row = page.locator('.sidebar-row').filter({ hasText: otherName }).first();
  await row.waitFor({ state: 'visible', timeout: 20000 });
  await row.click();
  await page.locator('.chat-header').waitFor({ state: 'visible', timeout: 15000 });
}

(async () => {
  fs.mkdirSync(screenshotDir, { recursive: true });
  const suffix = Date.now().toString().slice(-9);
  const emailA = 'nexo-e2e-host-' + suffix + '@example.test';
  const emailB = 'nexo-e2e-guest-' + suffix + '@example.test';
  const passwordA = 'R8#tK5!mQ2@xP7$zV4';
  const passwordB = 'C7!qR4#zP9@tL2$wM8&x';
  const handleA = 'e2ehost' + suffix;
  const handleB = 'e2e' + suffix;
  const displayNameA = 'Nexo E2E Host';
  const displayNameB = 'Nexo E2E Guest';
  const apiA = await request.newContext({ baseURL: baseUrl });
  const apiB = await request.newContext({ baseURL: baseUrl });
  let browser;

  try {
    const registeredA = await expectOk(await apiA.post('/api/auth/register', {
      data: { email: emailA, password: passwordA, remember: true }
    }), 'First test account registration');
    const profileA = await expectOk(await apiA.post('/api/profile', {
      data: {
        displayName: displayNameA,
        username: handleA,
        bio: 'Temporary Playwright account',
        avatarColor: '#D97757',
        avatarPreset: 1
      }
    }), 'First test account profile setup');
    const userA = profileA.user || registeredA.user;

    const registeredB = await expectOk(await apiB.post('/api/auth/register', {
      data: { email: emailB, password: passwordB, remember: true }
    }), 'Second test account registration');
    const profileB = await expectOk(await apiB.post('/api/profile', {
      data: {
        displayName: displayNameB,
        username: handleB,
        bio: 'Temporary Playwright account',
        avatarColor: '#D97757',
        avatarPreset: 2
      }
    }), 'Second test account profile setup');
    const userB = profileB.user || registeredB.user;

    const friendRequest = await expectOk(await apiA.post('/api/friends/request', {
      data: { username: userB.username }
    }), 'Friend request');
    await expectOk(await apiB.post('/api/friends/respond', {
      data: { requestId: friendRequest.request.id, action: 'accept' }
    }), 'Friend request acceptance');

    await expectOk(await apiA.post('/api/conversations/dm', {
      data: { username: userB.username }
    }), 'Direct conversation creation');

    const serverResult = await expectOk(await apiA.post('/api/servers', {
      data: { name: 'E2E Space ' + suffix, description: 'Temporary Playwright voice-channel test space' }
    }), 'Test server creation');
    const server = serverResult.server;
    const channelResult = await expectOk(await apiA.post('/api/servers/' + server.id + '/channels', {
      data: { name: 'voice-lobby', type: 'voice', userLimit: 8 }
    }), 'Voice channel creation');
    const channelList = await expectOk(await apiA.get('/api/servers/' + server.id + '/channels'), 'Voice channel list');
    const voiceChannel = channelList.channels.find((channel) => channel.type === 'voice' && channel.name === 'voice-lobby');
    if (!voiceChannel) throw new Error('The created voice channel was not returned by the server.');
    const serverName = channelResult.server?.name || server.name;

    browser = await chromium.launch({
      headless: true,
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--disable-features=WebRtcHideLocalIpsWithMdns']
    });
    const contextA = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      permissions: ['microphone', 'camera']
    });
    const contextB = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      permissions: ['microphone', 'camera']
    });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    for (const [label, page] of [['A', pageA], ['B', pageB]]) {
      page.on('console', (message) => { if (message.type() === 'error' || message.text().includes('[call-ui]')) console.log('[page ' + label + ' console]', message.type(), message.text()); });
      page.on('pageerror', (error) => console.error('[page ' + label + ' error]', error.message));
    }

    await Promise.all([
      loginPage(pageA, emailA, passwordA),
      loginPage(pageB, emailB, passwordB)
    ]);
    const mediaCheck = await pageB.evaluate(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        return { ok: true };
      } catch (error) {
        return { ok: false, name: error.name, message: error.message };
      }
    });
    if (!mediaCheck.ok) throw new Error('Fake microphone is unavailable in Playwright: ' + JSON.stringify(mediaCheck));

    await Promise.all([
      openDm(pageA, userB.display_name || userB.username),
      openDm(pageB, userA.display_name || userA.username)
    ]);
    if (await pageA.locator('.sidebar-section-toggle small').filter({ hasText: '0' }).count()) {
      throw new Error('An empty sidebar section still displays a zero counter.');
    }

    await pageA.locator('.chat-header .chat-actions button').filter({ hasText: 'Голос' }).click();
    await pageB.locator('.incoming-call-card').waitFor({ state: 'visible', timeout: 20000 });
    await pageA.locator('.call-overlay').waitFor({ state: 'visible', timeout: 15000 });
    if (await pageA.locator('.call-banner-person.pending').count() < 1) {
      throw new Error('The caller did not show the remote participant as pending before acceptance.');
    }
    await pageB.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await pageB.screenshot({ path: path.join(screenshotDir, 'incoming-call-light-1440x900.png'), fullPage: false });
    await pageB.locator('.incoming-call-actions .call-accept').click();
    await pageB.locator('.call-overlay').waitFor({ state: 'visible', timeout: 15000 });
    await pageA.screenshot({ path: path.join(screenshotDir, 'call-after-accept-a.png'), fullPage: false });
    await pageB.screenshot({ path: path.join(screenshotDir, 'call-after-accept-b.png'), fullPage: false });
    await pageA.locator('.call-banner-person.connected').nth(1).waitFor({ state: 'visible', timeout: 30000 });
    await pageB.locator('.call-banner-person.connected').nth(1).waitFor({ state: 'visible', timeout: 30000 });
    if (await pageA.locator('.call-banner-controls .call-control-group').count() !== 2) {
      throw new Error('The connected call does not show both control groups.');
    }
    if (await pageA.locator('.call-banner-controls .call-hangup').count() !== 1) {
      throw new Error('The connected call does not show its separate hang-up control.');
    }
    await pageA.screenshot({ path: path.join(screenshotDir, 'call-connected-dark-1440x900.png'), fullPage: false });
    await pageA.locator('.call-hangup').click();
    await pageA.locator('.call-overlay').waitFor({ state: 'hidden', timeout: 15000 });
    await pageB.locator('.call-overlay').waitFor({ state: 'hidden', timeout: 15000 });
    await pageA.locator('.active-call-strip').waitFor({ state: 'hidden', timeout: 10000 });

    const serverHead = pageA.locator('.sidebar-server-head').filter({ hasText: serverName }).first();
    await serverHead.waitFor({ state: 'visible', timeout: 15000 });
    await serverHead.click();
    await pageA.locator('.voice-channel-row').filter({ hasText: 'voice-lobby' }).click();
    await pageA.locator('.active-voice-panel').waitFor({ state: 'visible', timeout: 20000 });
    await pageA.locator('.voice-room').waitFor({ state: 'visible', timeout: 20000 });
    if (await pageA.locator('.sidebar-voice-member').count() < 1) {
      throw new Error('The joined user is missing from the voice channel participant list.');
    }
    await pageA.screenshot({ path: path.join(screenshotDir, 'voice-channel-dark-1440x900.png'), fullPage: false });
    await pageA.locator('.voice-room-hangup').click();
    await pageA.locator('.active-voice-panel').waitFor({ state: 'hidden', timeout: 15000 });

    for (const height of [700, 768, 800, 900, 1080]) {
      for (const zoom of [1, 1.25, 1.5]) {
        await pageA.setViewportSize({ width: 1440, height });
        await pageA.evaluate((factor) => { document.body.style.zoom = String(factor); }, zoom);
        await pageA.waitForTimeout(100);
        const metrics = await pageA.evaluate(() => {
          const dock = document.querySelector('.sidebar-user-area');
          const card = document.querySelector('.nexo-user-dock');
          const actions = document.querySelectorAll('.nexo-user-dock .dock-actions > button');
          const zoomFactor = Number(document.body.style.zoom) || 1;
          return {
            bottom: (dock?.getBoundingClientRect().bottom ?? Infinity) / zoomFactor,
            height: card?.offsetHeight ?? 0,
            buttons: actions.length,
            viewport: window.innerHeight
          };
        });
        if (metrics.bottom > metrics.viewport + 1) throw new Error('Dock overflow at ' + height + 'px / ' + (zoom * 100) + '%: ' + JSON.stringify(metrics));
        if (metrics.buttons !== 3) throw new Error('Expected three dock actions: ' + JSON.stringify(metrics));
        if (Math.abs(metrics.height - 52) > 2) throw new Error('Unexpected dock height: ' + JSON.stringify(metrics));
      }
    }

    await pageA.evaluate(() => { document.body.style.zoom = '1'; });
    await pageA.locator('.dock-user').click();
    if (await pageA.locator('.dock-account-menu, .dock-menu-profile').count()) {
      throw new Error('Legacy account menu is still present.');
    }

    await pageA.locator('.nexo-user-dock button[aria-label="Настройки"]').click();
    await pageA.waitForTimeout(250);
    await pageA.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await pageA.screenshot({ path: path.join(screenshotDir, 'settings-light-1440x900.png'), fullPage: false });

    const unstyledFields = await pageA.locator('input:not(.nexo-input):not([type="hidden"]), select:not(.nexo-select), textarea:not(.nexo-textarea)').evaluateAll((nodes) =>
      nodes.filter((node) => node.getClientRects().length > 0)
        .map((node) => ({ tag: node.tagName, type: node.getAttribute('type'), className: node.className }))
    );
    if (unstyledFields.length) throw new Error('Found form controls outside the shared UI field styles: ' + JSON.stringify(unstyledFields));

    for (const theme of ['light', 'dark']) {
      await pageA.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      for (const height of [768, 900]) {
        await pageA.setViewportSize({ width: 1440, height });
        await pageA.waitForTimeout(120);
        await pageA.screenshot({
          path: path.join(screenshotDir, 'workspace-' + theme + '-1440x' + height + '.png'),
          fullPage: false
        });
      }
    }

    console.log('Two-account DM call, voice-channel join/leave, dock, form-control, and workspace screenshot checks passed. Screenshots: ' + screenshotDir);
    await contextA.close();
    await contextB.close();
  } finally {
    await browser?.close();
    await apiA.dispose();
    await apiB.dispose();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
