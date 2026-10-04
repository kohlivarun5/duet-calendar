(function () {
  var templates = {
    "2-2-3": {
      label: "2-2-3",
      description: "Two days with one parent, two days with the other, then a three-day weekend that alternates.",
      pattern: [0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 1, 1, 1],
    },
    "2-2-5-5": {
      label: "2-2-5-5",
      description: "Two fixed weekdays with each parent plus alternating five-day stretches.",
      pattern: [0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0],
    },
    "3-4-4-3": {
      label: "3-4-4-3",
      description: "Three days with one parent, four with the other, then the rhythm reverses.",
      pattern: [0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1],
    },
    "week-on-week-off": {
      label: "Week on / week off",
      description: "Seven overnights with one parent, then seven overnights with the other.",
      pattern: [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1],
    },
    "alternating-weekends": {
      label: "Alternating weekends",
      description: "One parent keeps most weekdays while the other parent has every other weekend.",
      pattern: [0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
    },
  };

  var monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
  var dayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });

  function positiveModulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function parseLocalDate(value) {
    if (!value) {
      return null;
    }

    var parts = value.split("-").map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      return null;
    }

    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function toInputDate(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function daysBetween(start, date) {
    var oneDay = 24 * 60 * 60 * 1000;
    var startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    var dateUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round((dateUtc - startUtc) / oneDay);
  }

  function parentForDate(template, startDate, date) {
    var offset = daysBetween(startDate, date);
    var patternIndex = positiveModulo(offset, template.pattern.length);
    return template.pattern[patternIndex];
  }

  function getMonthDates(startDate, template) {
    var year = startDate.getFullYear();
    var month = startDate.getMonth();
    var firstDay = new Date(year, month, 1);
    var lastDay = new Date(year, month + 1, 0);
    var leadingBlanks = firstDay.getDay();
    var cells = [];
    var counts = [0, 0];

    for (var blank = 0; blank < leadingBlanks; blank += 1) {
      cells.push(null);
    }

    for (var day = 1; day <= lastDay.getDate(); day += 1) {
      var date = new Date(year, month, day);
      var parentIndex = parentForDate(template, startDate, date);
      counts[parentIndex] += 1;
      cells.push({
        date: date,
        day: day,
        parentIndex: parentIndex,
      });
    }

    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    return {
      cells: cells,
      counts: counts,
      monthLabel: monthFormatter.format(firstDay),
      totalDays: lastDay.getDate(),
    };
  }

  function createLegend(parentNames) {
    return [
      '<span class="legend-item parent-a"><span></span>' + escapeHtml(parentNames[0]) + "</span>",
      '<span class="legend-item parent-b"><span></span>' + escapeHtml(parentNames[1]) + "</span>",
    ].join("");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderCalendar(target, monthData, parentNames) {
    var weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var markup = [
      '<div class="calculator-month-head">',
      "<h3>" + monthData.monthLabel + "</h3>",
      '<div class="calendar-legend">' + createLegend(parentNames) + "</div>",
      "</div>",
      '<div class="calendar-grid" role="grid" aria-label="' + monthData.monthLabel + ' custody calendar">',
    ];

    weekdays.forEach(function (day) {
      markup.push('<div class="weekday" role="columnheader">' + day + "</div>");
    });

    monthData.cells.forEach(function (cell) {
      if (!cell) {
        markup.push('<div class="calendar-cell empty" role="gridcell"></div>');
        return;
      }

      var parentClass = cell.parentIndex === 0 ? "parent-a" : "parent-b";
      var parentName = parentNames[cell.parentIndex];
      markup.push(
        '<div class="calendar-cell ' + parentClass + '" role="gridcell" aria-label="' +
          dayFormatter.format(cell.date) + ", " + escapeHtml(parentName) + '">' +
          '<span class="date-number">' + cell.day + "</span>" +
          '<span class="parent-chip">' + escapeHtml(parentName.charAt(0).toUpperCase()) + "</span>" +
        "</div>"
      );
    });

    markup.push("</div>");
    target.innerHTML = markup.join("");
  }

  function renderStats(target, monthData, parentNames, transitionTime, childName) {
    var firstCount = monthData.counts[0];
    var secondCount = monthData.counts[1];
    var firstPercent = Math.round((firstCount / monthData.totalDays) * 100);
    var secondPercent = 100 - firstPercent;
    var childLabel = childName ? " for " + escapeHtml(childName) : "";

    target.innerHTML = [
      '<div class="result-card">',
      '<span class="result-label">' + escapeHtml(parentNames[0]) + "</span>",
      "<strong>" + firstPercent + "%</strong>",
      "<p>" + firstCount + " overnights" + childLabel + "</p>",
      "</div>",
      '<div class="result-card">',
      '<span class="result-label">' + escapeHtml(parentNames[1]) + "</span>",
      "<strong>" + secondPercent + "%</strong>",
      "<p>" + secondCount + " overnights" + childLabel + "</p>",
      "</div>",
      '<div class="result-card">',
      '<span class="result-label">Transition time</span>',
      "<strong>" + escapeHtml(transitionTime || "6:00 PM") + "</strong>",
      "<p>Use this as the handoff time for each switch.</p>",
      "</div>",
    ].join("");
  }

  function getFormState(form) {
    var formData = new FormData(form);
    var templateKey = formData.get("scheduleType") || "2-2-3";
    var today = new Date();
    var startDate = parseLocalDate(formData.get("startDate")) || today;
    var parentA = (formData.get("parentA") || "Parent A").trim() || "Parent A";
    var parentB = (formData.get("parentB") || "Parent B").trim() || "Parent B";

    return {
      templateKey: templateKey,
      template: templates[templateKey] || templates["2-2-3"],
      startDate: startDate,
      parentNames: [parentA, parentB],
      transitionTime: (formData.get("transitionTime") || "6:00 PM").trim() || "6:00 PM",
      childName: (formData.get("childName") || "").trim(),
    };
  }

  function track(name, params) {
    if (typeof window.duetTrackEvent === "function") {
      window.duetTrackEvent(name, params);
    }
  }

  function applySharedState(form) {
    var params = new URLSearchParams(window.location.search);
    var scheduleType = params.get("schedule");
    var startDate = params.get("start");
    var transitionTime = params.get("time");

    if (scheduleType && templates[scheduleType]) {
      form.elements.scheduleType.value = scheduleType;
    }
    if (startDate && parseLocalDate(startDate)) {
      form.elements.startDate.value = startDate;
    }
    if (transitionTime) {
      form.elements.transitionTime.value = transitionTime.slice(0, 24);
    }
  }

  function sharedScheduleUrl(state) {
    var url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("schedule", state.templateKey);
    url.searchParams.set("start", toInputDate(state.startDate));
    url.searchParams.set("time", state.transitionTime);
    return url;
  }

  function shareSchedule(state, button) {
    var url = sharedScheduleUrl(state);
    var shareData = {
      title: state.template.label + " custody schedule",
      text: "Preview this " + state.template.label + " parenting schedule.",
      url: url.toString(),
    };

    if (navigator.share) {
      navigator.share(shareData).then(function () {
        track("schedule_shared", { schedule_type: state.templateKey, method: "web_share" });
      }).catch(function (error) {
        if (error && error.name !== "AbortError") {
          track("schedule_share_failed", { schedule_type: state.templateKey, method: "web_share" });
        }
      });
      return;
    }

    navigator.clipboard.writeText(url.toString()).then(function () {
      var originalText = button.textContent;
      button.textContent = "Link copied";
      window.setTimeout(function () { button.textContent = originalText; }, 1800);
      track("schedule_shared", { schedule_type: state.templateKey, method: "clipboard" });
    });
  }

  function loadPdfLibrary(callback) {
    if (window.jspdf && window.jspdf.jsPDF) {
      callback(window.jspdf.jsPDF);
      return;
    }

    var existing = document.querySelector('script[data-duet-pdf="true"]');
    if (existing) {
      existing.addEventListener("load", function () {
        callback(window.jspdf.jsPDF);
      });
      return;
    }

    var script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
    script.async = true;
    script.dataset.duetPdf = "true";
    script.onload = function () {
      callback(window.jspdf.jsPDF);
    };
    script.onerror = function () {
      window.print();
    };
    document.head.appendChild(script);
  }

  function exportPdf(state, monthData) {
    track("pdf_exported", {
      schedule_type: state.templateKey,
      landing_page: document.body.dataset.pageSlug || "unknown",
    });

    loadPdfLibrary(function (JsPdf) {
      var doc = new JsPdf({ unit: "pt", format: "letter" });
      var margin = 42;
      var y = 48;
      var cellWidth = 72;
      var cellHeight = 48;
      var firstPercent = Math.round((monthData.counts[0] / monthData.totalDays) * 100);
      var secondPercent = 100 - firstPercent;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text("Custody Schedule Summary", margin, y);
      y += 30;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text("Schedule: " + state.template.label, margin, y);
      y += 18;
      doc.text("Start date: " + dayFormatter.format(state.startDate), margin, y);
      y += 18;
      doc.text("Transition time: " + state.transitionTime, margin, y);
      y += 18;
      if (state.childName) {
        doc.text("Child: " + state.childName, margin, y);
        y += 18;
      }

      y += 8;
      doc.setFont("helvetica", "bold");
      doc.text(state.parentNames[0] + ": " + monthData.counts[0] + " overnights (" + firstPercent + "%)", margin, y);
      y += 18;
      doc.text(state.parentNames[1] + ": " + monthData.counts[1] + " overnights (" + secondPercent + "%)", margin, y);
      y += 34;

      doc.setFontSize(15);
      doc.text(monthData.monthLabel, margin, y);
      y += 22;

      ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(function (day, index) {
        doc.setFontSize(9);
        doc.text(day, margin + index * cellWidth, y);
      });
      y += 10;

      monthData.cells.forEach(function (cell, index) {
        var col = index % 7;
        var row = Math.floor(index / 7);
        var x = margin + col * cellWidth;
        var cellY = y + row * cellHeight;

        doc.setDrawColor(210, 218, 226);
        doc.rect(x, cellY, cellWidth, cellHeight);

        if (cell) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.text(String(cell.day), x + 6, cellY + 14);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.text(state.parentNames[cell.parentIndex], x + 6, cellY + 32, { maxWidth: cellWidth - 12 });
        }
      });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(88, 99, 111);
      doc.text("Created with Duet Co-parent Calendar.", margin, 754);
      doc.save("duet-custody-schedule.pdf");
    });
  }

  function initCalculator(root) {
    var form = root.querySelector(".calculator-form");
    var calendarTarget = root.querySelector(".calculator-calendar");
    var statsTarget = root.querySelector(".calculator-stats");
    var pdfButton = root.querySelector(".js-export-pdf");
    var actions = root.querySelector(".calculator-actions");
    var shareButton = root.querySelector(".js-share-schedule");
    var hasStarted = false;
    var latestState;
    var latestMonthData;

    if (!form || !calendarTarget || !statsTarget) {
      return;
    }

    var dateInput = form.querySelector('[name="startDate"]');
    applySharedState(form);
    if (dateInput && !dateInput.value) {
      dateInput.value = toInputDate(new Date());
    }

    function generateSchedule(options) {
      var shouldTrack = !options || options.track !== false;
      latestState = getFormState(form);
      latestMonthData = getMonthDates(latestState.startDate, latestState.template);
      renderCalendar(calendarTarget, latestMonthData, latestState.parentNames);
      renderStats(statsTarget, latestMonthData, latestState.parentNames, latestState.transitionTime, latestState.childName);
      root.querySelector(".calculator-template-description").textContent = latestState.template.description;
      if (shouldTrack) {
        track("schedule_generated", {
          schedule_type: latestState.templateKey,
          landing_page: document.body.dataset.pageSlug || "unknown",
        });
      }
    }

    form.addEventListener("input", function () {
      if (!hasStarted) {
        hasStarted = true;
        track("calculator_started", {
          landing_page: document.body.dataset.pageSlug || "unknown",
        });
      }
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      generateSchedule();
    });

    if (pdfButton) {
      pdfButton.addEventListener("click", function () {
        if (!latestState || !latestMonthData) {
          generateSchedule();
        }
        exportPdf(latestState, latestMonthData);
      });
    }

    if (!shareButton && actions) {
      shareButton = document.createElement("button");
      shareButton.className = "button outline-button js-share-schedule";
      shareButton.type = "button";
      shareButton.textContent = "Share schedule";
      actions.insertBefore(shareButton, actions.lastElementChild);
    }

    if (shareButton) {
      shareButton.addEventListener("click", function () {
        if (!latestState) {
          generateSchedule({ track: false });
        }
        shareSchedule(latestState, shareButton);
      });
    }

    generateSchedule({ track: false });
  }

  document.querySelectorAll("[data-custody-calculator]").forEach(initCalculator);
})();
