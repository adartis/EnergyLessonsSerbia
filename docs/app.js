"use strict";
(() => {
  const D = window.DATA;
  const $ = (id) => document.getElementById(id);
  if (!D) {
    $("main").innerHTML = '<p class="empty">No data found. Run <code>python scripts/build_site.py</code> to generate docs/data.js.</p>';
    return;
  }

  // ---------- Labels and formatting ----------
  const THEMES = ["renewables", "efficiency", "grids", "coal_transition", "district_heating", "gas_security", "market_reform"];
  const MATURITY = ["emerging", "piloted", "scaled"];
  const OUTCOMES = ["success", "mixed", "failure"];
  const LABELS = {
    theme: { renewables: "Renewables", efficiency: "Energy efficiency", grids: "Grids", coal_transition: "Coal transition",
      district_heating: "District heating", gas_security: "Gas security", market_reform: "Market reform" },
    maturity: { emerging: "Emerging", piloted: "Piloted", scaled: "Scaled" },
    outcome: { success: "Success", mixed: "Mixed", failure: "Failure" },
  };
  const OUTCOME_ICON = { success: "✓", mixed: "◐", failure: "✕" };
  const QUALITY_TEXT = {
    A: "A: official evaluation or study with published data and method",
    B: "B: think-tank analysis that cites data",
    C: "C: commentary or advocacy without data",
  };
  const FACTORS = D.factors;
  const regionNames = (() => { try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) { return null; } })();
  const countryName = (c) => {
    if (c === "EU") return "European Union";
    try { return (regionNames && regionNames.of(c)) || c; } catch (e) { return c; }
  };
  const eurCompact = new Intl.NumberFormat("en", { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 });
  const eurFull = new Intl.NumberFormat("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const num = new Intl.NumberFormat("en");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const docs = Object.fromEntries(D.documents.map((d) => [d.doc_id, d]));
  const ALL = D.learnings;
  const state = { search: "", theme: "", maturity: "", outcome: "", country: "", source: "", factor: "", km: null };

  const sourceHref = (l) => {
    const doc = docs[l.doc_id] || {};
    return (doc.file || "").endsWith(".pdf") && l.page ? `${l.source_url}#page=${l.page}` : l.source_url;
  };

  // ---------- Filtering ----------
  function haystack(l) {
    const doc = docs[l.doc_id] || {};
    return [l.title, l.programme, l.problem, l.solution, l.results, l.implementer, (l.delivery_partners || []).join(" "),
      l.funding, l.serbia_reason, l.country, countryName(l.country), doc.source, doc.title, l.quote].join(" ").toLowerCase();
  }
  const HAY = new Map(ALL.map((l) => [l.id, haystack(l)]));

  function matches(l) {
    if (state.km && !state.km.learning_ids.includes(l.id)) return false;
    if (state.theme && l.theme !== state.theme) return false;
    if (state.maturity && l.maturity !== state.maturity) return false;
    if (state.outcome && l.outcome !== state.outcome) return false;
    if (state.country && l.country !== state.country) return false;
    if (state.source && (docs[l.doc_id] || {}).source !== state.source) return false;
    if (state.factor && !l.serbia_factors.includes(state.factor)) return false;
    if (state.search) {
      const hay = HAY.get(l.id);
      return state.search.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
    }
    return true;
  }
  const filtered = () => ALL.filter(matches);

  function fillSelect(id, values, label) {
    const el = $(id);
    el.innerHTML = `<option value="">All</option>` + values.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("");
    el.setAttribute("aria-label", label);
  }

  function setupFilters() {
    const present = (key) => new Set(ALL.map((l) => l[key]));
    const themes = present("theme"), mats = present("maturity"), outs = present("outcome");
    fillSelect("f-theme", THEMES.filter((t) => themes.has(t)).map((t) => [t, LABELS.theme[t]]), "Theme");
    fillSelect("f-maturity", MATURITY.filter((m) => mats.has(m)).map((m) => [m, LABELS.maturity[m]]), "Maturity");
    fillSelect("f-outcome", OUTCOMES.filter((o) => outs.has(o)).map((o) => [o, LABELS.outcome[o]]), "Outcome");
    fillSelect("f-country", [...present("country")].map((c) => [c, countryName(c)]).sort((a, b) => a[1].localeCompare(b[1])), "Country");
    const sources = [...new Set(ALL.map((l) => (docs[l.doc_id] || {}).source))].filter(Boolean).sort();
    fillSelect("f-source", sources.map((s) => [s, s]), "Source");
    const factors = new Set(ALL.flatMap((l) => l.serbia_factors));
    fillSelect("f-factor", Object.entries(FACTORS).filter(([k]) => factors.has(k)), "Serbia factor");

    for (const key of ["theme", "maturity", "outcome", "country", "source", "factor"]) {
      $(`f-${key}`).addEventListener("change", (e) => { state[key] = e.target.value; render(); });
    }
    let timer;
    $("f-search").addEventListener("input", (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.search = e.target.value.trim(); render(); }, 150);
    });
    $("f-reset").addEventListener("click", () => {
      Object.assign(state, { search: "", theme: "", maturity: "", outcome: "", country: "", source: "", factor: "", km: null });
      $("filters").reset();
      render();
    });
  }

  // ---------- Header and key messages ----------
  function renderHeader() {
    const c = D.counts;
    const countries = new Set(ALL.map((l) => l.country)).size;
    $("stats").innerHTML = [
      ["Documents analysed", c.documents],
      ["Learnings kept", c.kept],
      ["Dropped by guillotine", c.dropped],
      ["Countries", countries],
    ].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${num.format(v)}</dd></div>`).join("");
    const asOf = new Date(D.as_of + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    $("as-of").textContent = `Data as of ${asOf}. ${c.found} learnings found; a learning is kept only if at least 2 of 5 Serbia factors match (${Object.values(FACTORS).join(", ")}).`;
    $("footer-docs").textContent = c.documents;
  }

  function renderKeyMessages() {
    $("key-messages").innerHTML = D.key_messages.map((m, i) => `
      <button type="button" class="km" data-km="${esc(m.id)}" aria-pressed="false">
        <span class="km-num">Message ${i + 1}</span>
        <p class="km-text">${esc(m.message)}</p>
        <span class="km-count">Based on ${m.learning_ids.length} learnings · show them</span>
      </button>`).join("");
    $("key-messages").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-km]");
      if (!btn) return;
      const m = D.key_messages.find((k) => k.id === btn.dataset.km);
      state.km = state.km && state.km.id === m.id ? null : m;
      render();
      if (state.km) $("filters-title").parentElement.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function renderFilterStatus(rows) {
    $("result-count").textContent = `Showing ${rows.length} of ${ALL.length} learnings`;
    document.querySelectorAll("[data-km]").forEach((b) => b.setAttribute("aria-pressed", String(!!state.km && b.dataset.km === state.km.id)));
    if (state.km) {
      const i = D.key_messages.indexOf(state.km) + 1;
      $("km-active").innerHTML = `<span class="km-chip">Key message ${i}<button type="button" aria-label="Clear key message filter">✕</button></span>`;
      $("km-active").querySelector("button").addEventListener("click", () => { state.km = null; render(); });
    } else {
      $("km-active").innerHTML = "";
    }
  }

  // ---------- Charts ----------
  Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  Chart.defaults.font.size = 12;
  const charts = {};

  // Paint the surface colour behind the chart so PNG exports are not transparent.
  const surfacePlugin = {
    id: "surface",
    beforeDraw(chart) {
      const { ctx, width, height } = chart;
      ctx.save();
      ctx.fillStyle = css("--surface");
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    },
  };
  // Value at the end of each bar (or stack), in text ink.
  const tipLabelPlugin = {
    id: "tipLabels",
    afterDatasetsDraw(chart, _args, opts) {
      if (!opts || !opts.format) return;
      const { ctx } = chart;
      const horizontal = chart.options.indexAxis === "y";
      ctx.save();
      ctx.fillStyle = css("--text-2");
      ctx.font = `12px ${Chart.defaults.font.family}`;
      chart.data.labels.forEach((_, i) => {
        let total = 0, end = null;
        chart.data.datasets.forEach((ds, di) => {
          if (!chart.isDatasetVisible(di) || !ds.data[i]) return;
          total += ds.data[i];
          end = chart.getDatasetMeta(di).data[i];
        });
        if (!end) return;
        if (horizontal) { ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(opts.format(total), end.x + 6, end.y); }
        else { ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(opts.format(total), end.x, end.y - 4); }
      });
      ctx.restore();
    },
  };
  const emptyPlugin = {
    id: "emptyState",
    afterDraw(chart) {
      const hasData = chart.data.datasets.some((ds) => ds.data.some((v) => v));
      if (hasData) return;
      const { ctx, width, height } = chart;
      ctx.save();
      ctx.fillStyle = css("--text-2");
      ctx.textAlign = "center";
      ctx.font = `13px ${Chart.defaults.font.family}`;
      ctx.fillText("Nothing to show for the current filters", width / 2, height / 2);
      ctx.restore();
    },
  };

  function baseOptions(horizontal) {
    const grid = { color: css("--grid"), lineWidth: 1 };
    const ticks = { color: css("--text-2") };
    const border = { color: css("--axis") };
    const value = { grid, ticks: { ...ticks, precision: 0 }, border: { display: false }, beginAtZero: true };
    const cat = { grid: { display: false }, ticks, border };
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      indexAxis: horizontal ? "y" : "x",
      layout: { padding: horizontal ? { right: 56 } : { top: 20 } },
      scales: horizontal ? { x: value, y: cat } : { x: cat, y: value },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: css("--surface"), titleColor: css("--text"), bodyColor: css("--text-2"),
          borderColor: css("--border"), borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true,
        },
      },
    };
  }

  function drawChart(key, config) {
    config.plugins = [surfacePlugin, tipLabelPlugin, emptyPlugin];
    if (charts[key]) {
      charts[key].data = config.data;
      charts[key].options = config.options;
      charts[key].update();
    } else {
      charts[key] = new Chart($(`chart-${key}`), config);
    }
  }

  function table(head, rows) {
    if (!rows.length) return '<p class="empty">No rows for the current filters.</p>';
    const th = head.map((h, i) => `<th${i ? ' class="num"' : ""}>${esc(h)}</th>`).join("");
    const tr = rows.map((r) => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ""}>${esc(c)}</td>`).join("")}</tr>`).join("");
    return `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
  }

  function spendByCountry(rows) {
    // Count each programme's reported figure once, even if several learnings cite it.
    const seen = new Set(), totals = {};
    for (const l of rows) {
      if (l.spend_eur == null) continue;
      const key = [l.country, l.programme || l.id, l.spend_reported, l.currency, l.spend_year].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      totals[l.country] = (totals[l.country] || 0) + l.spend_eur;
    }
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }

  function renderCharts(rows) {
    // Spend by country
    const spend = spendByCountry(rows);
    $("box-spend").style.height = `${Math.max(180, spend.length * 34 + 50)}px`;
    const spendOpts = baseOptions(true);
    spendOpts.scales.x.ticks = { color: css("--text-2"), callback: (v) => eurCompact.format(v), maxTicksLimit: 4, maxRotation: 0 };
    spendOpts.plugins.tooltip.callbacks = { label: (c) => ` ${eurFull.format(c.raw)}` };
    spendOpts.plugins.tipLabels = { format: (v) => eurCompact.format(v) };
    drawChart("spend", {
      type: "bar",
      data: {
        labels: spend.map(([c]) => countryName(c)),
        datasets: [{ label: "Reported spend (EUR)", data: spend.map(([, v]) => v), backgroundColor: css("--series-1"),
          borderRadius: 4, maxBarThickness: 24 }],
      },
      options: spendOpts,
    });
    const noSpend = rows.filter((l) => l.spend_reported == null).length;
    const unconverted = rows.filter((l) => l.spend_reported != null && l.spend_eur == null).length;
    $("spend-footnote").textContent = `${noSpend} of ${rows.length} learnings in view have no spend reported` +
      (unconverted ? `; ${unconverted} report spend in a currency/year with no FX rate` : "") +
      ". Each programme figure is counted once; figures mix public and total spend across different years.";
    $("table-spend").innerHTML = table(["Country", "Reported spend (EUR)"], spend.map(([c, v]) => [countryName(c), eurFull.format(v)]));

    // Learnings by theme, split by outcome (stacked). Rows stay fixed so bars don't jump as filters change.
    const themes = THEMES.filter((t) => ALL.some((l) => l.theme === t));
    const counts = Object.fromEntries(OUTCOMES.map((o) => [o, themes.map((t) => rows.filter((l) => l.theme === t && l.outcome === o).length)]));
    const themeOpts = baseOptions(true);
    themeOpts.scales.x.stacked = true;
    themeOpts.scales.y.stacked = true;
    themeOpts.plugins.legend = {
      display: true, position: "top", align: "start",
      labels: { color: css("--text-2"), usePointStyle: true, pointStyle: "rectRounded", boxWidth: 10, boxHeight: 10, padding: 14 },
    };
    themeOpts.plugins.tipLabels = { format: (v) => String(v) };
    const surface = css("--surface");
    drawChart("theme", {
      type: "bar",
      data: {
        labels: themes.map((t) => LABELS.theme[t]),
        datasets: OUTCOMES.map((o, di) => ({
          label: LABELS.outcome[o],
          data: counts[o],
          backgroundColor: css(`--${o}`),
          borderColor: surface,
          borderWidth: { right: 2 },
          borderSkipped: "start",
          maxBarThickness: 24,
          // Round only the outer end of each stack.
          borderRadius: (ctx) => {
            const i = ctx.dataIndex;
            const later = OUTCOMES.slice(di + 1).some((_, k) => ctx.chart.isDatasetVisible(di + 1 + k) && counts[OUTCOMES[di + 1 + k]][i] > 0);
            return later ? 0 : 4;
          },
        })),
      },
      options: themeOpts,
    });
    $("table-theme").innerHTML = table(["Theme", ...OUTCOMES.map((o) => LABELS.outcome[o]), "Total"],
      themes.map((t, i) => [LABELS.theme[t], ...OUTCOMES.map((o) => counts[o][i]), OUTCOMES.reduce((s, o) => s + counts[o][i], 0)]));

    // Maturity mix
    const mat = MATURITY.map((m) => rows.filter((l) => l.maturity === m).length);
    const matOpts = baseOptions(false);
    matOpts.plugins.tipLabels = { format: (v) => String(v) };
    drawChart("maturity", {
      type: "bar",
      data: {
        labels: MATURITY.map((m) => LABELS.maturity[m]),
        datasets: [{ label: "Learnings", data: mat, backgroundColor: css("--series-1"), borderRadius: 4, maxBarThickness: 48 }],
      },
      options: matOpts,
    });
    $("table-maturity").innerHTML = table(["Maturity", "Learnings"], MATURITY.map((m, i) => [LABELS.maturity[m], mat[i]]));
  }

  // ---------- Case cards ----------
  function spendText(l) {
    if (l.spend_reported == null) return '<span class="not-reported">Not reported</span>';
    const reported = `${num.format(l.spend_reported)} ${esc(l.currency)}${l.spend_year ? ", " + l.spend_year : ""}`;
    const scope = l.spend_scope && l.spend_scope !== "unclear" ? `${l.spend_scope} spend` : "scope unclear";
    if (l.spend_eur == null) return `<span class="spend">${reported}</span> (${scope}; no EUR rate)`;
    const eurPart = l.currency === "EUR" ? "" : ` ≈ ${eurCompact.format(l.spend_eur)}`;
    return `<span class="spend">${reported}</span>${eurPart} (${scope})`;
  }

  function cardHtml(l) {
    const doc = docs[l.doc_id] || {};
    const partners = (l.delivery_partners || []).length ? l.delivery_partners.join(", ") : "Not stated";
    return `
    <article class="panel card" id="card-${esc(l.id)}">
      <div class="card-tags">
        <span class="outcome"><span class="dot ${esc(l.outcome)}" aria-hidden="true"></span>${OUTCOME_ICON[l.outcome] || ""} ${esc(LABELS.outcome[l.outcome])}</span>
        <span class="tag">${esc(LABELS.theme[l.theme])}</span>
        <span class="tag">${esc(LABELS.maturity[l.maturity])}</span>
        <span class="tag">${esc(countryName(l.country))}</span>
      </div>
      <h3>${esc(l.title)}</h3>
      ${l.programme ? `<p class="programme">${esc(l.programme)}</p>` : ""}
      <dl>
        <div><dt>Problem</dt><dd>${esc(l.problem)}</dd></div>
        <div><dt>Solution</dt><dd>${esc(l.solution)}</dd></div>
        <div><dt>Cost and funding</dt><dd>${spendText(l)}${l.funding ? `<br>${esc(l.funding)}` : ""}</dd></div>
        <div><dt>Implementer and partners</dt><dd>${esc(l.implementer)}<br><span class="sub">Partners: ${esc(partners)}</span></dd></div>
        <div><dt>Results</dt><dd>${esc(l.results)}</dd></div>
      </dl>
      <div class="serbia">
        <h4>Relevance for Serbia</h4>
        <div class="factor-chips">${l.serbia_factors.map((f) => `<span class="factor">${esc(FACTORS[f] || f)}</span>`).join("")}</div>
        <p>${esc(l.serbia_reason)}</p>
        <p><b>Adapt:</b> ${esc(l.adapt_needed)}</p>
        <p><b>Blockers:</b> ${esc(l.blockers)}</p>
      </div>
      <details class="quote"><summary>Source quote</summary><blockquote>“${esc(l.quote)}”</blockquote></details>
      <div class="card-foot">
        <span>${esc(doc.source)} · ${esc(doc.year)} · p. ${esc(l.page)}</span>
        <a href="${esc(sourceHref(l))}" target="_blank" rel="noopener">Open source ↗</a>
        <span class="quality" title="${esc(QUALITY_TEXT[l.source_quality])}">Quality ${esc(l.source_quality)}</span>
        <button type="button" class="btn small" data-card-png="${esc(l.id)}" aria-label="Download card ${esc(l.title)} as PNG">PNG</button>
      </div>
    </article>`;
  }

  function renderCards(rows) {
    $("cards").innerHTML = rows.length ? rows.map(cardHtml).join("") : '<p class="empty">No learnings match the current filters.</p>';
  }

  // ---------- Programmes and sources ----------
  function renderProgrammes(rows) {
    const groups = new Map();
    for (const l of rows) {
      if (!l.programme) continue;
      const key = `${l.programme}|${l.country}|${l.doc_id}`;
      groups.set(key, { programme: l.programme, country: l.country, doc_id: l.doc_id, n: ((groups.get(key) || {}).n || 0) + 1 });
    }
    // Serbia first, then other countries alphabetically; most-cited programmes first within a country.
    const rank = (c) => (c === "RS" ? "0" : "1") + countryName(c);
    const list = [...groups.values()].sort((a, b) =>
      rank(a.country).localeCompare(rank(b.country)) || b.n - a.n || a.programme.localeCompare(b.programme));
    $("programmes").innerHTML = list.length ? `
      <thead><tr><th>Programme or policy</th><th>Country</th><th>Source document</th><th class="num">Learnings</th></tr></thead>
      <tbody>${list.map((g) => {
        const d = docs[g.doc_id] || {};
        return `<tr><td>${esc(g.programme)}</td><td>${esc(countryName(g.country))}</td>
          <td><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.title)}</a><br><span class="sub">${esc(d.source)}, ${esc(d.year)}</span></td>
          <td class="num">${g.n}</td></tr>`;
      }).join("")}</tbody>` : '<tbody><tr><td class="empty">No named programmes for the current filters.</td></tr></tbody>';
  }

  function renderSources() {
    const kept = (id) => ALL.filter((l) => l.doc_id === id).length;
    const list = [...D.documents].sort((a, b) => a.source.localeCompare(b.source) || b.year - a.year);
    $("sources").innerHTML = list.map((d) => `
      <li><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.title)}</a><br>
      <span class="meta">${esc(d.source)} · ${esc(d.year)} · Quality ${esc(d.source_quality)} · ${kept(d.doc_id)} learnings kept
      ${(d.countries_covered || []).length ? " · " + d.countries_covered.map(countryName).map(esc).join(", ") : ""}</span></li>`).join("");
  }

  // ---------- Export ----------
  function download(href, filename) {
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  function downloadCanvas(canvas, filename) {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      download(url, filename);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, "image/png");
  }
  async function snapshot(el, filename, background, button) {
    if (button) button.disabled = true;
    try {
      const canvas = await html2canvas(el, {
        backgroundColor: background, scale: Math.min(2, window.devicePixelRatio || 1) * (el.id === "main" ? 1 : 1.5),
        useCORS: true, logging: false,
        onclone: (doc) => {
          doc.body.classList.add("exporting");
          // html2canvas draws the contents of closed <details> anyway; drop them so the PNG matches the screen.
          doc.querySelectorAll("details:not([open])").forEach((d) =>
            [...d.children].filter((c) => c.tagName !== "SUMMARY").forEach((c) => c.remove()));
        },
      });
      downloadCanvas(canvas, filename);
    } catch (err) {
      console.warn("PNG export failed", err);
      alert("Sorry, the PNG export failed in this browser.");
    } finally {
      if (button) button.disabled = false;
    }
  }

  function csvCell(v) {
    if (v == null) return "";
    let s = Array.isArray(v) ? v.join("; ") : String(v);
    if (/^[=+@\t\r]/.test(s)) s = "'" + s; // keep spreadsheet apps from evaluating text as formulas
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function downloadCsv() {
    const cols = ["id", "title", "country", "programme", "theme", "maturity", "outcome", "problem", "solution", "implementer",
      "delivery_partners", "funding", "spend_reported", "currency", "spend_year", "spend_scope", "spend_eur", "results",
      "serbia_factors", "serbia_reason", "adapt_needed", "blockers", "source", "document", "year", "page", "source_url",
      "quote", "source_quality"];
    const rows = filtered().map((l) => {
      const d = docs[l.doc_id] || {};
      const rec = { ...l, source: d.source, document: d.title, year: d.year };
      return cols.map((c) => csvCell(rec[c])).join(",");
    });
    const csv = "﻿" + [cols.join(","), ...rows].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    download(url, `serbia-energy-learnings-${D.as_of}.csv`);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function setupExports() {
    document.querySelectorAll("[data-chart-png]").forEach((btn) => btn.addEventListener("click", () => {
      const key = btn.dataset.chartPng;
      download(charts[key].toBase64Image("image/png", 1), `serbia-energy-${key}-chart.png`);
    }));
    $("cards").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-card-png]");
      if (btn) snapshot($(`card-${btn.dataset.cardPng}`), `serbia-energy-${slug(btn.dataset.cardPng)}.png`, css("--surface"), btn);
    });
    $("export-page").addEventListener("click", (e) => snapshot($("main"), `serbia-energy-learnings-${D.as_of}.png`, css("--page"), e.currentTarget));
    $("download-csv").addEventListener("click", downloadCsv);
  }

  // ---------- Theme ----------
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const isDark = () => document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : darkQuery.matches;
  function syncThemeButton() { $("theme-toggle").textContent = isDark() ? "Light mode" : "Dark mode"; }
  function setupTheme() {
    syncThemeButton();
    $("theme-toggle").addEventListener("click", () => {
      const next = isDark() ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch (e) { /* storage unavailable: theme lasts this visit */ }
      syncThemeButton();
      renderCharts(filtered());
    });
    darkQuery.addEventListener("change", () => { syncThemeButton(); renderCharts(filtered()); });
  }

  // ---------- Render ----------
  function render() {
    const rows = filtered();
    renderFilterStatus(rows);
    renderCharts(rows);
    renderCards(rows);
    renderProgrammes(rows);
  }

  renderHeader();
  renderKeyMessages();
  setupFilters();
  setupExports();
  setupTheme();
  renderSources();
  render();
})();
