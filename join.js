// The invite code lives after "#", so it never reaches the server. This page only hands it to the app.
(function () {
  var raw = decodeURIComponent(location.hash.replace(/^#/, "")).toUpperCase().replace(/[\s-]/g, "");
  var valid = /^[0-9A-HJKMNP-TV-Z]{26}$/.test(raw);
  document.getElementById(valid ? "invite" : "missing").hidden = false;
  if (!valid) return;

  var spaced = raw.match(/.{1,4}/g).join("-");
  document.getElementById("code").textContent = spaced;
  document.getElementById("open").href = "taskyard://join#" + raw;

  var copy = document.getElementById("copy");
  var note = document.getElementById("copied");
  copy.addEventListener("click", function () {
    var done = function () { note.textContent = "Code copied. Paste it in Taskyard under People."; };
    var failed = function () { note.textContent = "Couldn’t copy. Press and hold the code to copy it."; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(spaced).then(done, failed);
    } else {
      failed();
    }
  });
})();
