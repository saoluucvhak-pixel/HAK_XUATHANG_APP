// Verify both account modes with the real UI and persistent storage.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { pbkdf2Sync } = require('node:crypto');
const { chromium } = require('playwright');

const url = process.env.HAK_APP_URL || pathToFileURL(path.resolve(__dirname, '../app/index.html')).href;
const key = 'hak.auth.v1';
const password = 'matkhau123';
const name = 'nguoidung';
const submit = (page) => page.locator('#authForm button[type=submit]').click();
const state = (page) => page.evaluate((key) => HAK.Store.get(key), key);
const openSettings = async (page) => {
  await page.evaluate(() => {
    location.hash = '#/settings';
  });
  await page.locator('[data-bs-target="#tab-account"]').click();
};
const chooseCompany = async (page) => {
  await page.waitForFunction(() => document.querySelector('#auCos button') || !document.querySelector('#authGate'));
  const company = page.locator('#auCos button').first();
  if (await company.isVisible()) await company.click();
  await page.locator('#authGate').waitFor({ state: 'hidden' });
};
async function fillLogin(page, username, secret) {
  await page.fill('#auUser', username);
  await page.fill('#auPw', secret);
  await submit(page);
}
async function setupAccount(page) {
  await page.fill('#auName', 'Người dùng thử');
  await page.fill('#auUser', name);
  await page.fill('#auPw', password);
  await page.fill('#auPw2', 'khong-khop');
  await submit(page);
  await page.getByText('Hai lần nhập mật khẩu không khớp.').waitFor();
  await page.fill('#auPw2', password);
  await submit(page);
  const code = await page.locator('.auth-code').textContent();
  await page.check('#auKept');
  await page.click('#auNext');
  await chooseCompany(page);
  return code;
}
async function withPage(browser, action) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await action(page, context);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch(
    process.env.HAK_CHROMIUM ? { executablePath: process.env.HAK_CHROMIUM, args: ['--no-sandbox'] } : {}
  );
  try {
    await withPage(browser, async (page, context) => {
      await page.goto(url);
      await page.click('#auSingle');
      await page.locator('#authGate').waitFor({ state: 'hidden' });
      const single = await state(page);
      assert.equal(single.mode, 'single');
      await page.reload();
      await page.locator('#btnCompany').waitFor();
      assert.equal(await page.locator('#authForm').count(), 0);
      await openSettings(page);
      await page.click('#acEnable');
      assert.match(await setupAccount(page), /^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){2}$/);
      const enabled = await state(page);
      assert.equal(enabled.mode, 'account');
      assert.equal(enabled.profileId, single.profileId);
      assert.equal(enabled.users[0].alg, 'p2');
      assert.equal(enabled.users[0].role, undefined);
      assert.ok(!JSON.stringify(enabled).includes(password));

      await page.click('#btnLogout');
      await page.locator('#auPw').waitFor();
      assert.equal(await page.locator('#auSingle').count(), 0);
      await fillLogin(page, name, password);
      await chooseCompany(page);
      await openSettings(page);
      assert.equal(await page.locator('#usAdd').count(), 0);
      await page.click('#acDisable');
      await page.fill('#auUser', 'sai-ten');
      await page.fill('#auCurrent', password);
      await submit(page);
      await page.getByText('Sai tên đăng nhập hoặc mật khẩu.').waitFor();
      assert.equal((await state(page)).mode, 'account');
      await page.fill('#auUser', name);
      await page.fill('#auCurrent', 'sai-mat-khau');
      await submit(page);
      await page.getByText('Sai tên đăng nhập hoặc mật khẩu.').waitFor();
      await page.fill('#auCurrent', password);
      await submit(page);
      await page.locator('#acEnable').waitFor();
      assert.deepEqual(await state(page), single);
      const reopened = await context.newPage();
      await reopened.goto(url);
      await reopened.locator('#btnCompany').waitFor();
      assert.equal(await reopened.locator('#authForm').count(), 0);
    });

    await withPage(browser, async (page) => {
      await page.goto(url);
      await page.locator('#auSingle').waitFor();
      await page.evaluate(
        async ({ name, password, key }) => {
          const verifier = await HAK.Auth._hashRec(password);
          HAK.Store.set(key, {
            v: 1,
            users: [
              { id: 'ustaff', name: 'Nhân viên', username: 'staff', role: 'staff', ...verifier },
              { id: 'uowner', name: 'Quản trị', username: name, role: 'admin', ...verifier },
            ],
          });
          await HAK.Store.flush();
          sessionStorage.setItem('hak.session', JSON.stringify({ uid: 'ustaff', co: 'hak' }));
        },
        { name, password, key }
      );
      await page.reload();
      await page.locator('#auPw').waitFor();
      assert.equal(await page.locator('#auSingle').count(), 0);
      await fillLogin(page, 'staff', password);
      await page.getByText('Sai tên đăng nhập hoặc mật khẩu.').waitFor();
      assert.equal((await state(page)).v, 1);
      await fillLogin(page, name, password);
      await page.check('#auKept');
      await page.click('#auNext');
      await chooseCompany(page);
      const migrated = await state(page);
      assert.equal(migrated.mode, 'account');
      assert.equal(migrated.profileId, 'uowner');
      assert.deepEqual(
        migrated.users.map((user) => [user.username, user.role]),
        [[name, undefined]]
      );
    });

    for (const mode of ['single', 'account']) {
      await withPage(browser, async (page, context) => {
        const salt = 'windows-install-exact-utf8';
        const user = {
          id: 'winowner',
          username: name,
          name: 'Tài khoản cài đặt',
          stamp: 'winstamp',
          alg: 'p2',
          iter: 210000,
          salt,
          hash: pbkdf2Sync(password, salt, 210000, 32, 'sha256').toString('hex'),
        };
        const state = { v: 2, mode, profileId: mode === 'single' ? 'local' : user.id, users: mode === 'single' ? [] : [user] };
        await context.route('**/js/install-login.js', (route) =>
          route.fulfill({
            contentType: 'application/javascript',
            body: 'window.HAK_INSTALL_LOGIN = ' + JSON.stringify({ id: 'ci', state }) + ';',
          })
        );
        await page.goto(url);
        if (mode === 'account') {
          await page.locator('#auPw').waitFor();
          assert.equal(await page.locator('#auSingle').count(), 0);
          await fillLogin(page, name, password);
          await chooseCompany(page);
        } else {
          await page.locator('#btnCompany').waitFor();
        }
        assert.equal(await page.evaluate(() => HAK.Auth.usesAccount()), mode === 'account');
      });
    }
    console.log('Hai chế độ, đổi qua lại, xác thực khi tắt, nâng cấp tài khoản cũ và cấu hình từ bộ cài đều đạt.');
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
