// Synthetic browser fixtures only. All API and Supabase traffic is intercepted.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const url = process.env.TEST_URL || "http://127.0.0.1:5174";
const env = readFileSync("client/.env", "utf8");
const host = new URL(env.match(/^VITE_SUPABASE_URL=(.*)$/m)[1].trim()).hostname;
const id = "10000000-0000-4000-8000-000000000002",
  cid = "20000000-0000-4000-8000-000000000001",
  pid = "30000000-0000-4000-8000-000000000001";
const exp = Math.floor(Date.now() / 1000) + 3600;
const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: id, exp, aud: "authenticated", role: "authenticated", session_id: "fixture" })).toString("base64url")}.fixture`;
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const role of ["admin", "agent", "client"])
    for (const theme of ["light", "dark"])
      for (const width of [390, 768, 1440]) {
        const context = await browser.newContext({
          viewport: { width, height: 1000 },
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        const user = {
          id,
          email: "fixture@example.test",
          aud: "authenticated",
          role: "authenticated",
          app_metadata: { provider: "email" },
          user_metadata: {},
        };
        const fixture = {
          users: [
            { user_id: id, role: "agent", display_name: "Example agent" },
          ],
          clients: [{ id: cid, name: "Example client" }],
          campaigns: [
            { id: pid, client_id: cid, name: "Debt relief", active: true },
          ],
          assignments: [
            {
              id: "assignment",
              agent_id: id,
              client_id: cid,
              campaign_id: pid,
              active: true,
            },
          ],
          settings: [
            {
              id: true,
              idle_minutes: 10,
              cap_timezone: "Africa/Cairo",
              screenshots_enabled: false,
              retention_days: 30,
            },
          ],
          sessions: [],
          segments: [],
          transfers: [
            {
              id: "transfer",
              agent_id: id,
              client_id: cid,
              campaign_id: pid,
              occurred_at: new Date().toISOString(),
              lead_name: "Example lead",
              phone: "+12125550100",
              state: "NY",
              outcome: "connected",
              qualifying_details: { debt_amount: 12000 },
              notes: "Synthetic test record",
            },
          ],
        };
        await context.addInitScript(
          ({ host, token, exp, user, theme }) => {
            localStorage.setItem(
              `sb-${host.split(".")[0]}-auth-token`,
              JSON.stringify({
                access_token: token,
                refresh_token: "fixture",
                expires_at: exp,
                expires_in: 3600,
                token_type: "bearer",
                user,
              }),
            );
            localStorage.setItem("victorysync:remember-login", "true");
            localStorage.setItem("vs-theme", theme);
          },
          { host, token, exp, user, theme },
        );
        await page.route("**/*", async (route) => {
          const request = route.request(),
            u = new URL(request.url());
          if (u.hostname === host) {
            return route.fulfill({
              json: u.pathname.includes("/auth/") ? user : [],
            });
          }
          if (u.pathname.startsWith("/api/")) {
            let body = {};
            if (u.pathname === "/api/user/profile")
              body = {
                user: { ...user, full_name: "Example account" },
                profile: {
                  global_role: role === "admin" ? "platform_admin" : null,
                },
              };
            else if (u.pathname === "/api/user/orgs") body = { orgs: [] };
            else if (u.pathname === "/api/user/mfa/factors")
              body = { factors: [] };
            else if (u.pathname === "/api/me/features") body = { features: {} };
            else if (u.pathname === "/api/csrf-token")
              body = { csrfToken: "fixture" };
            else if (u.pathname === "/api/workforce/me")
              body = { role, user_id: id };
            else if (u.pathname.startsWith("/api/workforce/data/"))
              body = {
                rows: fixture[u.pathname.split("/").at(-1)] || [],
                next_offset: null,
              };
            else if (u.pathname === "/api/workforce/actions/timer")
              body = {
                result: {
                  session: null,
                  budget: null,
                  authorized_until: null,
                  server_time: new Date().toISOString(),
                },
              };
            return route.fulfill({ json: body });
          }
          if (u.origin !== url) return route.abort();
          return route.continue();
        });
        await page.goto(`${url}/workforce`);
        await page
          .getByRole("navigation", { name: "Workforce sections" })
          .waitFor({ timeout: 20000 });
        const tabs =
          role === "admin"
            ? [
                "Overview",
                "Transfers",
                "Timesheets",
                "Monitoring",
                "Administration",
                "Audit",
              ]
            : role === "agent"
              ? ["Overview", "Timer", "Transfers", "Timesheets", "Monitoring"]
              : ["Overview", "Transfers", "Timesheets"];
        for (const tab of tabs) {
          await page
            .getByRole("navigation", { name: "Workforce sections" })
            .getByRole("button", { name: tab, exact: true })
            .click();
          await page.waitForTimeout(80);
          const axe = await new AxeBuilder({ page })
            .include(".wf-workspace")
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze();
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          );
          results.push({
            role,
            theme,
            width,
            tab,
            overflow,
            errors: [...errors],
            violations: axe.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              nodes: v.nodes.map((n) => ({
                target: n.target,
                summary: n.failureSummary,
              })),
            })),
          });
        }
        if (role === "client") {
          assert.equal(
            await page.getByRole("button", { name: "Export CSV" }).count(),
            0,
          );
          assert.equal(
            await page
              .getByRole("button", { name: "Log transfer", exact: true })
              .count(),
            0,
          );
        }
        if (role === "admin" && width === 1440) {
          await page
            .getByRole("navigation", { name: "Workforce sections" })
            .getByRole("button", { name: "Overview", exact: true })
            .click();
          await page.waitForTimeout(300);
          await page.screenshot({
            path: `audit/workforce-${theme}.png`,
            fullPage: true,
          });
        }
        await context.close();
      }
} finally {
  await browser.close();
  writeFileSync(
    "audit/workforce-browser.json",
    JSON.stringify(
      {
        method:
          "Synthetic fixtures, 3 roles, 3 widths, 2 themes. Axe WCAG AA checks on workforce content. Does not exercise production.",
        results,
      },
      null,
      2,
    ),
  );
}
const failed = results.filter(
  (r) => r.overflow || r.errors.length || r.violations.length,
);
console.log(
  JSON.stringify(
    { checks: results.length, failures: failed.length, details: failed },
    null,
    2,
  ),
);
if (failed.length) process.exitCode = 1;
