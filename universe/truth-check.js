/* Truth Check, browser edition. HumanCodex Federation.
 * Checks a claim against outside sources and scores how well they agree.
 *   1. Search Wikipedia and Crossref (free, no key) for passages about the claim.
 *   2. A model reads each passage and says SUPPORTS, CONTRADICTS or UNRELATED (the model comes from the caller).
 *   3. The percentage comes from how many independent sources agree, with a penalty for disagreement.
 * Honest limits: sources can be wrong or missing; the label says "supported by N sources", never "proven".
 * Without a model it lists the sources but does not score them. */
(function (root) {
  "use strict";
  var UA_NOTE = "NextXus-TruthCheck";
  function strip(h) { return String(h || "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#039;/g, "'").replace(/\s+/g, " ").trim(); }
  async function getJSON(url) { var r = await fetch(url); if (!r.ok) throw new Error("source " + r.status); return r.json(); }

  async function wikipedia(query, n) {
    var s = await getJSON("https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" + encodeURIComponent(query) + "&srlimit=" + n + "&format=json&origin=*");
    var hits = (s.query && s.query.search) || [];
    var out = [];
    for (var i = 0; i < hits.length; i++) {
      try {
        var t = hits[i].title;
        var e = await getJSON("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(t.replace(/ /g, "_")));
        if (e.extract) out.push({source: "Wikipedia", title: e.title || t, url: (e.content_urls && e.content_urls.desktop && e.content_urls.desktop.page) || ("https://en.wikipedia.org/wiki/" + encodeURIComponent(t.replace(/ /g, "_"))), text: e.extract.slice(0, 700)});
      } catch (err) { /* skip this page */ }
    }
    return out;
  }
  async function crossref(query, n) {
    var d = await getJSON("https://api.crossref.org/works?rows=" + n + "&select=title,abstract,URL,container-title,issued&query=" + encodeURIComponent(query));
    return ((d.message && d.message.items) || []).filter(function (x) { return x.title && x.title[0]; }).map(function (x) {
      var yr = x.issued && x.issued["date-parts"] && x.issued["date-parts"][0] && x.issued["date-parts"][0][0];
      return {source: "Crossref paper" + (yr ? " (" + yr + ")" : ""), title: x.title[0], url: x.URL, text: strip(x.abstract) || ("Paper titled: " + x.title[0] + (x["container-title"] && x["container-title"][0] ? ", in " + x["container-title"][0] : ""))};
    });
  }

  function extractJSON(t) {
    t = String(t || "").replace(/```(?:json)?/gi, "");
    var a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a < 0 || b < a) throw new Error("model did not return JSON");
    return JSON.parse(t.slice(a, b + 1));
  }

  /* ask(messages, opts) -> Promise<string>; supplied by the page (visitor key) or server (free quota) */
  async function check(claim, ask, opts) {
    opts = opts || {};
    claim = String(claim || "").trim();
    if (!claim) throw new Error("claim is empty");
    var steps = [];
    var query = claim.replace(/[?!.]+$/g, "").slice(0, 200);
    var found = [];
    var res = await Promise.allSettled([wikipedia(query, 4), crossref(query, 4)]);
    res.forEach(function (r, i) { if (r.status === "fulfilled") found = found.concat(r.value); else steps.push((i ? "Crossref" : "Wikipedia") + " unreachable: " + r.reason.message); });
    var seen = {}; found = found.filter(function (s) { if (seen[s.url]) return false; seen[s.url] = 1; return true; }).slice(0, 8);
    var out = {claim: claim, sources: found, notes: steps, scored: false, supports: 0, contradicts: 0, unrelated: 0, percent: null, label: "", engine: ask ? "model" : "none"};
    if (!found.length) { out.label = "UNVERIFIED: no sources found for this claim"; return out; }
    if (!ask) { out.label = "SOURCES LISTED, NOT SCORED: add a key to have a model judge them"; return out; }

    var list = found.map(function (s, i) { return "[" + (i + 1) + "] " + s.source + " | " + s.title + "\n" + s.text; }).join("\n\n");
    var prompt = "CLAIM: " + claim + "\n\nSOURCES:\n" + list + "\n\n" +
      "For each source decide whether it SUPPORTS the claim, CONTRADICTS it, or is UNRELATED (does not address it). " +
      "Judge only what the source text itself says. Do not use outside knowledge. If the claim is a question, treat it as the claim that its most direct answer is true. " +
      'Reply with JSON only, no other text: {"verdicts":[{"n":1,"v":"SUPPORTS|CONTRADICTS|UNRELATED","why":"short quote or reason"}]}';
    var raw = await ask([{role: "system", content: "You are a careful fact-checker. You judge only from the supplied sources and answer in strict JSON."}, {role: "user", content: prompt}], {temperature: 0, maxTokens: 900});
    var j = extractJSON(raw), vs = (j.verdicts || []);
    var wsum = 0;
    found.forEach(function (s, i) {
      var v = vs.filter(function (x) { return Number(x.n) === i + 1; })[0];
      var verdict = v && /^(SUPPORTS|CONTRADICTS|UNRELATED)$/i.test(v.v) ? v.v.toUpperCase() : "UNRELATED";
      s.verdict = verdict; s.why = v && v.why ? String(v.why).slice(0, 200) : "";
      if (verdict === "SUPPORTS") out.supports++; else if (verdict === "CONTRADICTS") out.contradicts++; else out.unrelated++;
    });
    out.scored = true;
    var judged = out.supports + out.contradicts;
    if (!judged) { out.percent = null; out.label = "UNVERIFIED: no source addresses this claim (" + found.length + " found, all unrelated)"; return out; }
    /* share of relevant sources that agree, pulled toward 50 when few sources judged (Laplace-style smoothing) */
    var p = (out.supports + 1) / (judged + 2);
    out.percent = Math.round(p * 100);
    var tone = out.contradicts && out.supports ? "DISPUTED" : (out.supports ? "SUPPORTED" : "CONTRADICTED");
    out.label = tone + ": " + out.supports + " of " + judged + " relevant source" + (judged === 1 ? "" : "s") + " support it" + (out.contradicts ? ", " + out.contradicts + " contradict" : "") + ". This is agreement among sources, not proof.";
    return out;
  }

  var api = {check: check, wikipedia: wikipedia, crossref: crossref, extractJSON: extractJSON};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.NXTruthCheck = api;
})(typeof window !== "undefined" ? window : globalThis);
