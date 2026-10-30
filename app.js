// Taskyard wall board: reads one board record from the public iCloud database and shows
// today, tomorrow and the coming week. Written in plain ES2015 for older Samsung TV browsers.
(function () {
  "use strict";

  var config = window.TASKYARD_CONFIG;
  var params = new URLSearchParams(window.location.search);
  var environment = params.get("env") || config.environment;
  var demo = params.get("demo") === "1";
  var ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  var STORAGE_KEY = "taskyardBoardCode";

  var state = { board: null, updatedAt: null, fetchedAt: null, failed: false };

  function $(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text; // textContent: task titles are never parsed as HTML
    return node;
  }

  function normalizeCode(raw) {
    return (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function isValidCode(code) {
    if (code.length !== 8) return false;
    for (var i = 0; i < code.length; i++) if (ALPHABET.indexOf(code[i]) < 0) return false;
    return true;
  }

  function storedCode() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function remember(code) {
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* private mode: the URL still works */ }
  }

  function forget() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* nothing stored */ }
  }

  // ---------- Dates ----------

  function startOfDay(date) { var d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
  function addDays(date, days) { var d = new Date(date); d.setDate(d.getDate() + days); return d; }
  function sameDay(a, b) { return startOfDay(a).getTime() === startOfDay(b).getTime(); }

  var timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  var dayFormat = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });
  var shortDayFormat = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" });

  function taskSpan(task) {
    if (!task.start) return null;
    var start = new Date(task.start);
    var end = task.end ? new Date(task.end) : (task.allDay ? start : new Date(start.getTime() + 3600000));
    return { start: start, end: end };
  }

  // Which day columns a task belongs to: every day its span touches (multi day tasks repeat).
  function coversDay(task, day) {
    var span = taskSpan(task);
    if (!span) return false;
    var dayStart = startOfDay(day).getTime();
    return startOfDay(span.start).getTime() <= dayStart && startOfDay(span.end).getTime() >= dayStart;
  }

  function isOverdue(task, now) {
    var span = taskSpan(task);
    return !!span && startOfDay(span.end).getTime() < startOfDay(now).getTime();
  }

  // ---------- Loading ----------

  function fetchBoard(code) {
    if (demo) return Promise.resolve(demoBoard());
    var url = "https://api.apple-cloudkit.com/database/1/" + encodeURIComponent(config.container) + "/" +
      encodeURIComponent(environment) + "/public/records/lookup?ckAPIToken=" + encodeURIComponent(config.apiToken);
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: [{ recordName: "board-" + code }] })
    }).then(function (response) {
      if (!response.ok) throw new Error("http " + response.status);
      return response.json();
    }).then(function (json) {
      var record = json.records && json.records[0];
      if (!record || record.serverErrorCode) {
        var err = new Error(record ? record.serverErrorCode : "missing");
        err.notFound = !!record && record.serverErrorCode === "NOT_FOUND";
        throw err;
      }
      return {
        board: JSON.parse(record.fields.payload.value),
        updatedAt: record.fields.updatedAt ? new Date(record.fields.updatedAt.value) : null
      };
    });
  }

  function refresh(code) {
    fetchBoard(code).then(function (result) {
      state.board = result.board;
      state.updatedAt = result.updatedAt;
      state.fetchedAt = new Date();
      state.failed = false;
      render();
    }).catch(function (error) {
      if (error.notFound && !state.board) {
        forget();
        showSetup("No board has the code " + code + " yet. Turn on Publish to wall TV in Taskyard, then try again.");
        return;
      }
      state.failed = true; // keep showing the last good board and say it's stale
      renderStatus();
    });
  }

  // ---------- Rendering ----------

  function render() {
    var board = state.board;
    var now = new Date();
    var today = startOfDay(now);
    var tomorrow = addDays(today, 1);
    // All day first, then by start time, so every column reads top to bottom in order.
    var tasks = board.tasks.slice().sort(function (a, b) {
      if (!a.start !== !b.start) return a.start ? -1 : 1;
      if (!a.start) return a.title < b.title ? -1 : 1;
      var dayA = startOfDay(new Date(a.start)).getTime(), dayB = startOfDay(new Date(b.start)).getTime();
      if (dayA !== dayB) return dayA - dayB;
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return new Date(a.start) - new Date(b.start);
    });

    var lists = $("lists");
    lists.innerHTML = "";
    board.lists.forEach(function (list) {
      var chip = el("span", "list-chip");
      var dot = el("span", "dot");
      dot.style.background = list.color;
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode(list.name));
      lists.appendChild(chip);
    });

    // Today: overdue first, then all day, then timed in time order.
    var overdue = tasks.filter(function (t) { return isOverdue(t, now); });
    var todays = tasks.filter(function (t) { return !isOverdue(t, now) && coversDay(t, today); });
    var allDay = todays.filter(function (t) { return t.allDay; });
    var timed = todays.filter(function (t) { return !t.allDay; });
    fill($("today"), overdue.concat(allDay, timed), now, { showOverdue: true, highlightNow: true }, "Nothing scheduled today.");
    setCount("today-h", overdue.length + todays.length);

    var tomorrows = tasks.filter(function (t) { return coversDay(t, tomorrow) && !coversDay(t, today); });
    fill($("tomorrow"), tomorrows, now, {}, "Nothing scheduled tomorrow.");
    setCount("tomorrow-h", tomorrows.length);

    // Coming up: the next five days after tomorrow, then undated tasks under "Anytime".
    var week = $("week");
    week.innerHTML = "";
    week.classList.add("compact");
    var shown = 0;
    for (var i = 2; i <= 6; i++) {
      var day = addDays(today, i);
      var items = tasks.filter(function (t) { return coversDay(t, day) && startOfDay(new Date(t.start)).getTime() === day.getTime(); });
      if (!items.length) continue;
      week.appendChild(el("div", "day-label", shortDayFormat.format(day)));
      items.forEach(function (t) { week.appendChild(taskCard(t, now, { compact: true })); });
      shown += items.length;
    }
    var anytime = tasks.filter(function (t) { return !t.start; });
    if (anytime.length) {
      week.appendChild(el("div", "day-label", "Anytime"));
      anytime.forEach(function (t) { week.appendChild(taskCard(t, now, { compact: true })); });
      shown += anytime.length;
    }
    if (!shown) week.appendChild(el("div", "empty", "Nothing else this week."));
    setCount("week-h", shown);

    trimOverflow();
    document.body.classList.remove("settled");
    setTimeout(function () { document.body.classList.add("settled"); }, 1500);
    renderClock();
    renderStatus();
  }

  function fill(container, tasks, now, options, emptyText) {
    container.innerHTML = "";
    if (!tasks.length) {
      container.appendChild(el("div", "empty", emptyText));
      return;
    }
    tasks.forEach(function (task, index) {
      var card = taskCard(task, now, options);
      card.style.animationDelay = Math.min(index * 60, 400) + "ms";
      container.appendChild(card);
    });
  }

  function taskCard(task, now, options) {
    var span = taskSpan(task);
    var overdue = options.showOverdue && isOverdue(task, now);
    var happening = options.highlightNow && span && !task.allDay && span.start <= now && span.end > now;
    var card = el("article", "task" + (overdue ? " overdue" : "") + (happening ? " now" : ""));

    var when = el("div", "when");
    if (!span) {
      when.textContent = "Anytime";
    } else if (overdue) {
      when.textContent = "Overdue";
      when.appendChild(el("small", "", shortDayFormat.format(span.start).replace(/,.*$/, "")));
    } else if (task.allDay) {
      when.textContent = "All day";
      if (!sameDay(span.start, span.end)) when.appendChild(el("small", "", "until " + shortDayFormat.format(span.end).replace(/^\w+, /, "")));
    } else {
      when.textContent = timeFormat.format(span.start);
      if (!options.compact) when.appendChild(el("small", "", "to " + timeFormat.format(span.end)));
    }
    card.appendChild(when);

    var body = el("div", "body");
    var name = el("div", "name", task.title);
    if (happening) name.appendChild(el("span", "badge-now", "Now"));
    body.appendChild(name);

    var meta = el("div", "meta");
    var list = el("span");
    var dot = el("span", "dot");
    dot.style.background = task.color;
    dot.style.display = "inline-block";
    list.appendChild(dot);
    list.appendChild(document.createTextNode(task.section ? task.list + " · " + task.section : task.list));
    meta.appendChild(list);
    if (task.priority >= 5) meta.appendChild(el("span", "flag", "High priority"));
    if (task.checklistTotal) meta.appendChild(el("span", "pill", task.checklistDone + " of " + task.checklistTotal + " done"));
    task.tags.slice(0, 2).forEach(function (tag) { meta.appendChild(el("span", "pill", "#" + tag)); });
    body.appendChild(meta);
    card.appendChild(body);
    return card;
  }

  function setCount(headingId, count) {
    var heading = $(headingId);
    var badge = heading.querySelector(".count");
    if (!badge) { badge = el("span", "count"); heading.appendChild(badge); }
    badge.textContent = String(count);
  }

  // A wall screen can't scroll: hide whatever doesn't fit and say how many are hidden.
  function trimOverflow() {
    ["today", "tomorrow", "week"].forEach(function (id) {
      var stack = $(id);
      var old = stack.querySelector(".more");
      if (old) old.parentNode.removeChild(old);
      var limit = stack.getBoundingClientRect().bottom - 32;
      var hidden = 0;
      var children = Array.prototype.slice.call(stack.children);
      children.forEach(function (child) {
        if (child.getBoundingClientRect().bottom > limit) { child.style.display = "none"; if (child.classList.contains("task")) hidden++; }
      });
      if (hidden) stack.appendChild(el("div", "more", hidden + " more not shown"));
    });
  }

  function renderClock() {
    var now = new Date();
    $("time").textContent = timeFormat.format(now);
    $("date").textContent = dayFormat.format(now);
  }

  function renderStatus() {
    var status = $("status");
    status.innerHTML = "";
    status.className = "status" + (state.failed ? " stale" : "");
    status.appendChild(el("span", "live"));
    var when = state.updatedAt || state.fetchedAt;
    var text = state.failed
      ? "Can’t reach iCloud. Showing the board from " + (when ? timeFormat.format(when) : "earlier") + "."
      : "Updated " + (when ? timeFormat.format(when) : "just now") + ". Refreshes every minute.";
    status.appendChild(document.createTextNode(text));
  }

  // ---------- Setup and start ----------

  function showSetup(message) {
    $("main").hidden = true;
    $("setup").hidden = false;
    $("setup-error").textContent = message || "";
    $("code").focus();
  }

  function showBoard(code) {
    $("setup").hidden = true;
    $("main").hidden = false;
    refresh(code);
    setInterval(function () { refresh(code); }, (config.refreshSeconds || 60) * 1000);
    setInterval(renderClock, 15000);
    // Re-render on the hour so "Now" and "Today" move without waiting for a refresh.
    setInterval(function () { if (state.board) render(); }, 5 * 60000);
  }

  $("setup-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var code = normalizeCode($("code").value);
    if (!isValidCode(code)) {
      $("setup-error").textContent = "Board codes are 8 letters and numbers, like K7Q2M9XD.";
      return;
    }
    remember(code);
    showBoard(code);
  });

  $("change").addEventListener("click", function () {
    forget();
    window.location.search = "";
  });

  var code = normalizeCode(params.get("b") || storedCode() || "");
  if (demo) code = "DEMODEMO";
  if (isValidCode(code) || demo) {
    remember(code);
    showBoard(code);
  } else {
    showSetup();
  }

  // ---------- Demo data (?demo=1), for previewing without iCloud ----------

  function demoBoard() {
    var today = startOfDay(new Date());
    function at(day, hour) { return new Date(addDays(today, day).getTime() + hour * 3600000).toISOString(); }
    function t(title, list, color, start, end, allDay, extra) {
      var task = { title: title, list: list, color: color, section: null, start: start, end: end, allDay: allDay,
        priority: 0, tags: [], checklistDone: 0, checklistTotal: 0 };
      for (var k in extra || {}) task[k] = extra[k];
      return task;
    }
    var site = "#4085F2", crew = "#3DA86B", office = "#8C66E6";
    var nowHour = new Date().getHours();
    return {
      updatedAt: new Date(),
      board: {
        version: 1,
        lists: [{ name: "Site jobs", color: site }, { name: "Crew", color: crew }, { name: "Office", color: office }],
        tasks: [
          t("Return the scaffold rental", "Site jobs", site, at(-1, 0), null, true, { priority: 5 }),
          t("Safety walk at Halden Street", "Crew", crew, at(0, 0), null, true, { tags: ["safety"] }),
          t("Kitchen install, Mercer job", "Site jobs", site, at(0, nowHour), at(0, nowHour + 2), false, { section: "Install", checklistDone: 3, checklistTotal: 7 }),
          t("Pick up tile order from Brightline Supply", "Site jobs", site, at(0, nowHour + 3), at(0, nowHour + 4), false, {}),
          t("Crew huddle", "Crew", crew, at(0, nowHour + 5), at(0, nowHour + 5.5), false, {}),
          t("Invoice Okafor bathroom job", "Office", office, at(1, 9), at(1, 10), false, { priority: 5 }),
          t("Drywall, unit 4B", "Site jobs", site, at(1, 8), at(1, 15), false, { section: "Framing" }),
          t("Forklift certificate renewals", "Crew", crew, at(1, 0), null, true, {}),
          t("Final walkthrough with the Lindqvists", "Site jobs", site, at(2, 10), at(2, 11), false, {}),
          t("Concrete pour, Dalton lot", "Site jobs", site, at(3, 7), at(3, 12), false, { priority: 5 }),
          t("Order hinges for cabinet batch 12", "Office", office, at(4, 0), null, true, {}),
          t("Restock first aid kits", "Crew", crew, null, null, true, { tags: ["safety"] })
        ]
      }
    };
  }
})();
