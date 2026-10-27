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

  // --- invite a guest viewer from the members panel
  await owner.getByRole("button", { name: "Members & permissions" }).click();
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
  assert.equal(await guest.getByRole("button", { name: "Organization admin" }).count(), 0);
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
  assert.ok((await owner.locator("table.list.audit tbody tr").count()) > 5);
  await shot(owner, "06-org-admin");

  // --- sign out redirects to login; the project is no longer reachable
  await owner.getByRole("button", { name: "Sign out" }).click();
  await owner.waitForURL(`${BASE}/login`);
  await owner.goto(projectUrl);
  await owner.waitForURL(`${BASE}/login`);

  await browser.close();
  assert.deepEqual(errors, []);
  console.log("e2e smoke: OK");
})().catch(async (e) => {
  console.error("e2e smoke: FAILED", e);
  process.exit(1);
});
