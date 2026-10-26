/* Search + AI page helper. Uses the page's own .bay, .btn, and color tokens. */
(function () {
  var box = document.getElementById("svis-chat");
  if (!box) return;
  var log = box.querySelector(".chat-log"), form = box.querySelector("form"), input = form.querySelector("input"), send = form.querySelector("button");
  var Q = "mailto:brobots.space@gmail.com?subject=Search%20%2B%20AI%20Visibility%20quote";
  var msgs = [];
  function add(role, text) {
    var p = document.createElement("p");
    p.className = "chat-m " + role;
    p.textContent = text;
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
    return p;
  }
  function quote() {
    var a = document.createElement("a");
    a.className = "btn"; a.href = Q; a.textContent = "Get a quote";
    log.appendChild(a); log.scrollTop = log.scrollHeight;
  }
  function off(msg) { input.disabled = send.disabled = true; add("bot", msg); quote(); }
  fetch("/api/svis-chat").then(function (r) { return r.json(); }).then(function (d) {
    if (!d.enabled) off("Chat is offline right now, but we would love to hear from you.");
  }).catch(function () {});
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    input.value = ""; add("user", text); msgs.push({ role: "user", content: text });
    send.disabled = true;
    var wait = add("bot", "Thinking...");
    fetch("/api/svis-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: msgs }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        wait.remove();
        if (d.error) return off(d.error);
        add("bot", d.reply); msgs.push({ role: "assistant", content: d.reply });
        if (d.done) { input.disabled = true; quote(); return; }
        send.disabled = false; input.focus();
      })
      .catch(function () { wait.remove(); off("Chat is offline right now."); });
  });
})();
