/* End-to-end smoke test against a running server (BASE_URL, default http://localhost:3000).
   Covers: sign-up, project creation, editing with autosave, invitations, guest read-only,
   contributor progress-only, organization admin. Screenshots go to SHOTS_DIR when set. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR;
const launch = () => chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const uid = Date.now().toString(36);

async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

(async () => {
  const browser = await launch();
  const errors = [];
  const newPage = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 720 }, locale: "en-US" });
    // English UI for the assertions below (the default UI language is Hebrew).
    await ctx.addInitScript(() => localStorage.setItem("gantt-planner.prefs.v1", JSON.stringify({ lang: "en" })));
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    return page;
  };

  // --- owner signs up and creates the sample project
  const owner = await newPage();
  await owner.goto(`${BASE}/signup`);
  await owner.getByLabel("Full name").fill("Tamir");
  await owner.getByLabel("Organization name").fill("Acme IL");
  await owner.getByLabel("E-mail").fill(`owner-${uid}@example.com`);
  await owner.getByLabel("Password").fill("secret-pass-1");
  await owner.getByRole("button", { name: "Create account and organization" }).click();
  await owner.waitForURL(`${BASE}/`);
  await shot(owner, "01-projects-empty");
  await owner.getByRole("button", { name: "Sample project" }).click();
  await owner.waitForURL(/\/projects\//);
  const projectUrl = owner.url();
  await owner.locator("table.grid tbody tr").first().waitFor();
  const rowsBefore = await owner.locator("table.grid tbody tr").count();
  assert.equal(rowsBefore, 12);

  // --- edit: change a duration, wait for autosave, reload and verify persistence
  const row2 = owner.locator("table.grid tbody tr").nth(1);
  await row2.locator("td.c-dur .cell-text").click();
  await owner.locator("td.c-dur input.cell-input").fill("5d");
  await owner.keyboard.press("Enter");
  await owner.locator(".save-state.saved").waitFor({ timeout: 10000 });
  await owner.reload();
  await owner.locator("table.grid tbody tr").first().waitFor();
  assert.equal(await owner.locator("table.grid tbody tr").nth(1).locator("td.c-dur").innerText(), "5d");
  await shot(owner, "02-project-owner");

  // --- resources: assign by text, open the resource sheet, set a baseline and a status date
  await row2.locator("td.c-res .cell-text").click();
  await owner.locator("td.c-res input.cell-input").fill("Dana[50%]; New contractor");
  await owner.keyboard.press("Enter");
  await owner.locator(".save-state.saved").waitFor({ timeout: 10000 });
  assert.equal(await row2.locator("td.c-res .cell-text").innerText(), "Dana[50%]; New contractor");
  await owner.getByRole("button", { name: "Resources" }).click();
  await owner.locator(".panel.wide").waitFor();
  // both names are new (the sample's resources are Hebrew), so two work resources were created on top of the sample's 5
  assert.equal(await owner.locator(".list.resources tbody tr").count(), 7);
  await owner.locator(".panel-head button").click();
  await owner.getByRole("button", { name: "Set baseline" }).click();
  await owner.locator(".save-state.saved").waitFor({ timeout: 10000 });
  assert.ok((await owner.locator("svg.gantt .baselines rect").count()) >= 8);
  assert.equal(await owner.locator("table.grid thead th.c-var").count(), 2);
  await owner.locator('.toolbar label[title="Status date"] input[type="date"]').fill("2026-11-05");
  await owner.locator(".save-state.saved").waitFor({ timeout: 10000 });
  assert.equal(await owner.locator("svg.gantt .status-date line").count(), 1);
  await owner.reload();
  await owner.locator("table.grid tbody tr").first().waitFor();
  assert.equal(await owner.getByRole("button", { name: "Clear baseline" }).count(), 1); // baseline persisted
  await shot(owner, "02b-resources-baseline");

  // --- invite a guest viewer from the members panel
  await owner.getByRole("button", { name: "Share & permissions" }).click();
  await owner.locator(".invite-form input[type=email]").fill(`guest-${uid}@partner.com`);
  await owner.locator(".invite-form select").first().selectOption("guest");
  await owner.locator(".invite-form select").nth(1).selectOption("viewer");
  await owner.locator(".invite-form button[type=submit]").click();
  const guestLink = await owner.locator(".invite-link code").innerText();
  await shot(owner, "03-invite");

  // --- guest accepts, sees the project read-only and nothing else
  const guest = await newPage();
  await guest.goto(guestLink);
  await guest.getByLabel("Full name").fill("US Partner");
  await guest.getByLabel("Password").fill("secret-pass-2");
  await guest.getByRole("button", { name: "Accept invitation" }).click();
  await guest.waitForURL(/\/projects\//);
  await guest.locator("table.grid tbody tr").first().waitFor();
  assert.equal(await guest.locator(".save-state").innerText(), "Read only");
  assert.equal(await guest.getByRole("button", { name: "New task" }).count(), 0);
  assert.equal(await guest.locator("svg.gantt.readonly").count(), 1);
  await guest.goto(`${BASE}/`);
  await guest.locator("table.list tbody tr").first().waitFor();
  assert.equal(await guest.locator("table.list tbody tr").count(), 1);
  await guest.locator(".user-button").click();
  assert.equal(await guest.getByRole("menuitem", { name: "Organization admin" }).count(), 0);
  await guest.keyboard.press("Escape");
  await shot(guest, "04-guest-readonly");

  // --- contributor: assigned task progress is editable, nothing else
  await owner.locator(".invite-form input[type=email]").fill(`worker-${uid}@example.com`);
  await owner.locator(".invite-form select").first().selectOption("member");
  await owner.locator(".invite-form select").nth(1).selectOption("contributor");
  await owner.locator(".invite-form button[type=submit]").click();
  // The link element already shows the guest link; wait until it changes to the new token.
  await owner.locator(".invite-link code", { hasNotText: guestLink.slice(-20) }).waitFor();
  const workerLink = await owner.locator(".invite-link code").innerText();
  const worker = await newPage();
  await worker.goto(workerLink);
  await worker.getByLabel("Full name").fill("Worker");
  await worker.getByLabel("Password").fill("secret-pass-3");
  await worker.getByRole("button", { name: "Accept invitation" }).click();
  await worker.waitForURL(/\/projects\//);
  // owner assigns task 2 to the worker
  await owner.reload();
  await owner.locator("table.grid tbody tr").first().waitFor();
  const assignee = owner.locator("table.grid tbody tr").nth(1).locator("select.cell-select");
  await assignee.selectOption({ label: "Worker" });
  await owner.locator(".save-state.saved").waitFor({ timeout: 10000 });
  await worker.reload();
  await worker.locator("table.grid tbody tr").first().waitFor();
  await worker.locator("table.grid tbody tr").nth(1).locator("td.c-pct .cell-text").click();
  await worker.locator("td.c-pct input.cell-input").fill("40");
  await worker.keyboard.press("Enter");
  await worker.locator(".save-state.saved").waitFor({ timeout: 10000 }).catch(() => {});
  // a non-assigned task stays read-only for the worker
  assert.equal(await worker.locator("table.grid tbody tr").nth(2).locator("td.c-pct .cell-text.ro").count(), 1);
  await owner.reload();
  await owner.locator("table.grid tbody tr").first().waitFor();
  assert.equal(await owner.locator("table.grid tbody tr").nth(1).locator("td.c-pct").innerText(), "40");
  await shot(worker, "05-contributor");

  // --- organization admin page
  await owner.goto(`${BASE}/members`);
  await owner.locator("table.list tbody tr").nth(2).waitFor();
  assert.equal(await owner.locator("table.list tbody tr select").count(), 3);
  // the audit log loads separately; wait for at least six entries instead of counting immediately
  await owner.locator("table.list.audit tbody tr").nth(5).waitFor();
  await shot(owner, "06-org-admin");

  // --- sign out redirects to login; the project is no longer reachable
  await owner.locator(".user-button").click();
  await owner.getByRole("menuitem", { name: "Sign out" }).click();
  await owner.waitForURL(`${BASE}/login`);
  await owner.goto(projectUrl);
  await owner.waitForURL(`${BASE}/login`);


  // ===== Regression checks for state-handling bugs =====
  const signUp = async (page, email, org) => {
    await page.goto(`${BASE}/signup`);
    await page.getByLabel("Full name").fill(email.split("@")[0]);
    await page.getByLabel("Organization name").fill(org);
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Password").fill("secret-pass-9");
    await page.getByRole("button", { name: "Create account and organization" }).click();
    await page.waitForURL(`${BASE}/`);
  };
  const pm = await newPage();
  await signUp(pm, `pm2-${uid}@example.com`, "Regression Org");
  await pm.getByRole("button", { name: "Sample project" }).click();
  await pm.waitForURL(/\/projects\//);
  await pm.locator("table.grid tbody tr").first().waitFor();
  const pmProjectUrl = pm.url();

  // 1. While a project loads, the editor shows "Loading…", not an empty read-only project.
  await pm.route("**/api/projects/*", async (route) => {
    if (route.request().method() === "GET") await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });
  const meLoaded = pm.waitForResponse((r) => r.url().endsWith("/api/me"));
  await pm.reload();
  await meLoaded; // the session is known; only the project is still loading
  await pm.waitForTimeout(500);
  assert.equal(await pm.getByText("Loading…").count(), 1);
  assert.equal(await pm.locator(".save-state").count(), 0); // previously: an empty editor marked "Read only"
  await pm.locator("table.grid tbody tr").first().waitFor();
  await pm.unroute("**/api/projects/*");

  // 2. An edit made while a slow save is in flight is saved too, without a self-conflict.
  const putStatuses = [];
  pm.on("response", (r) => { if (r.request().method() === "PUT") putStatuses.push(r.status()); });
  await pm.route("**/api/projects/*", async (route) => {
    if (route.request().method() === "PUT") await new Promise((r) => setTimeout(r, 2000));
    await route.continue();
  });
  const editDuration = async (row, value) => {
    await pm.locator("table.grid tbody tr").nth(row).locator("td.c-dur .cell-text").click();
    await pm.locator("td.c-dur input.cell-input").fill(value);
    await pm.keyboard.press("Enter");
  };
  await editDuration(1, "6d");
  await pm.waitForTimeout(1200); // first save is in flight
  await editDuration(2, "7d");
  await pm.locator(".save-state.saved").waitFor({ timeout: 15000 });
  await pm.unroute("**/api/projects/*");
  assert.ok(putStatuses.length >= 2 && putStatuses.every((code) => code === 200), `PUT statuses ${putStatuses}`);
  await pm.goto(pmProjectUrl);
  await pm.locator("table.grid tbody tr").first().waitFor();
  assert.equal(await pm.locator("table.grid tbody tr").nth(1).locator("td.c-dur").innerText(), "6d");
  assert.equal(await pm.locator("table.grid tbody tr").nth(2).locator("td.c-dur").innerText(), "7d");

  // 3. Undo removes the new task from the selection; outdent then has nothing to act on.
  await pm.getByRole("button", { name: "New task" }).click();
  await pm.keyboard.press("Control+z");
  assert.equal(await pm.getByRole("button", { name: "Outdent" }).isEnabled(), false);

  // 4. Leaving a project right after an edit still saves the edit.
  await editDuration(3, "2d");
  await pm.locator("button[title='Back to projects']").click();
  await pm.waitForURL(`${BASE}/`);
  await pm.waitForTimeout(1500);
  await pm.goto(pmProjectUrl);
  await pm.locator("table.grid tbody tr").first().waitFor();
  assert.equal(await pm.locator("table.grid tbody tr").nth(3).locator("td.c-dur").innerText(), "2d");

  // 5. A server error at startup is retried instead of signing the user out.
  let failures = 0;
  await pm.route("**/api/me", async (route) => {
    if (failures < 2) {
      failures++;
      await route.fulfill({ status: 502, body: "Bad Gateway" });
    } else await route.continue();
  });
  await pm.reload();
  await pm.locator("table.grid tbody tr").first().waitFor({ timeout: 15000 });
  assert.equal(failures, 2);
  assert.ok(!pm.url().includes("/login"));
  await pm.unroute("**/api/me");

  // 6. Someone with an existing account who signs in from an invitation comes back to it and joins.
  const existing = await newPage();
  await signUp(existing, `existing-${uid}@example.com`, "Other Org");
  await existing.locator(".user-button").click();
  await existing.getByRole("menuitem", { name: "Sign out" }).click();
  await existing.waitForURL(`${BASE}/login`);
  await pm.getByRole("button", { name: "Share & permissions" }).click();
  await pm.locator(".invite-form input[type=email]").fill(`existing-${uid}@example.com`);
  await pm.locator(".invite-form select").first().selectOption("guest");
  await pm.locator(".invite-form select").nth(1).selectOption("editor");
  await pm.locator(".invite-form button[type=submit]").click();
  const existingLink = await pm.locator(".invite-link code").innerText();
  await existing.goto(existingLink);
  await existing.locator(".auth-card a", { hasText: "Sign in" }).click();
  await existing.getByLabel("E-mail").fill(`existing-${uid}@example.com`);
  await existing.getByLabel("Password").fill("secret-pass-9");
  await existing.getByRole("button", { name: "Sign in" }).click();
  await existing.waitForURL(/\/invite\//);
  await existing.getByRole("button", { name: "Accept invitation" }).click();
  await existing.waitForURL(/\/projects\//);
  await existing.locator("table.grid tbody tr").first().waitFor();
  assert.equal(await existing.getByRole("button", { name: "New task" }).count(), 1); // editor rights
  await browser.close();
  assert.deepEqual(errors, []);
  console.log("e2e smoke: OK");
})().catch(async (e) => {
  console.error("e2e smoke: FAILED", e);
  process.exit(1);
});
