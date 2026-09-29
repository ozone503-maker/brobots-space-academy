/* Brobots Tutor: front end. No dependencies, no keys. Talks to /api/tutor only. */
(function () {
  var root = document.getElementById("tutor");
  if (!root) return;

  var bot = root.querySelector(".tutor-bot");
  var log = root.querySelector(".tutor-log");
  var form = root.querySelector(".tutor-form");
  var input = root.querySelector(".tutor-input");
  var send = root.querySelector(".tutor-send");
  var mic = root.querySelector(".tutor-mic");
  var status = root.querySelector(".tutor-status");
  var chips = root.querySelectorAll(".tutor-chip");

  // Voice input: Web Speech API, no keys, no cost. Hidden where unsupported.
  (function voice() {
    if (!mic) return;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    mic.hidden = false;
    var rec = null, recording = false;
    function setRec(on) {
      recording = on;
      mic.classList.toggle("recording", on);
      mic.setAttribute("aria-pressed", on ? "true" : "false");
      mic.setAttribute("aria-label", on ? "Stop listening" : "Speak your question");
    }
    mic.addEventListener("click", function () {
      if (busy) return;
      if (recording) { try { rec.stop(); } catch (e) {} return; }
      rec = new SR();
      rec.lang = "en-US";
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = function (e) {
        var text = "";
        for (var i = e.resultIndex; i < e.results.length; i++) {
          text += e.results[i][0].transcript;
        }
        input.value = text.trim();
      };
      rec.onend = function () { setRec(false); };
      rec.onerror = function () { setRec(false); };
      try { rec.start(); setRec(true); input.focus({ preventScroll: true }); }
      catch (e) { setRec(false); }
    });
  })();

  var STATUS = { idle: "Ready", thinking: "Thinking...", talking: "Talking..." };
  var MAX_HISTORY = 20;
  var TIMEOUT_MS = 30000;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var history = [];
  var busy = false;
  var revealTimer = null;
  var finishReveal = null;

  function setState(s) {
    if (bot) bot.setAttribute("data-state", s);
    if (status) status.textContent = STATUS[s] || "";
  }

  function addMsg(kind, text) {
    var el = document.createElement("div");
    el.className = "tutor-msg " + kind;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  // Escape HTML, then turn bare https:// URLs into tappable links.
  // Site links stay in this tab; anything else opens a new one.
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function linkify(text) {
    return escapeHtml(text).replace(/(https?:\/\/[^\s<]+)/g, function (url) {
      var clean = url, trail = "";
      var m = clean.match(/[.,;:!?)]+$/);
      if (m) { trail = m[0]; clean = clean.slice(0, -trail.length); }
      if (!clean) return url;
      var external = clean.indexOf("brobots.space") === -1;
      var attrs = external ? ' target="_blank" rel="noopener"' : "";
      return '<a href="' + clean + '"' + attrs + ">" + clean + "</a>" + trail;
    });
  }

  // Reveal a reply a few characters at a time while the mouth moves.
  function speak(el, text) {
    if (reduce) {
      el.innerHTML = linkify(text);
      log.scrollTop = log.scrollHeight;
      setState("idle");
      return;
    }
    var i = 0;
    var step = Math.max(2, Math.ceil(text.length / 90)); // about 2 seconds at most
    el.textContent = "";
    setState("talking");
    finishReveal = function () {
      clearInterval(revealTimer);
      revealTimer = null;
      finishReveal = null;
      el.innerHTML = linkify(text);
      log.scrollTop = log.scrollHeight;
      setState("idle");
    };
    revealTimer = setInterval(function () {
      i += step;
      if (i >= text.length) return finishReveal();
      el.textContent = text.slice(0, i);
      log.scrollTop = log.scrollHeight;
    }, 24);
  }

  function setBusy(b) {
    busy = b;
    send.disabled = b;
    input.disabled = b;
  }

  async function ask(text) {
    text = String(text || "").trim();
    if (!text || busy) return;
    if (finishReveal) finishReveal();

    history.push({ role: "user", content: text });
    history = history.slice(-MAX_HISTORY);
    addMsg("you", text);
    input.value = "";
    setBusy(true);
    setState("thinking");

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    try {
      var res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.reply) {
        throw new Error(data.error || "Static on the line. Try again.");
      }
      history.push({ role: "assistant", content: data.reply });
      history = history.slice(-MAX_HISTORY);
      setBusy(false);
      speak(addMsg("bot", ""), data.reply);
    } catch (err) {
      // Drop the failed question so a retry doesn't double up, and give it back to the visitor.
      history.pop();
      input.value = text;
      setBusy(false);
      setState("idle");
      addMsg("note", err && err.name === "AbortError"
        ? "The tutor is taking too long to answer. Try again."
        : (err && err.message) || "Connection hiccup. Try again.");
    } finally {
      clearTimeout(timer);
      if (!input.disabled) input.focus({ preventScroll: true });
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    ask(input.value);
  });
  Array.prototype.forEach.call(chips, function (c) {
    c.addEventListener("click", function () { ask(c.getAttribute("data-q") || c.textContent); });
  });

  setState("idle");
})();
