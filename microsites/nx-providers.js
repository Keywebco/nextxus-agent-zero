/* NextXus provider picker + free-question gate. HumanCodex Federation.
 * One shared file for every AI feature on the independent (GitHub) sites.
 * Providers: MiMo, DeepSeek, Grok (xAI), OpenAI. No Emergent endpoint here by design.
 * A visitor's key is kept in this browser (localStorage) and sent only to the provider they pick.
 * Free allowance: the first FREE_LIMIT questions run on the Federation's server (per-IP, enforced there);
 * after that the visitor's own key is required. */
(function (root) {
  "use strict";
  var PROVIDERS = {
    mimo:     {label: "MiMo (Xiaomi)",  endpoint: "https://api.xiaomimimo.com/v1/chat/completions", model: "mimo-v2.6-flash", maxTokens: 800},
    deepseek: {label: "DeepSeek",       endpoint: "https://api.deepseek.com/chat/completions",      model: "deepseek-chat",   maxTokens: 500},
    grok:     {label: "Grok (xAI)",     endpoint: "https://api.x.ai/v1/chat/completions",           model: "grok-3-mini",     maxTokens: 800},
    openai:   {label: "OpenAI",         endpoint: "https://api.openai.com/v1/chat/completions",     model: "gpt-4o-mini",     maxTokens: 500}
  };
  var KEY = "nx_provider_settings";
  var FREE_API = "https://ring-of-12-api.onrender.com";

  function load() { try { var d = JSON.parse(localStorage.getItem(KEY) || "{}"); return d && d.provider && PROVIDERS[d.provider] ? d : null; } catch (e) { return null; } }
  function save(provider, key, model) {
    if (!PROVIDERS[provider]) throw new Error("unknown provider");
    var d = {provider: provider, key: String(key || "").trim(), model: String(model || "").trim() || PROVIDERS[provider].model};
    localStorage.setItem(KEY, JSON.stringify(d)); return d;
  }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }
  function mine() { var s = load(); return s && s.key ? s : null; }

  /* visitor's own key: call the provider directly from the browser */
  async function callOwn(messages, opts) {
    var s = mine(); if (!s) throw new Error("no key saved");
    var p = PROVIDERS[s.provider];
    var res = await fetch(p.endpoint, {method: "POST",
      headers: {"Content-Type": "application/json", "Authorization": "Bearer " + s.key},
      body: JSON.stringify({model: s.model || p.model, messages: messages, max_tokens: (opts && opts.maxTokens) || p.maxTokens, temperature: (opts && opts.temperature) != null ? opts.temperature : 0.3})});
    if (!res.ok) throw new Error(p.label + " said " + res.status + (res.status === 401 ? " (key rejected)" : ""));
    var d = await res.json();
    return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "";
  }

  /* Federation's free allowance: server counts questions per visitor */
  async function quota() {
    try { var r = await fetch(FREE_API + "/quota"); return r.ok ? await r.json() : null; } catch (e) { return null; }
  }

  /* Federation's free allowance: the server runs the call and counts it against the visitor */
  async function callFree(messages, opts) {
    var res = await fetch(FREE_API + "/complete", {method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({messages: messages, maxTokens: (opts && opts.maxTokens) || 900})});
    if (res.status === 402 || res.status === 503) { var b = {}; try { b = await res.json(); } catch (e) {} var e = new Error(b.message || "Your free questions are used. Add your own key to continue."); e.code = "need_key"; e.quota = b; throw e; }
    if (!res.ok) throw new Error("free service error " + res.status);
    var d = await res.json();
    return {text: d.text || "", quota: d.quota};
  }

  /* one function every feature calls. Own key first; otherwise the free allowance; otherwise need_key */
  async function ask(messages, opts) {
    if (mine()) return {text: await callOwn(messages, opts), via: "own"};
    var r = await callFree(messages, opts);
    return {text: r.text, via: "free", quota: r.quota};
  }

  var api = {PROVIDERS: PROVIDERS, load: load, save: save, clear: clear, mine: mine, callOwn: callOwn, quota: quota, callFree: callFree, ask: ask, FREE_API: FREE_API};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.NXProviders = api;
})(typeof window !== "undefined" ? window : globalThis);
