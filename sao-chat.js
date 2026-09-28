/* Audit Ace — on-page helper bot for the SAO audit pages.
   Drop-in: <script src="/sao-chat.js" defer></script>
   Talks to /api/chat with botSlug "sao-guide". No dependencies. */
(function () {
  "use strict";
  if (window.__auditAceLoaded) return;
  window.__auditAceLoaded = true;

  var CSS = [
    "#aa-fab{position:fixed;right:20px;bottom:20px;width:58px;height:58px;border-radius:50%;",
    "background:linear-gradient(135deg,#4f8ff7,#a06ff7);border:none;cursor:pointer;z-index:9998;",
    "display:flex;align-items:center;justify-content:center;box-shadow:0 6px 24px rgba(79,143,247,.45);",
    "transition:transform .15s ease}",
    "#aa-fab:hover{transform:scale(1.07)}",
    "#aa-fab svg{width:28px;height:28px;fill:#fff}",
    "#aa-panel{position:fixed;right:20px;bottom:90px;width:370px;max-width:calc(100vw - 40px);",
    "height:480px;max-height:calc(100vh - 120px);background:#121216;border:1px solid #2a2a32;",
    "border-radius:16px;z-index:9999;display:none;flex-direction:column;overflow:hidden;",
    "box-shadow:0 18px 60px rgba(0,0,0,.6);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}",
    "#aa-panel.open{display:flex}",
    "#aa-head{display:flex;align-items:center;gap:10px;padding:14px 16px;background:#17171d;border-bottom:1px solid #232329}",
    "#aa-head img{width:36px;height:36px;border-radius:10px}",
    "#aa-head .t{flex:1}#aa-head .t b{display:block;color:#f5efe0;font-size:.95rem}",
    "#aa-head .t span{color:#a8a29a;font-size:.78rem}",
    "#aa-close{background:none;border:none;color:#6b675f;font-size:1.3rem;cursor:pointer;line-height:1}",
    "#aa-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}",
    ".aa-m{max-width:85%;padding:10px 14px;border-radius:14px;font-size:.93rem;line-height:1.5;color:#f5efe0}",
    ".aa-m.bot{background:#1d1d23;align-self:flex-start;border-bottom-left-radius:4px}",
    ".aa-m.user{background:linear-gradient(135deg,#4f8ff7,#a06ff7);align-self:flex-end;border-bottom-right-radius:4px;color:#fff}",
    ".aa-m.typing{color:#a8a29a}",
    "#aa-form{display:flex;gap:8px;padding:12px;border-top:1px solid #232329}",
    "#aa-input{flex:1;background:#0d0d10;border:1px solid #2a2a32;color:#f5efe0;border-radius:10px;",
    "padding:11px 14px;font-size:.93rem;outline:none}",
    "#aa-input:focus{border-color:#4f8ff7}",
    "#aa-send{background:linear-gradient(135deg,#4f8ff7,#a06ff7);border:none;color:#fff;border-radius:10px;",
    "padding:0 18px;font-weight:700;cursor:pointer;font-size:.93rem}",
    "#aa-send:disabled{opacity:.5;cursor:wait}",
  ].join("\n");

  var GREETING =
    "Hey, I'm Audit Ace. Ask me anything about the audit — what SAO means, what your score says, or what to fix first.";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function mount() {
    var st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);

    var fab = document.createElement("button");
    fab.id = "aa-fab";
    fab.setAttribute("aria-label", "Chat with Audit Ace");
    fab.innerHTML =
      '<svg viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>';

    var panel = document.createElement("div");
    panel.id = "aa-panel";
    panel.innerHTML =
      '<div id="aa-head"><img src="/media/roster/sao-guide.png" alt="Audit Ace">' +
      '<div class="t"><b>Audit Ace</b><span>Your SAO audit, explained</span></div>' +
      '<button id="aa-close" aria-label="Close">×</button></div>' +
      '<div id="aa-msgs"></div>' +
      '<form id="aa-form"><input id="aa-input" placeholder="Ask about the audit…" autocomplete="off">' +
      '<button id="aa-send" type="submit">Send</button></form>';

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    var msgs = panel.querySelector("#aa-msgs");
    var form = panel.querySelector("#aa-form");
    var input = panel.querySelector("#aa-input");
    var send = panel.querySelector("#aa-send");
    var history = [];
    var greeted = false;

    function addMsg(text, cls) {
      var d = document.createElement("div");
      d.className = "aa-m " + cls;
      d.innerHTML = esc(text).replace(/\n/g, "<br>");
      msgs.appendChild(d);
      msgs.scrollTop = msgs.scrollHeight;
      return d;
    }

    function toggle(open) {
      panel.classList.toggle("open", open);
      if (open && !greeted) {
        greeted = true;
        addMsg(GREETING, "bot");
      }
      if (open) setTimeout(function () { input.focus(); }, 50);
    }

    fab.addEventListener("click", function () {
      toggle(!panel.classList.contains("open"));
    });
    panel.querySelector("#aa-close").addEventListener("click", function () {
      toggle(false);
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (!text || send.disabled) return;
      input.value = "";
      addMsg(text, "user");
      history.push({ role: "user", content: text });
      send.disabled = true;
      var typing = addMsg("…", "bot typing");

      fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botSlug: "sao-guide", messages: history }),
      })
        .then(function (r) {
          return r.json().then(function (j) { return { ok: r.ok, j: j }; });
        })
        .then(function (res) {
          typing.remove();
          var reply =
            res.ok && res.j.reply
              ? res.j.reply
              : "Couldn't reach me just now — try again in a bit.";
          addMsg(reply, "bot");
          if (res.ok && res.j.reply) history.push({ role: "assistant", content: res.j.reply });
        })
        .catch(function () {
          typing.remove();
          addMsg("Couldn't reach me just now — check your connection and try again.", "bot");
        })
        .finally(function () {
          send.disabled = false;
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
