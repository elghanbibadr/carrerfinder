"use client";

import { useMemo, useState } from "react";
import type { FindResult, Status } from "@/lib/types";
import { 
  Briefcase, 
  Search, 
  Download, 
  ExternalLink, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Globe 
} from "lucide-react";

const MAX = 10;

const STATUS: Record<Status, { label: string; color: string }> = {
  found: { label: "Careers page found", color: "var(--color-found)" },
  platform: { label: "On a job platform", color: "var(--color-platform)" },
  not_found: { label: "Not found", color: "var(--color-missing)" },
  blocked: { label: "Could not scan", color: "var(--color-blocked)" },
  invalid: { label: "Invalid address", color: "var(--color-missing)" },
  error: { label: "Request failed", color: "var(--color-missing)" },
};

const ROLES = { open: "Roles listed", none: "No open roles", unknown: "Roles unclear" };

type Row = { input: string; result?: FindResult };

function parse(text: string) {
  const items = text.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  return Array.from(new Set(items));
}

function hostOf(input: string) {
  try {
    return new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`).hostname.replace(/^www\./, "");
  } catch {
    return input;
  }
}

function downloadCsv(rows: Row[]) {
  const esc = (v = "") => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    ["website", "status", "careers_page", "platform", "roles", "email"].join(","),
    ...rows.map(({ input, result: r }) =>
      [input, r?.status, r?.careersUrl, r?.platform, r?.roles, r?.email].map((v) => esc(v ?? "")).join(","),
    ),
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "careers-pages.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const urls = useMemo(() => parse(text), [text]);
  const tooMany = urls.length > MAX;
  const done = rows.length > 0 && rows.every((r) => r.result);
  const foundCount = rows.filter((r) => r.result?.status === "found" || r.result?.status === "platform").length;

  async function run() {
    const list = urls.slice(0, MAX);
    if (!list.length || loading) return;
    setRows(list.map((input) => ({ input })));
    setLoading(true);

    await Promise.all(
      list.map(async (input, i) => {
        let result: FindResult;
        try {
          const res = await fetch("/api/find", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: input }),
          });
          const data = await res.json();
          result = res.ok ? data : { input, status: "error", note: data.error ?? "Something went wrong." };
        } catch {
          result = { input, status: "error", note: "Could not reach the server." };
        }
        setRows((prev) => prev.map((r, j) => (j === i ? { ...r, result } : r)));
      }),
    );
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-indigo-500 selection:text-white">
      {/* Background Gradient Orbs */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-40">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-indigo-600/30 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 h-96 w-96 rounded-full bg-violet-600/20 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-10 lg:px-8">
        {/* Brand Header */}
        <header className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
            <Briefcase className="h-5 w-5 text-white" />
          </div>
          <span className="font-display text-xl font-bold tracking-tight text-white">
            Career<span className="text-indigo-400">Finder</span>
          </span>
        </header>

        {/* Hero Section */}
        <section className="mt-12 md:mt-10">
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-white sm:text-5xl md:text-6xl md:leading-[1.1]">
            Find the careers page <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-indigo-300 via-white to-violet-300 bg-clip-text text-transparent">
              of any company.
            </span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-slate-400 sm:text-lg">
            Paste up to <span className="font-semibold text-slate-200">{MAX}</span> websites, one per line. Get direct links or verified statuses in seconds.
          </p>
        </section>

        {/* Input Card */}
        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-2 sm:p-3 backdrop-blur-xl shadow-2xl">
          <div className="relative rounded-xl border border-slate-800/80 bg-slate-950/80 transition-within:border-indigo-500/50 transition-within:ring-2 transition-within:ring-indigo-500/20">
            <label htmlFor="sites" className="sr-only">Websites</label>
            <textarea
              id="sites"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"stripe.com\nlinear.app\nvercel.com"}
              spellCheck={false}
              className="min-h-48 w-full resize-y bg-transparent p-4 font-mono text-sm leading-relaxed text-slate-200 placeholder:text-slate-600 focus:outline-none"
            />
            
            {/* Input Footer Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-800/60 bg-slate-900/40 px-4 py-3">
              <div className="flex items-center gap-2 text-xs">
                <span className={`font-medium ${tooMany ? "text-amber-400" : "text-slate-400"}`}>
                  {urls.length} / {MAX} sites
                </span>
                {tooMany && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-400 ring-1 ring-inset ring-amber-400/20">
                    <AlertCircle className="h-3 w-3" /> Only first {MAX} checked
                  </span>
                )}
              </div>

              <button
                onClick={run}
                disabled={!urls.length || loading}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition duration-150 hover:bg-indigo-500 hover:shadow-indigo-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching…
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    Find careers pages
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Results Section */}
        {rows.length > 0 && (
          <section className="mt-12 animate-in fade-in slide-in-from-bottom-4 duration-300" aria-live="polite">
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold tracking-tight text-white sm:text-2xl">
                  {done ? `${foundCount} of ${rows.length} found` : "Analyzing domains…"}
                </h2>
                <p className="text-xs text-slate-400">
                  {done ? "Search completed successfully." : "Fetching career links and hiring signals."}
                </p>
              </div>

              {done && (
                <button
                  onClick={() => downloadCsv(rows)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-4 py-2 text-xs font-semibold text-slate-200 backdrop-blur-md transition hover:border-slate-700 hover:bg-slate-800/80 hover:text-white"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </button>
              )}
            </div>

            {/* Results List */}
            <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-xl shadow-xl">
              <ul className="divide-y divide-slate-800/60">
                {rows.map(({ input, result }) => {
                  const s = result ? STATUS[result.status] : null;
                  return (
                    <li
                      key={input}
                      className="group grid gap-4 p-4 sm:p-5 md:grid-cols-[1.2fr_1fr_1.8fr] md:items-center transition hover:bg-slate-800/30"
                    >
                      {/* Hostname & Platform */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 shrink-0 text-slate-500 group-hover:text-indigo-400 transition" />
                          <p className="font-display truncate text-base font-semibold text-white">
                            {hostOf(input)}
                          </p>
                        </div>
                        {result?.platform && (
                          <span className="mt-1 inline-block text-xs font-medium text-slate-400">
                            {result.platform}
                          </span>
                        )}
                      </div>

                      {/* Status Badge */}
                      <div>
                        {s ? (
                          <span 
                            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset"
                            style={{
                              backgroundColor: `${s.color}15`,
                              color: s.color,
                              borderColor: `${s.color}30`,
                            }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                            {s.label}
                          </span>
                        ) : (
                          <div className="h-6 w-28 animate-pulse rounded-full bg-slate-800" />
                        )}
                      </div>

                      {/* Career Link & Meta Info */}
                      <div className="min-w-0 text-xs sm:text-sm">
                        {!result && <div className="h-5 w-full max-w-xs animate-pulse rounded bg-slate-800" />}

                        {result?.careersUrl && (
                          <a
                            href={result.careersUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 font-medium text-indigo-400 transition hover:text-indigo-300 hover:underline"
                          >
                            <span className="truncate">{result.careersUrl}</span>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" />
                          </a>
                        )}

                        {result?.note && <p className="mt-0.5 text-slate-400">{result.note}</p>}

                        {(result?.roles || result?.email) && (
                          <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-slate-400">
                            {result.roles && <span>{ROLES[result.roles]}</span>}
                            {result.roles && result.email && <span>•</span>}
                            {result.email && (
                              <span className="text-slate-300">
                                Contact: <a href={`mailto:${result.email}`} className="underline hover:text-white">{result.email}</a>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

