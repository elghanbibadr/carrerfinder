import * as cheerio from "cheerio";
import { lookup } from "node:dns/promises";
import net from "node:net";
import type { FindResult } from "./types";

const UA = "Mozilla/5.0 (compatible; CareerFinder/1.0)";

const COMMON_PATHS = [
  "/careers",
  "/jobs",
  "/join-us",
  "/work-with-us",
  "/about/careers",
  "/company/careers",
];

const PLATFORMS: [string, string][] = [
  ["Greenhouse", "greenhouse.io"],
  ["Lever", "lever.co"],
  ["Workable", "workable.com"],
  ["Ashby", "ashbyhq.com"],
  ["BambooHR", "bamboohr.com"],
  ["Recruitee", "recruitee.com"],
  ["Teamtailor", "teamtailor.com"],
  ["SmartRecruiters", "smartrecruiters.com"],
];

const LINK_WORDS = /career|jobs?\b|hiring|join[-\s]?us|work[-\s]?with[-\s]?us|open[-\s]?positions|vacanc/i;
const CAREER_PAGE_WORDS = /career|open (positions|roles)|job openings|join our team|apply now|we.?re hiring/i;
const NO_ROLES = /no (current |open )?(openings|positions|roles|vacancies)|not (currently )?hiring/i;
const HAS_ROLES = /apply|view (role|position)|full[-\s]?time|part[-\s]?time|remote/i;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const HR_LOCAL = /^(jobs?|careers?|hr|hiring|recruit(ing|ment|er)?|talent|people|join|work)/i;

/* ---------- safety: never fetch private or local addresses ---------- */

function isPrivateIp(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const v = ip.toLowerCase();
  return (
    v === "::1" || v === "::" ||
    v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") ||
    v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.")
  );
}

async function assertPublic(hostname: string) {
  if (hostname === "localhost") throw new Error("Private address");
  const addrs = await lookup(hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error("Private address");
  }
}

/* ---------- fetching ---------- */

type Page = { ok: boolean; status: number; url: string; html: string };

async function getPage(url: string, timeoutMs = 8000): Promise<Page> {
  await assertPublic(new URL(url).hostname);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml" },
    });
    const type = res.headers.get("content-type") ?? "";
    const html = type.includes("html") || type.includes("xml") ? (await res.text()).slice(0, 1_000_000) : "";
    return { ok: res.ok, status: res.status, url: res.url, html };
  } finally {
    clearTimeout(timer);
  }
}

const safeGet = (url: string) => getPage(url).catch(() => null);

/* ---------- helpers ---------- */

function normalize(input: string) {
  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const u = new URL(withProtocol);
  if (!u.hostname.includes(".")) throw new Error("Invalid URL");
  return u.origin;
}

function platformOf(url: string) {
  try {
    const host = new URL(url).hostname;
    return PLATFORMS.find(([, domain]) => host === domain || host.endsWith(`.${domain}`))?.[0];
  } catch {
    return undefined;
  }
}

function collectCandidates($: cheerio.CheerioAPI, base: string) {
  const scores = new Map<string, number>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || /^(mailto:|tel:|#|javascript:)/i.test(href)) return;
    let abs: URL;
    try {
      abs = new URL(href, base);
    } catch {
      return;
    }
    const text = $(el).text().trim().slice(0, 60);
    let score = 0;
    if (platformOf(abs.toString())) score += 100;
    if (LINK_WORDS.test(text)) score += 50;
    if (LINK_WORDS.test(abs.pathname)) score += 30;
    if ($(el).closest("header, nav, footer").length) score += 10;
    if (score >= 30) scores.set(abs.toString(), Math.max(scores.get(abs.toString()) ?? 0, score));
  });
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u);
}

function analyze(html: string) {
  const $ = cheerio.load(html);
  const mailtos = $("a[href^='mailto:']")
    .map((_, el) => ($(el).attr("href") ?? "").replace(/^mailto:/i, "").split("?")[0])
    .get();
  $("script, style, noscript").remove();
  const text = $("body").text().replace(/\s+/g, " ");
  const emails = [...mailtos, ...(text.match(EMAIL) ?? [])];
  const email = emails.find((e) => HR_LOCAL.test(e.split("@")[0]));
  const looksLikeCareers = CAREER_PAGE_WORDS.test(text) || CAREER_PAGE_WORDS.test($("title").text());
  const roles: FindResult["roles"] = NO_ROLES.test(text)
    ? "none"
    : looksLikeCareers && HAS_ROLES.test(text)
      ? "open"
      : "unknown";
  return { email, roles, looksLikeCareers };
}

/* ---------- main ---------- */

export async function findCareers(input: string): Promise<FindResult> {
  let origin: string;
  try {
    origin = normalize(input.trim());
  } catch {
    return { input, status: "invalid", note: "This is not a valid website address." };
  }

  const home = await safeGet(origin);
  if (!home) return { input, url: origin, status: "blocked", note: "The site did not respond." };
  if (!home.ok && [401, 403, 429, 503].includes(home.status)) {
    return { input, url: origin, status: "blocked", note: "The site blocked the scan." };
  }

  const base = home.url || origin;

  // 1. Links on the homepage (header, nav, footer)
  const candidates = home.html ? collectCandidates(cheerio.load(home.html), base) : [];
  for (const link of candidates.slice(0, 3)) {
    const platform = platformOf(link);
    if (platform) {
      return { input, url: base, status: "platform", careersUrl: link, platform, source: "Homepage link" };
    }
    const page = await safeGet(link);
    if (page?.ok) {
      const info = analyze(page.html);
      return {
        input, url: base, status: "found", careersUrl: page.url,
        source: "Homepage link", roles: info.roles, email: info.email,
      };
    }
  }

  // 2. Common paths, checked in parallel
  const checks = await Promise.all(
    COMMON_PATHS.map(async (path) => {
      const page = await safeGet(new URL(path, base).toString());
      if (!page?.ok) return null;
      if (new URL(page.url).pathname.replace(/\/$/, "") === "") return null; // redirected to homepage
      const platform = platformOf(page.url);
      const info = analyze(page.html);
      return platform || info.looksLikeCareers ? { page, platform, info } : null;
    }),
  );
  const hit = checks.find(Boolean);
  if (hit) {
    return hit.platform
      ? { input, url: base, status: "platform", careersUrl: hit.page.url, platform: hit.platform, source: "Common path" }
      : {
          input, url: base, status: "found", careersUrl: hit.page.url,
          source: "Common path", roles: hit.info.roles, email: hit.info.email,
        };
  }

  // 3. Sitemap
  const sitemap = await safeGet(new URL("/sitemap.xml", base).toString());
  if (sitemap?.ok) {
    const locs = [...sitemap.html.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const match = locs.find((l) => /\/(careers?|jobs?)(\/|$)/i.test(l));
    if (match) {
      const page = await safeGet(match);
      if (page?.ok) {
        const info = analyze(page.html);
        return {
          input, url: base, status: "found", careersUrl: page.url,
          source: "Sitemap", roles: info.roles, email: info.email,
        };
      }
    }
  }

  return {
    input, url: base, status: "not_found",
    note: "No careers page found. It may be loaded with JavaScript.",
  };
}
