const { chromium, request } = require('playwright');
const Database = require('better-sqlite3');
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
  const emailC = 'nexo-e2e-third-' + suffix + '@example.test';
  const passwordA = 'R8#tK5!mQ2@xP7$zV4';
  const passwordB = 'C7!qR4#zP9@tL2$wM8&x';
  const passwordC = 'H6@pN3!sW8#yK4$uQ1';
  const handleA = 'e2ehost' + suffix;
  const handleB = 'e2e' + suffix;
  const handleC = 'e2ethird' + suffix;
  const displayNameA = 'Nexo E2E Host';
  const displayNameB = 'Nexo E2E Guest';
  const displayNameC = 'Nexo E2E Third';
  const apiA = await request.newContext({ baseURL: baseUrl });
  const apiB = await request.newContext({ baseURL: baseUrl });
  const apiC = await request.newContext({ baseURL: baseUrl });
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

    const registeredC = await expectOk(await apiC.post('/api/auth/register', {
      data: { email: emailC, password: passwordC, remember: true }
    }), 'Third test account registration');
    const profileC = await expectOk(await apiC.post('/api/profile', {
      data: {
        displayName: displayNameC,
        username: handleC,
        bio: 'Temporary Playwright group-call account',
        avatarColor: '#D97757',
        avatarPreset: 3
      }
    }), 'Third test account profile setup');
    const userC = profileC.user || registeredC.user;

    const friendRequest = await expectOk(await apiA.post('/api/friends/request', {
      data: { username: userB.username }
    }), 'Friend request');
    await expectOk(await apiB.post('/api/friends/respond', {
      data: { requestId: friendRequest.request.id, action: 'accept' }
    }), 'Friend request acceptance');

    await expectOk(await apiA.post('/api/conversations/dm', {
      data: { username: userB.username }
    }), 'Direct conversation creation');

    if (!process.env.DB_PATH) throw new Error('DB_PATH is required to seed a temporary group conversation.');
    const groupTitle = 'E2E Group ' + suffix;
    const db = new Database(process.env.DB_PATH);
    db.pragma('busy_timeout = 5000');
    const groupConversationId = db.transaction(() => {
      const inserted = db.prepare("INSERT INTO conversations (type, title) VALUES ('group', ?)").run(groupTitle);
      const conversationId = Number(inserted.lastInsertRowid);
      const insertParticipant = db.prepare('INSERT INTO conversation_participants (conversation_id, user_id, role) VALUES (?, ?, ?)');
      [userA, userB, userC].forEach((participant) => insertParticipant.run(conversationId, Number(participant.id), 'member'));
      return conversationId;
    })();
    db.close();

    const serverResult = await expectOk(await apiA.post('/api/servers', {
      data: { name: 'E2E Space ' + suffix, description: 'Temporary Playwright voice-channel test space' }
    }), 'Test server creation');
    const server = serverResult.server;
    const channelResult = await expectOk(await apiA.post('/api/servers/' + server.id + '/channels', {
      data: { name: 'voice-lobby', type: 'voice', userLimit: 8 }
    }), 'Voice channel creation');
    await expectOk(await apiA.post('/api/servers/' + server.id + '/channels', { data: { name: 'e2e-chat', type: 'text', topic: 'Temporary channel settings test' } }), 'Text channel creation');
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
    const contextC = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      permissions: ['microphone', 'camera']
    });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const pageC = await contextC.newPage();
    for (const [label, page] of [['A', pageA], ['B', pageB], ['C', pageC]]) {
      page.on('console', (message) => { if (message.type() === 'error') console.error('[page ' + label + ' console]', message.text()); });
      page.on('pageerror', (error) => console.error('[page ' + label + ' error]', error.message));
    }

    await Promise.all([
      loginPage(pageA, emailA, passwordA),
      loginPage(pageB, emailB, passwordB),
      loginPage(pageC, emailC, passwordC)
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
    await pageA.locator('.call-overlay button[aria-label="Развернуть звонок"]').click();
    await pageA.waitForFunction(() => Boolean(document.fullscreenElement), null, { timeout: 5000 });
    await pageA.screenshot({ path: path.join(screenshotDir, 'call-fullscreen-dark-1440x900.png'), fullPage: false });
    await pageA.locator('.call-overlay button[aria-label="Свернуть звонок"]').click();
    await pageA.waitForFunction(() => !document.fullscreenElement, null, { timeout: 5000 });
    await pageA.locator('.call-overlay button[aria-label="Свернуть панель звонка"]').click();
    await pageA.locator('.call-overlay.collapsed').waitFor({ state: 'visible', timeout: 5000 });
    await pageA.screenshot({ path: path.join(screenshotDir, 'call-collapsed-dark-1440x900.png'), fullPage: false });
    await pageA.locator('.call-overlay button').filter({ hasText: 'Развернуть' }).click();
    await pageA.locator('.call-overlay.collapsed').waitFor({ state: 'hidden', timeout: 5000 });
    await pageA.locator('.call-hangup').click();
    await pageA.locator('.call-overlay').waitFor({ state: 'hidden', timeout: 15000 });
    await pageB.locator('.call-overlay').waitFor({ state: 'hidden', timeout: 15000 });
    await pageA.locator('.active-call-strip').waitFor({ state: 'hidden', timeout: 10000 });

    await Promise.all([
      openDm(pageA, groupTitle),
      openDm(pageB, groupTitle),
      openDm(pageC, groupTitle)
    ]);
    await pageA.locator('.chat-header .chat-actions button').filter({ hasText: 'Голос' }).click();
    await Promise.all([
      pageB.locator('.incoming-call-card').waitFor({ state: 'visible', timeout: 20000 }),
      pageC.locator('.incoming-call-card').waitFor({ state: 'visible', timeout: 20000 })
    ]);
    await Promise.all([
      pageB.locator('.incoming-call-actions .call-accept').click(),
      pageC.locator('.incoming-call-actions .call-accept').click()
    ]);
    await Promise.all([
      pageA.locator('.call-overlay').waitFor({ state: 'visible', timeout: 15000 }),
      pageB.locator('.call-overlay').waitFor({ state: 'visible', timeout: 15000 }),
      pageC.locator('.call-overlay').waitFor({ state: 'visible', timeout: 15000 })
    ]);
    for (const page of [pageA, pageB, pageC]) {
      await page.waitForFunction(() => document.querySelectorAll('.call-banner-person.connected').length >= 2, null, { timeout: 30000 });
    }
    await pageA.screenshot({ path: path.join(screenshotDir, 'group-call-three-participants-dark-1440x900.png'), fullPage: false });
    await pageA.locator('.call-hangup').click();
    await Promise.all([
      pageA.locator('.call-overlay').waitFor({ state: 'hidden', timeout: 15000 }),
      pageB.locator('.call-overlay').waitFor({ state: 'hidden', timeout: 15000 }),
      pageC.locator('.call-overlay').waitFor({ state: 'hidden', timeout: 15000 })
    ]);
    await pageA.locator('.active-call-strip').waitFor({ state: 'hidden', timeout: 10000 });

    const serverHead = pageA.locator('.sidebar-server-head').filter({ hasText: serverName }).first();
    await serverHead.waitFor({ state: 'visible', timeout: 15000 });
    await pageA.locator('.sidebar-section').filter({ hasText: 'Пространства' }).locator('button[aria-label="Создать пространство"]').click();
    const createSpaceModal = pageA.locator('.modal-panel').filter({ hasText: 'Новое пространство' });
    await createSpaceModal.waitFor({ state: 'visible' });
    await pageA.screenshot({ path: path.join(screenshotDir, 'create-space-light-1440x900.png'), fullPage: false });
    await createSpaceModal.locator('button[aria-label="Закрыть"]').click();
    await serverHead.click();
    await serverHead.click({ button: 'right' });
    await pageA.locator('.nexo-context-menu').getByRole('button', { name: 'Создать канал' }).click();
    const createChannelModal = pageA.locator('.modal-panel').filter({ hasText: 'Создать канал' });
    await createChannelModal.waitFor({ state: 'visible' });
    await pageA.screenshot({ path: path.join(screenshotDir, 'create-channel-light-1440x900.png'), fullPage: false });
    await createChannelModal.locator('button[aria-label="Закрыть"]').click();
    await pageA.locator('.sidebar-row.channel-row').filter({ hasText: 'e2e-chat' }).click({ button: 'right' });
    await pageA.locator('.nexo-context-menu').getByRole('button', { name: 'Настройки канала' }).click();
    const channelSettingsModal = pageA.locator('.modal-panel').filter({ hasText: 'Настройки канала' });
    await channelSettingsModal.waitFor({ state: 'visible' });
    await pageA.screenshot({ path: path.join(screenshotDir, 'channel-settings-light-1440x900.png'), fullPage: false });
    await channelSettingsModal.locator('button[aria-label="Закрыть"]').click();
    await pageA.locator('.voice-channel-row').filter({ hasText: 'voice-lobby' }).click();
    await pageA.locator('.active-voice-panel').waitFor({ state: 'visible', timeout: 20000 });
    await pageA.locator('.voice-room').waitFor({ state: 'visible', timeout: 20000 });
    if (await pageA.locator('.sidebar-voice-member').count() < 1) {
      throw new Error('The joined user is missing from the voice channel participant list.');
    }
    await pageA.screenshot({ path: path.join(screenshotDir, 'voice-channel-dark-1440x900.png'), fullPage: false });
    await pageA.locator('.active-voice-panel button[data-tooltip="Камера"]').click();
    await pageA.locator('.voice-room video').first().waitFor({ state: 'visible', timeout: 15000 });
    await pageA.screenshot({ path: path.join(screenshotDir, 'voice-channel-camera-dark-1440x900.png'), fullPage: false });
    await pageA.locator('.active-voice-panel button[data-tooltip="Камера"]').click();
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
    await pageA.locator('.settings-shell').waitFor({ state: 'visible', timeout: 15000 });
    const settingsPages = [
      ['account', 'Моя учётная запись'],
      ['profile', 'Профиль'],
      ['appearance', 'Оформление'],
      ['voice', 'Голос и видео'],
      ['hotkeys', 'Горячие клавиши'],
      ['notifications', 'Уведомления и звуки'],
      ['accessibility', 'Специальные возможности'],
      ['premium', 'Nexo Pulse'],
      ['servers', 'Серверы'],
      ['updates', 'Обновления']
    ];
    for (const theme of ['light', 'dark']) {
      await pageA.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      for (const [key, label] of settingsPages) {
        await pageA.locator('.settings-nav nav button').filter({ hasText: label }).click();
        await pageA.waitForTimeout(220);
        await pageA.screenshot({
          path: path.join(screenshotDir, 'settings-' + key + '-' + theme + '-1440x900.png'),
          fullPage: false
        });
        const unstyledFields = await pageA.locator('input:not(.nexo-input):not(.nexo-slider):not([type="hidden"]), select:not(.nexo-select), textarea:not(.nexo-textarea)').evaluateAll((nodes) =>
          nodes.filter((node) => node.getClientRects().length > 0)
            .map((node) => ({ tag: node.tagName, type: node.getAttribute('type'), className: node.className }))
        );
        if (unstyledFields.length) throw new Error('Unstyled fields in settings section ' + key + ': ' + JSON.stringify(unstyledFields));
      }
    }
    await pageA.locator('.settings-nav-footer button').filter({ hasText: 'Закрыть' }).click();

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

    console.log('Two-account DM call, three-person group mesh call, voice-channel join/leave/camera, channel dialogs, settings themes, dock, and workspace screenshot checks passed. Screenshots: ' + screenshotDir);
    await contextA.close();
    await contextB.close();
    await contextC.close();
  } finally {
    await browser?.close();
    await apiA.dispose();
    await apiB.dispose();
    await apiC.dispose();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
