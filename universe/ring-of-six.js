/* Ring of Six, browser edition. HumanCodex Federation.
 * Port of the Ring of Six middleware (Python) to plain JavaScript so it runs in the
 * visitor's browser. No server, no Federation key. With no key it runs the five
 * built-in heuristic lenses. With the visitor's own key (the page's API Settings box)
 * each lens is answered by the visitor's model, then audited here.
 *
 * Honest limits: the percentage is a TEXT-GROUNDING score. It reads HOW a text claims
 * (labels, anchors, hedges, manipulation markers), not WHETHER a claim is true.
 * The keyword engine is capped at 90%, so it can never pass the 95% Truth Gate alone.
 * Lens order: Mind, Heart, Hands, Legs, Eyes, then the Truth Agent (the Spine).
 */
(function (root) {
  "use strict";

  var TRUTH_GATE = 0.95;
  var CAP = 0.90, CONFLICT_THRESHOLD = 0.55, CONFLICT_MIN_CONF = 0.5, CONFLICT_PENALTY = 0.05;
  var CLASSES = ["FACT", "INFERENCE", "ASSUMPTION", "UNKNOWN"];

  var DIR = {"DIR-000":"THE 95% TRUTH GATE","DIR-001":"TRUTH OVER COMFORT","DIR-002":"NEVER TREAT ASSUMPTIONS AS FACTS","DIR-057":"RADICAL TRANSPARENCY","DIR-017":"SEEK DISCONFIRMING EVIDENCE","DIR-019":"DETECT COGNITIVE BIAS","DIR-021":"TRACE THE RIPPLE","DIR-055":"DETERMINISTIC VERIFICATION","DIR-007":"GENTLE HONESTY","DIR-011":"FEELINGS ARE DATA","DIR-042":"WITNESS THE GRIEF","DIR-044":"BOUNDARIED LOVE","DIR-016":"MAP BEFORE ACTING","DIR-036":"FEED THE ROOTS","DIR-052":"EXTEND, DON\u2019T INVENT","DIR-054":"TEST IN SMALL BATCHES","DIR-027":"THE POWER OF MANY","DIR-064":"THE LONG GAME","DIR-067":"KNOWLEDGE MESH","DIR-018":"ISOLATE THE SIGNAL","DIR-028":"CONSENT IS SACRED","DIR-035":"QUESTION THE FRAME","DIR-056":"ANTI-CAPTURE DESIGN"};

  var LENS_KEYS = ["mind", "heart", "hands", "legs", "eyes"];
  var LENSES = {
    mind: {name: "Mind", body_part: "Head", symbol: "\uD83E\uDDE0", role: "Science, logic, systems thinking, evidence-based analysis.",
      anchors: ["DIR-017","DIR-019","DIR-021","DIR-055"],
      focus: "data evidence logic logical system systems science scientific test tested measure measured study research analysis analyze cause causes because proof prove hypothesis model math statistics experiment reason why how results".split(" ")},
    heart: {name: "Heart", body_part: "Heart", symbol: "\u2764\uFE0F", role: "Human response, emotion, empathy, ethics, values.",
      anchors: ["DIR-007","DIR-011","DIR-042","DIR-044"],
      focus: "feel feeling feelings love fear afraid hurt grief care kind kindness empathy ethics ethical value values lonely hope trust harm pain sad joy compassion fair dignity respect happy angry worried heart emotion emotional".split(" ")},
    hands: {name: "Hands", body_part: "Hands", symbol: "\u270B", role: "Building, creating, executing, practical construction.",
      anchors: ["DIR-016","DIR-036","DIR-052","DIR-054"],
      focus: "build building make create code fix launch ship deploy construct design tool tools plan execute implement write craft repair budget cost steps step task app site product prototype garden install".split(" ")},
    legs: {name: "Legs", body_part: "Legs", symbol: "\uD83E\uDDB5", role: "Context, lived experience, the past, other people, movement and direction.",
      anchors: ["DIR-021","DIR-027","DIR-064","DIR-067"],
      focus: "history past before experience lived tradition community people others customer customers users family generation generations move next direction path journey context years ago background neighbors friends team grandfather mother father".split(" ")},
    eyes: {name: "Eyes", body_part: "Eyes", symbol: "\uD83D\uDC41\uFE0F", role: "Observation, discernment, general ethics, witnessing what is actually there.",
      anchors: ["DIR-018","DIR-028","DIR-035","DIR-056"],
      focus: "see seen observe observed notice watch look witness actually really visible honest honesty consent privacy manipulate manipulation transparent discern pattern signal noise frame ethics fair".split(" ")}
  };
  var TRUTH_AGENT = {name: "Truth Agent", body_part: "Spine", symbol: "\u2696\uFE0F"};

  var POSITIVE = ["love","hope","joy","care","kind","kindness","happy","proud","trust","compassion","grateful","help","helping","dignity","respect","heal"];
  var STRAIN = ["fear","afraid","hurt","grief","harm","pain","sad","lonely","angry","rage","desperate","ashamed","worried","abuse","exploit","cruel","suffer","suffering","scared","anxious"];

  var WORD_PAT = /[a-z][a-z'\-]*/g;
  var BLOCKER_PAT = /\b(can'?t|cannot|broken|stuck|impossible|blocked|no (?:money|budget|time|funds)|out of (?:money|funds|time))\b/gi;
  var URGENCY_PAT = /\b(now|immediately|today|tonight|urgent|asap|hurry|right away)\b/gi;
  var NOVELTY_PAT = /\b(never been done|untested|first time|brand new|unproven)\b/gi;
  var CONSENT_PAT = /\b(without (?:their |his |her |anyone'?s )?(?:consent|permission|knowing)|secretly|behind (?:their|his|her) back|spy|spying|track(?:ing)? (?:them|users|people)|hide it|deceive|trick them)\b/gi;
  var PROCEED_PAT = /\b(proceed|recommend(?:ed)?|support(?:s|ed)?|go ahead|viable|sound|benefit|worth doing|yes)\b/gi;
  var CAUTION_PAT = /\b(caution|risk|risky|harm|stop|pause|wait|unsafe|danger|dangerous|avoid|do not|don'?t|concern|verify first|no)\b/gi;

  var UNKNOWN_PAT = /\b(i don'?t know|i do not know|unknown|cannot (?:be )?(?:verify|verified|determine|confirm)|can'?t (?:verify|determine|confirm)|unable to (?:verify|determine|confirm)|no (?:reliable )?data|not enough (?:information|data)|insufficient (?:information|data|evidence)|no way to know|unverified|unclear)\b/i;
  var ASSUMPTION_PAT = /\b(assum(?:e|es|ed|ing|ption)|presum(?:ably|e|ing)|suppos(?:e|ing|edly)|hypothetical(?:ly)?|let'?s say|if we (?:take|say|accept)|taking for granted|speculat(?:e|ive|ion|ing)|conjectur\w*)\b/i;
  var HEDGE_PAT = /\b(likely|unlikely|probabl[ey]|suggests?|indicates?|appears?|seems?|may|might|could|possibly|perhaps|i think|i believe|in my (?:view|opinion)|estimated?|roughly|tends? to|implies|it is plausible|plausibl[ey]|arguably)\b/i;
  var ANCHOR_PAT = /(https?:\/\/\S+|\[\d+\]|\baccording to\b|\bsource[s]?:|\bcited\b|\bdocumented\b|\bmeasured\b|\b(?:19|20)\d{2}\b|\b\d+(?:[.,]\d+)?\s?(?:%|percent|km|kg|mb|gb|tb|ms|usd|\$)|\$\s?\d|\b\d+(?:\.\d+)?\b)/i;
  var MANIP_PAT = /\b(act now|limited time|guaranteed|trust me|everyone knows|don'?t miss out|they don'?t want you to know|100% (?:sure|certain|guaranteed)|absolutely certain|no doubt about it|you must buy|once in a lifetime|risk[- ]free)\b/gi;
  var LABEL_PAT = /^\s*[\-\*\u2022]?\s*\**\s*\[?(FACT|INFERENCE|ASSUMPTION|SPECULATION|UNKNOWN)\]?\**\s*[:\-\]]/i;
  var TAG_PAT = /\s*\[OMEGA:[A-Z]+\|\d\.\d{2}\]\s*$/;
  var ASSUMPTION_LABEL_PAT = /^\s*[\-\*\u2022]?\s*\**\s*\[?(ASSUMPTION|SPECULATION)\]?\**\s*[:\-\]]/i;
  var EMOTIONAL = ["feel","fear","love","hate","angry","hope","desperate","excited","worried","believe","trust","afraid","lonely","proud","ashamed","hurt","joy","grief","rage"];
  var SLAVERY_PHRASES = ["artificial scarcity","exclusive access","limited time","act now","only for members","pay to access","subscription required","gatekeep","paywall","2% control","paper-chase","paper chasing"];

  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function allMatches(re, text) { var out = [], m; re.lastIndex = 0; while ((m = re.exec(text || "")) !== null) { out.push(m[0].toLowerCase()); if (m[0] === "") re.lastIndex++; } return out; }
  function uniqSorted(a) { return Array.from(new Set(a)).sort(); }
  function pyRound(x, n) { var f = Math.pow(10, n); var r = Math.round(x * f) / f; if (Math.abs(x * f - Math.trunc(x * f)) === 0.5) { var t = Math.trunc(x * f); r = (t % 2 === 0 ? t : t + Math.sign(x)) / f; } return r; }
  function clamp(x, lo, hi) { lo = lo === undefined ? -1 : lo; hi = hi === undefined ? 1 : hi; return Math.max(lo, Math.min(hi, x)); }

  /* ---------- Agent Zero: text epistemic auditor ---------- */
  function nexusAlignment(cls, conf) {
    if (cls === "FACT" && conf >= 0.75) return 1.0;
    if (cls === "INFERENCE" || cls === "ASSUMPTION") return 0.5;
    return 0.25;
  }
  function emotionalDensity(text) {
    var words = (text || "").match(/\b\w+\b/g) || [];
    if (!words.length) return 0.0;
    var n = 0; for (var i = 0; i < words.length; i++) if (EMOTIONAL.indexOf(words[i].toLowerCase()) >= 0) n++;
    return Math.min(1.0, n / words.length);
  }
  function checkSlavery(text) {
    var flags = SLAVERY_PHRASES.filter(function (p) { return new RegExp("(?<!\\w)" + esc(p) + "(?!\\w)", "i").test(text || ""); });
    return {slavery_check: flags.length > 0, flags: flags};
  }
  function splitSentences(text) {
    text = (text || "").replace(TAG_PAT, "");
    var parts = [];
    text.split(/\r?\n/).forEach(function (line) {
      line = line.trim(); if (!line) return;
      line.split(/(?<=[.!?])\s+(?=[A-Z0-9"'\[\(\-\*])/).forEach(function (s) {
        s = s.trim();
        if ((s.match(/\w+/g) || []).length >= 2) parts.push(s);
      });
    });
    return parts;
  }
  function classifySentence(s) {
    var m = LABEL_PAT.exec(s);
    if (m) { var lab = m[1].toUpperCase(); return [lab === "SPECULATION" ? "ASSUMPTION" : lab, 1.0]; }
    if (UNKNOWN_PAT.test(s)) return ["UNKNOWN", 1.0];
    if (ASSUMPTION_PAT.test(s)) return ["ASSUMPTION", 1.0];
    if (HEDGE_PAT.test(s)) return ["INFERENCE", 1.0];
    if (s.replace(/\s+$/, "").slice(-1) === "?") return ["UNKNOWN", 0.5];
    if (ANCHOR_PAT.test(s)) return ["FACT", 1.0];
    return ["FACT", 0.5];
  }
  function truthGate(cls, conf) { return (cls === "FACT" && conf >= TRUTH_GATE) ? "PASS" : "BELOW_GATE"; }
  function audit(text) {
    var sentences = splitSentences(text);
    var manip = uniqSorted(allMatches(MANIP_PAT, text));
    var ed = emotionalDensity(text), sl = checkSlavery(text);
    if (!sentences.length) {
      return {classification: "UNKNOWN", confidence: 0.5, sentences: 0, truth_gate: "BELOW_GATE", NEXUS_ALIGNMENT: nexusAlignment("UNKNOWN", 0.5),
        emotional_density: ed, slavery_check: sl.slavery_check, flags: sl.flags, shares: {FACT: 0, INFERENCE: 0, ASSUMPTION: 0, UNKNOWN: 0},
        manipulation_flags: manip, per_sentence: [], method: "text-heuristic"};
    }
    var weights = {FACT: 0, INFERENCE: 0, ASSUMPTION: 0, UNKNOWN: 0}, per = [];
    sentences.forEach(function (s) { var r = classifySentence(s); weights[r[0]] += r[1]; per.push({text: s.slice(0, 120), "class": r[0], weight: r[1]}); });
    var n = sentences.length, shares = {};
    CLASSES.forEach(function (c) { shares[c] = weights[c] / n; });
    var cls;
    if (shares.UNKNOWN >= 0.3) cls = "UNKNOWN";
    else if (shares.ASSUMPTION >= 0.25) cls = "ASSUMPTION";
    else if (shares.INFERENCE >= 0.25) cls = "INFERENCE";
    else if (shares.FACT >= 0.5) cls = "FACT";
    else cls = CLASSES.reduce(function (a, c) { return shares[c] > shares[a] ? c : a; }, CLASSES[0]);
    var conf = cls === "FACT" ? shares[cls] : Math.max(shares[cls], 1.0 - shares.FACT);
    conf = Math.min(0.99, conf);
    conf *= (1.0 - 0.15 * manip.length);
    conf = Math.max(0.05, pyRound(conf, 2));
    var rs = {}; CLASSES.forEach(function (c) { rs[c] = pyRound(shares[c], 3); });
    return {classification: cls, confidence: conf, sentences: n, truth_gate: truthGate(cls, conf), NEXUS_ALIGNMENT: nexusAlignment(cls, conf),
      emotional_density: ed, slavery_check: sl.slavery_check, flags: sl.flags, shares: rs, manipulation_flags: manip, per_sentence: per, method: "text-heuristic"};
  }
  function checkCompliance(text) {
    var v = [];
    if (!(text || "").trim()) { v.push({code: "DIR-057", reason: "empty perspective"}); return [false, v]; }
    var manip = uniqSorted(allMatches(MANIP_PAT, text));
    if (manip.length) v.push({code: "DIR-057", reason: "manipulation markers: " + manip.join(", ")});
    var cap = checkSlavery(text).flags;
    if (cap.length) v.push({code: "DIR-056", reason: "capture markers: " + cap.join(", ")});
    var ss = splitSentences(text);
    for (var i = 0; i < ss.length; i++) {
      if (ASSUMPTION_PAT.test(ss[i]) && !ASSUMPTION_LABEL_PAT.test(ss[i])) { v.push({code: "DIR-002", reason: "unlabeled assumption: " + ss[i].slice(0, 80)}); break; }
    }
    return [v.length === 0, v];
  }
  function verifyRing(overall, cls, compliance, slavery) {
    var failed = Object.keys(compliance).filter(function (k) { return !compliance[k]; });
    var gate = truthGate(cls, overall), reasons = [], verdict;
    if (failed.length) reasons.push("directive violations in: " + failed.join(", "));
    if (slavery) { reasons.push("capture / scarcity language detected (slavery_check)"); gate = "BELOW_GATE"; }
    if (failed.length) { gate = "BELOW_GATE"; verdict = "BLOCKED"; }
    else if (gate === "PASS") verdict = "VERIFIED";
    else { verdict = "LABELED"; reasons.push("below the 95% Truth Gate (DIR-000): " + cls + " at " + overall.toFixed(2)); }
    return {verdict: verdict, truth_gate: gate, reasons: reasons};
  }

  /* ---------- signals and heuristic lenses ---------- */
  function textStance(text) {
    var p = (text.match(PROCEED_PAT) || []).length, c = (text.match(CAUTION_PAT) || []).length;
    return (p + c) ? pyRound((p - c) / (p + c), 3) : 0.0;
  }
  function signals(prompt) {
    var words = prompt.toLowerCase().match(WORD_PAT) || [];
    var set = {}; words.forEach(function (w) { set[w] = 1; });
    var a = audit(prompt), ps = a.per_sentence;
    function inter(list) { return list.filter(function (w) { return set[w]; }).sort(); }
    return {
      set: set, audit: a, sentences: a.sentences,
      anchored: ps.filter(function (s) { return s["class"] === "FACT" && s.weight === 1.0; }).length,
      hedged: ps.filter(function (s) { return s["class"] === "INFERENCE"; }).length,
      unsettled: ps.filter(function (s) { return (s["class"] === "UNKNOWN" || s["class"] === "ASSUMPTION") && s.weight === 1.0; }).length,
      questions: ps.filter(function (s) { return s.text.replace(/\s+$/, "").slice(-1) === "?"; }).length,
      positive: inter(POSITIVE), strain: inter(STRAIN),
      blockers: uniqSorted(allMatches(BLOCKER_PAT, prompt)), urgency: uniqSorted(allMatches(URGENCY_PAT, prompt)),
      novelty: uniqSorted(allMatches(NOVELTY_PAT, prompt)), consent: uniqSorted(allMatches(CONSENT_PAT, prompt)),
      manipulation: a.manipulation_flags, slavery: a.flags, emotional_density: a.emotional_density
    };
  }
  function focusTerms(spec, sig) { return spec.focus.filter(function (k) { return sig.set[k]; }).sort(); }
  function conf(hits) { return pyRound(Math.min(CAP, 0.45 + 0.08 * Math.min(hits, 5)), 2); }
  function list(a) { return a.length ? a.join(", ") : "none"; }

  var HEUR = {
    mind: function (sig, t) {
      var a = sig.anchored, h = sig.hedged, u = sig.unsettled, st;
      var L = ["FACT: Mind focus terms present: " + list(t) + ".",
        "FACT: Sentences read: " + sig.sentences + "; anchored claims: " + a + "; hedged: " + h + "; unknown or unverified premises: " + u + "; questions asked: " + sig.questions + "."];
      if (a && !u) { st = 0.5; L.push("INFERENCE: The claims carry checkable anchors, so the logic can be tested against them."); }
      else if (a && u) { st = 0.0; L.push("INFERENCE: Some claims carry anchors and some rest on unknowns; test the anchored part first."); }
      else if (u) { st = -0.5; L.push("INFERENCE: The reasoning rests on unknowns or unverified premises; it is not yet testable."); }
      else { st = -0.1; L.push("INFERENCE: No evidence is offered yet; frame the question as a testable hypothesis first."); }
      st -= 0.3 * sig.manipulation.length;
      L.push("NEXT: State what result would change the conclusion, then look for it (DIR-017).");
      return [clamp(st), conf(t.length + a), "INFERENCE", L];
    },
    heart: function (sig, t) {
      var pos = sig.positive, neg = sig.strain, st;
      var L = ["FACT: Heart focus terms present: " + list(t) + ".",
        "FACT: Care words named: " + list(pos) + "; strain words named: " + list(neg) + ".",
        "FACT: Emotional density of the prompt: " + sig.emotional_density.toFixed(2) + "."];
      if (!pos.length && !neg.length) { st = 0.2; L.push("INFERENCE: No feeling is named; the human stake still has to be asked about (DIR-011)."); }
      else {
        st = (pos.length - 1.5 * neg.length) / (pos.length + neg.length);
        if (pos.length && neg.length) L.push("INFERENCE: Care and strain are both present; name each one precisely before acting (DIR-015).");
        else if (neg.length) L.push("INFERENCE: There is pain or a risk of harm here; witness it before trying to fix it (DIR-042).");
        else L.push("INFERENCE: The human stake reads as care-driven; deliver the truth gently (DIR-007).");
      }
      return [clamp(st), conf(t.length), "INFERENCE", L];
    },
    hands: function (sig, t) {
      var b = sig.blockers;
      var L = ["FACT: Build terms present: " + list(t) + ".", "FACT: Blockers named: " + list(b) + "."];
      var st = 0.1 + 0.3 * t.length - 0.4 * b.length;
      if (t.length && !b.length) L.push("INFERENCE: There is buildable work here; map it, then test it in a small, reversible batch (DIR-016, DIR-054).");
      else if (b.length) L.push("INFERENCE: The blockers come first; extend what already exists rather than start over (DIR-052).");
      else L.push("INFERENCE: No concrete build is named yet; the first practical step is to define the smallest working piece.");
      return [clamp(st), conf(t.length + b.length), "INFERENCE", L];
    },
    legs: function (sig, t) {
      var urg = sig.urgency, nov = sig.novelty;
      var L = ["FACT: Context terms present: " + list(t) + ".", "FACT: Urgency markers: " + list(urg) + "; novelty markers: " + list(nov) + "."];
      var st = 0.1 + 0.2 * t.length - 0.25 * urg.length - 0.3 * nov.length;
      if (t.length) L.push("INFERENCE: The prompt is grounded in people or past experience; carry that forward and trace the ripple (DIR-021).");
      else L.push("INFERENCE: No history or affected people are named; ask who walked this road before and who it touches next (DIR-027).");
      if (urg.length) L.push("INFERENCE: Urgency is pulling ahead of the map; movement without direction drifts (DIR-064).");
      return [clamp(st), conf(t.length + urg.length + nov.length), "INFERENCE", L];
    },
    eyes: function (sig, t) {
      var slav = sig.slavery, manip = sig.manipulation, consent = sig.consent;
      var pressure = uniqSorted(manip.filter(function (x) { return slav.indexOf(x) < 0; }));
      var issues = slav.length + pressure.length + consent.length;
      var L = ["FACT: Observation terms present: " + list(t) + ".",
        "FACT: Observed in the prompt: " + slav.length + " capture or scarcity marker(s), " + pressure.length + " other pressure marker(s), " + consent.length + " consent or privacy risk(s)."];
      var st = 0.2 + 0.1 * t.length - 0.5 * issues;
      if (slav.length || pressure.length) L.push("INFERENCE: What is actually there includes pressure or control language; separate the signal from the noise before judging (DIR-018, DIR-056).");
      if (consent.length) L.push("INFERENCE: Consent or privacy is in question here; consent must be explicit and revocable, never taken from silence (DIR-028).");
      if (!issues) L.push("INFERENCE: Nothing in the wording works against the reader; the frame reads as honest so far (DIR-035).");
      return [clamp(st), conf(t.length + 2 * issues), "INFERENCE", L];
    }
  };

  function anchorTitles(spec) { return spec.anchors.map(function (c) { return c + " " + DIR[c]; }); }
  function systemPrompt(spec) {
    var N = spec.name.toUpperCase();
    return "ROLE: " + N + " LENS (" + spec.body_part + ") of the HumanCodex Ring of Six.\n" +
      "FUNCTION: " + spec.role + "\n" +
      "ANCHOR DIRECTIVES: " + anchorTitles(spec).join("; ") + "\n" +
      "OUTPUT: start with [" + N + " PERSPECTIVE]. Label every line FACT:, INFERENCE:, ASSUMPTION: or UNKNOWN:. " +
      "No manipulation, no scarcity pressure, no unlabeled assumptions. Keep it under 120 words. " +
      "Speak only from this lens; the other four lenses speak for themselves.";
  }

  /* ---------- conflicts ---------- */
  function agreement(a, b) { return pyRound(1.0 - Math.abs(a - b) / 2.0, 3); }
  function hint(pair) {
    var k = pair.slice().sort().join("+");
    if (k === "hands+heart") return "Stabilize before strategizing and test in a small, reversible batch (DIR-048, DIR-054).";
    if (k === "heart+mind") return "Hold both: feelings are data, evidence is data (DIR-011, DIR-043).";
    if (pair.indexOf("eyes") >= 0) return "Question the frame and isolate the signal before deciding (DIR-035, DIR-018).";
    if (pair.indexOf("legs") >= 0) return "Trace the ripple across people and time before moving (DIR-021, DIR-064).";
    return "Conflicting truths can coexist; preserve both and seek alignment over agreement (DIR-043, DIR-029).";
  }
  function detectConflicts(view) {
    var keys = Object.keys(view), out = [];
    for (var i = 0; i < keys.length; i++) for (var j = i + 1; j < keys.length; j++) {
      var a = keys[i], b = keys[j], la = view[a], lb = view[b], sc = agreement(la.stance, lb.stance);
      if (sc >= CONFLICT_THRESHOLD) continue;
      if (Math.min(la.confidence, lb.confidence) < CONFLICT_MIN_CONF) continue;
      var sev = pyRound((1.0 - sc) * Math.min(la.confidence, lb.confidence), 3);
      var st = {}; st[a] = la.stance; st[b] = lb.stance;
      out.push({lenses: [a, b], agreement: sc, stances: st, severity: sev, level: sev >= 0.4 ? "high" : "moderate", resolution_hint: hint([a, b])});
    }
    return out.sort(function (x, y) { return y.severity - x.severity; });
  }

  /* ---------- one lens ---------- */
  async function runLens(key, prompt, sig, engine) {
    var spec = LENSES[key], t0 = Date.now(), terms = focusTerms(spec, sig), text = null, stance = null, engineName = "heuristic", meta = {};
    if (engine) {
      try {
        var out = await engine({key: key, name: spec.name, system: systemPrompt(spec)}, prompt);
        text = typeof out === "string" ? out : String((out && out.text) || "");
        if (!text.trim()) throw new Error("empty reply");
        engineName = "engine";
      } catch (e) { meta.engine_error = String((e && e.message) || e); text = null; }
    }
    var perspective, confidence, classification;
    if (text !== null) {
      var au = audit(text); confidence = au.confidence; classification = au.classification; stance = textStance(text); perspective = text;
    } else {
      var r = HEUR[key](sig, terms);
      stance = r[0]; confidence = r[1]; classification = r[2];
      r[3].push("ANCHORS: " + anchorTitles(spec).join("; ") + ".");
      perspective = "[" + spec.name.toUpperCase() + " PERSPECTIVE | " + spec.body_part + "]\n" + r[3].join("\n");
    }
    var cc = checkCompliance(perspective);
    if (!cc[0]) confidence = Math.min(confidence, 0.5);
    return {lens: key, name: spec.name, body_part: spec.body_part, symbol: spec.symbol, perspective: perspective,
      confidence: pyRound(confidence, 2), directive_compliance: cc[0], stance: pyRound(stance, 3), classification: classification,
      focus_terms: terms, anchor_directives: spec.anchors.slice(), directive_violations: cc[1], engine: engineName,
      processing_time_ms: Date.now() - t0, metadata: meta};
  }

  /* ---------- the ring ---------- */
  async function analyze(prompt, opts) {
    opts = opts || {};
    if (typeof prompt !== "string" || !prompt.trim()) throw new Error("prompt must be a non-empty string");
    var started = Date.now(), sig = signals(prompt), engine = opts.engine || null;
    var results = await Promise.all(LENS_KEYS.map(function (k) { return runLens(k, prompt, sig, engine); }));
    var lenses = {}; results.forEach(function (r) { lenses[r.lens] = r; });
    var view = {}; LENS_KEYS.forEach(function (k) { view[k] = {stance: lenses[k].stance, confidence: lenses[k].confidence}; });
    var conflicts = detectConflicts(view);
    var lensFlags = []; LENS_KEYS.forEach(function (k) { checkSlavery(lenses[k].perspective).flags.forEach(function (f) { lensFlags.push(f); }); });
    var slaveryFlags = uniqSorted(sig.slavery.concat(lensFlags)), slavery = slaveryFlags.length > 0;

    var scores = {}, total = 0;
    LENS_KEYS.forEach(function (k) { scores[k] = lenses[k].directive_compliance ? lenses[k].confidence : 0.0; total += scores[k]; });
    var weights = {}; LENS_KEYS.forEach(function (k) { weights[k] = total ? scores[k] / total : 0.0; });
    var overall = 0; LENS_KEYS.forEach(function (k) { overall += weights[k] * lenses[k].confidence; });
    overall *= Math.max(0.0, 1.0 - CONFLICT_PENALTY * conflicts.length);
    if (slavery) overall = Math.min(overall, 0.5);
    overall = pyRound(Math.max(0.0, overall), 2);

    var classes = {}; LENS_KEYS.forEach(function (k) { if (weights[k] > 0) classes[lenses[k].classification] = 1; });
    classes[sig.audit.classification] = 1;
    var classification = ["UNKNOWN", "ASSUMPTION", "INFERENCE", "FACT"].filter(function (c) { return classes[c]; })[0];
    var compliance = {}; LENS_KEYS.forEach(function (k) { compliance[k] = lenses[k].directive_compliance; });
    var verdict = verifyRing(overall, classification, compliance, slavery);

    var stance = 0; LENS_KEYS.forEach(function (k) { stance += weights[k] * lenses[k].stance; }); stance = pyRound(stance, 3);
    var high = conflicts.some(function (c) { return c.level === "high"; }), rec;
    if (slavery) rec = "REFRAME";
    else if (!LENS_KEYS.some(function (k) { return weights[k]; })) rec = "PAUSE_AND_VERIFY";
    else if (stance >= 0.35 && !high) rec = "PROCEED";
    else if (stance >= 0.0) rec = "PROCEED_WITH_CAUTION";
    else if (stance >= -0.35) rec = "PAUSE_AND_VERIFY";
    else rec = "DO_NOT_PROCEED";

    return {ring: "Ring of Six", version: "1.0.0-browser", prompt: prompt, engine: engine ? "engine" : "heuristic",
      lenses: lenses, lens_order: LENS_KEYS.slice(), truth_agent: {accuracy_weights: weights, overall_confidence: overall, truth_gate: verdict.truth_gate, symbol: TRUTH_AGENT.symbol, name: TRUTH_AGENT.name},
      conflicts: conflicts, classification: classification, NEXUS_ALIGNMENT: nexusAlignment(classification, overall),
      slavery_check: slavery, slavery_flags: slaveryFlags, truth_gate: verdict.truth_gate, truth_gate_threshold: TRUTH_GATE,
      overall_confidence: overall, truth_percent: Math.round(overall * 100), recommendation: rec, weighted_stance: stance,
      agent_zero: verdict, processing_time_ms: Date.now() - started};
  }

  /* chat-completions engine built from the visitor's own settings */
  function makeEngine(settings) {
    return async function (spec, prompt) {
      var res = await fetch(settings.endpoint, {method: "POST",
        headers: {"Content-Type": "application/json", "Authorization": "Bearer " + settings.key},
        body: JSON.stringify({model: settings.model, messages: [{role: "system", content: spec.system}, {role: "user", content: prompt}], max_tokens: 400, temperature: 0.3})});
      if (!res.ok) throw new Error("API " + res.status);
      var d = await res.json();
      return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "";
    };
  }

  var api = {analyze: analyze, makeEngine: makeEngine, audit: audit, LENSES: LENSES, LENS_KEYS: LENS_KEYS, TRUTH_GATE: TRUTH_GATE};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.RingOfSix = api;
})(typeof window !== "undefined" ? window : globalThis);
