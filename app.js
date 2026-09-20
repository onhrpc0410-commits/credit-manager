"use strict";

const STORAGE_KEY = "creditManager.courses.v1";
const DAYS = ["月", "火", "水", "木", "金", "土"];
const PERIODS = [1, 2, 3, 4, 5, 6];
const PASS_LINE = 60;

/** @typedef {{
 *  id: string, name: string, day: number, period: number,
 *  wAttendance: number, wExam: number, wReport: number,
 *  hasAttendance: boolean, totalClasses: number, absenceLimit: number, absenceCount: number,
 *  numReports: number, submittedReports: number
 * }} Course */

const REPORT_ASSUMED_RATE = 0.8;

/** @type {Course[]} */
let courses = loadCourses();
let editingCourseId = null;
let modalDefaultDay = 0;
let modalDefaultPeriod = 1;

function migrateCourse(c) {
  if (c.hasAttendance === undefined) {
    c.hasAttendance = true;
  }
  if (c.numReports === undefined) {
    c.numReports = 1;
    c.submittedReports = c.reportScore > 0 ? 1 : 0;
  }
  if (c.submittedReports === undefined) {
    // migrating from the per-item point-score version: count entries with a positive score as submitted
    c.submittedReports = (c.reportScores || []).filter((s) => Number(s) > 0).length;
  }
  delete c.reportScore;
  delete c.reportScores;
  delete c.numExams;
  delete c.examScores;
  return c;
}

function loadCourses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return list.map(migrateCourse);
  } catch (e) {
    console.error("Failed to load courses", e);
    return [];
  }
}

function saveCourses() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------- Tabs ---------- */
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

/* ---------- Derived stats ---------- */
function getRemainingSafeAbsences(course) {
  return course.absenceLimit - course.absenceCount - 1;
}

function getAbsenceBadgeLevel(course) {
  const remaining = getRemainingSafeAbsences(course);
  if (remaining <= 1) return "danger";
  if (remaining === 2) return "warn";
  return "safe";
}

function getScoreBreakdown(course) {
  const attendanceRate =
    course.totalClasses > 0
      ? Math.max(0, (course.totalClasses - course.absenceCount) / course.totalClasses)
      : 1;
  const attendanceScore = course.wAttendance * attendanceRate;

  const numReports = course.numReports || 0;
  const reportWeightEach = numReports > 0 ? course.wReport / numReports : 0;
  const submittedReports = Math.min(course.submittedReports || 0, numReports);
  const reportEarned = submittedReports * reportWeightEach * REPORT_ASSUMED_RATE;

  const knownScore = attendanceScore + reportEarned;

  let requiredExamScore = null;
  if (course.wExam > 0) {
    requiredExamScore = (PASS_LINE - knownScore) / (course.wExam / 100);
  }

  return {
    attendanceScore,
    reportEarned,
    submittedReports,
    numReports,
    knownScore,
    requiredExamScore,
  };
}

/* ---------- Timetable rendering ---------- */
function renderTimetable() {
  const tbody = document.querySelector("#timetableGrid tbody");
  tbody.innerHTML = "";

  PERIODS.forEach((period) => {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.textContent = period + "限";
    th.className = "period-col";
    tr.appendChild(th);

    DAYS.forEach((_, dayIdx) => {
      const td = document.createElement("td");
      const course = courses.find((c) => c.day === dayIdx && c.period === period);

      if (course) {
        const badgeHtml = course.hasAttendance
          ? `<span class="cremain badge ${getAbsenceBadgeLevel(course)}">残${Math.max(
              getRemainingSafeAbsences(course),
              0
            )}</span>`
          : "";
        td.innerHTML = `
          <div class="cell-course">
            <span class="cname">${escapeHtml(course.name)}</span>
            ${badgeHtml}
          </div>`;
        td.addEventListener("click", () => openCourseModal(course.id));
      } else {
        td.innerHTML = `<span class="cell-empty">+</span>`;
        td.addEventListener("click", () => openCourseModal(null, dayIdx, period));
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

/* ---------- Attendance tab rendering ---------- */
function renderAttendance() {
  const list = document.getElementById("attendanceList");
  list.innerHTML = "";

  const trackedCourses = sortedCourses().filter((c) => c.hasAttendance);

  if (trackedCourses.length === 0) {
    list.innerHTML = `<p class="empty-msg">出席確認がある授業がまだ登録されていません。</p>`;
    return;
  }

  let lastDay = null;
  trackedCourses.forEach((course) => {
    if (course.day !== lastDay) {
      lastDay = course.day;
      const dayHeader = document.createElement("div");
      dayHeader.className = "day-header";
      dayHeader.textContent = `${DAYS[course.day]}曜日`;
      list.appendChild(dayHeader);
    }

    const remaining = getRemainingSafeAbsences(course);
    const badgeLevel = getAbsenceBadgeLevel(course);
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-top">
        <div>
          <div class="card-title">${escapeHtml(course.name)}</div>
          <div class="card-sub">${DAYS[course.day]}曜${course.period}限</div>
        </div>
        <span class="badge ${badgeLevel}">
          ${remaining < 0 ? "アウト規定に抵触" : "あと" + remaining + "回まで欠席可"}
        </span>
      </div>
      <div class="attendance-row">
        <div class="card-sub">現在の欠席: ${course.absenceCount}回 / 1発アウト: ${course.absenceLimit}回</div>
        <div class="attendance-controls">
          <button class="count-btn" data-action="dec" data-id="${course.id}">−</button>
          <span class="absence-num">${course.absenceCount}</span>
          <button class="count-btn" data-action="inc" data-id="${course.id}">＋</button>
        </div>
      </div>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll(".count-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const course = courses.find((c) => c.id === btn.dataset.id);
      if (!course) return;
      if (btn.dataset.action === "inc") {
        course.absenceCount += 1;
      } else {
        course.absenceCount = Math.max(0, course.absenceCount - 1);
      }
      saveCourses();
      renderAll();
    });
  });
}

/* ---------- Grades tab rendering ---------- */
function renderGrades() {
  const list = document.getElementById("gradesList");
  list.innerHTML = "";

  if (courses.length === 0) {
    list.innerHTML = `<p class="empty-msg">まだ授業が登録されていません。</p>`;
    return;
  }

  let lastDay = null;
  sortedCourses().forEach((course) => {
    if (course.day !== lastDay) {
      lastDay = course.day;
      const dayHeader = document.createElement("div");
      dayHeader.className = "day-header";
      dayHeader.textContent = `${DAYS[course.day]}曜日`;
      list.appendChild(dayHeader);
    }

    const { attendanceScore, reportEarned, submittedReports, numReports, knownScore, requiredExamScore } =
      getScoreBreakdown(course);

    const weightSum = course.wAttendance + course.wExam + course.wReport;
    const progressPct = Math.min(100, (knownScore / PASS_LINE) * 100);

    let requiredHtml = "";
    if (course.wExam > 0) {
      let level = "";
      let text = "";
      if (requiredExamScore <= 0) {
        level = "safe";
        text = "既に合格ラインを確保しています（試験0点でも可）";
      } else if (requiredExamScore > 100) {
        level = "danger";
        text = `試験で ${requiredExamScore.toFixed(1)} 点が必要（100点満点を超えており、現状では単位取得が困難です）`;
      } else {
        level = requiredExamScore > 80 ? "danger" : requiredExamScore > 60 ? "" : "safe";
        text = `試験で ${requiredExamScore.toFixed(1)} 点以上が必要`;
      }
      requiredHtml = `<div class="required-score ${level}">${text}</div>`;
    } else {
      const level = knownScore >= PASS_LINE ? "safe" : "danger";
      requiredHtml = `<div class="required-score ${level}">試験なし: 現時点の合計 ${knownScore.toFixed(
        1
      )} 点${knownScore >= PASS_LINE ? "（合格ライン到達）" : "（合格ライン未到達）"}</div>`;
    }

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-top">
        <div>
          <div class="card-title">${escapeHtml(course.name)}</div>
          <div class="card-sub">${DAYS[course.day]}曜${course.period}限 ・ 出席${course.wAttendance}% / 試験${course.wExam}% / レポート${course.wReport}%${
      weightSum !== 100 ? `<span class="warning-text" style="display:inline"> ※合計${weightSum}%</span>` : ""
    }</div>
        </div>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${progressPct}%"></div></div>
      <div class="grade-details">
        <div class="row"><span class="label">出席点（推定）</span><span>${attendanceScore.toFixed(1)} / ${course.wAttendance}</span></div>
        <div class="row"><span class="label">レポート等 獲得点（${submittedReports}/${numReports}件提出）</span><span>${reportEarned.toFixed(1)} / ${course.wReport}</span></div>
        <div class="row"><span class="label">現時点の合計</span><span>${knownScore.toFixed(1)} / ${PASS_LINE}（合格ライン）</span></div>
      </div>
      ${requiredHtml}
    `;
    list.appendChild(card);
  });
}

function sortedCourses() {
  return [...courses].sort((a, b) => a.day - b.day || a.period - b.period);
}

function renderAll() {
  renderTimetable();
  renderAttendance();
  renderGrades();
}

/* ---------- Modal ---------- */
const modal = document.getElementById("courseModal");
const form = document.getElementById("courseForm");
const deleteBtn = document.getElementById("deleteCourseBtn");

function openCourseModal(courseId, defaultDay, defaultPeriod) {
  editingCourseId = courseId;
  const course = courseId ? courses.find((c) => c.id === courseId) : null;

  document.getElementById("modalTitle").textContent = course ? "授業の編集" : "授業の登録";
  deleteBtn.style.display = course ? "inline-block" : "none";

  document.getElementById("f-name").value = course ? course.name : "";
  document.getElementById("f-day").value = course ? course.day : defaultDay ?? 0;
  document.getElementById("f-period").value = course ? course.period : defaultPeriod ?? 1;
  document.getElementById("f-wAttendance").value = course ? course.wAttendance : 0;
  document.getElementById("f-wExam").value = course ? course.wExam : 100;
  document.getElementById("f-wReport").value = course ? course.wReport : 0;
  document.getElementById("f-totalClasses").value = course ? course.totalClasses : 14;
  document.getElementById("f-absenceLimit").value = course ? course.absenceLimit : 5;
  document.getElementById("f-numReports").value = course ? course.numReports : 1;
  document.getElementById("f-submittedReports").value = course ? course.submittedReports : 0;
  document.getElementById("f-hasAttendance").checked = course ? course.hasAttendance : true;

  updateAttendanceFieldsVisibility();
  updateWeightWarning();
  modal.classList.add("open");
}

function updateAttendanceFieldsVisibility() {
  const has = document.getElementById("f-hasAttendance").checked;
  document.getElementById("attendanceFields").style.display = has ? "" : "none";
}

document.getElementById("f-hasAttendance").addEventListener("change", updateAttendanceFieldsVisibility);

function closeCourseModal() {
  modal.classList.remove("open");
  editingCourseId = null;
}

function updateWeightWarning() {
  const sum =
    Number(document.getElementById("f-wAttendance").value || 0) +
    Number(document.getElementById("f-wExam").value || 0) +
    Number(document.getElementById("f-wReport").value || 0);
  const warn = document.getElementById("weightWarning");
  warn.textContent = sum === 100 ? "" : `※ 配点の合計が ${sum}% です（通常は100%になるようにしてください）`;
}

["f-wAttendance", "f-wExam", "f-wReport"].forEach((id) => {
  document.getElementById(id).addEventListener("input", updateWeightWarning);
});

document.getElementById("cancelModalBtn").addEventListener("click", closeCourseModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeCourseModal();
});

deleteBtn.addEventListener("click", () => {
  if (!editingCourseId) return;
  if (!confirm("この授業を削除しますか？")) return;
  courses = courses.filter((c) => c.id !== editingCourseId);
  saveCourses();
  closeCourseModal();
  renderAll();
});

form.addEventListener("submit", (e) => {
  e.preventDefault();

  const data = {
    name: document.getElementById("f-name").value.trim(),
    day: Number(document.getElementById("f-day").value),
    period: Number(document.getElementById("f-period").value),
    wAttendance: Number(document.getElementById("f-wAttendance").value || 0),
    wExam: Number(document.getElementById("f-wExam").value || 0),
    wReport: Number(document.getElementById("f-wReport").value || 0),
    hasAttendance: document.getElementById("f-hasAttendance").checked,
    totalClasses: Number(document.getElementById("f-totalClasses").value || 14),
    absenceLimit: Number(document.getElementById("f-absenceLimit").value || 5),
    numReports: Number(document.getElementById("f-numReports").value || 0),
    submittedReports: Number(document.getElementById("f-submittedReports").value || 0),
  };

  if (!data.name) return;

  const conflict = courses.find(
    (c) => c.day === data.day && c.period === data.period && c.id !== editingCourseId
  );
  if (conflict) {
    alert(`${DAYS[data.day]}曜${data.period}限には既に「${conflict.name}」が登録されています。`);
    return;
  }

  if (editingCourseId) {
    const course = courses.find((c) => c.id === editingCourseId);
    Object.assign(course, data);
  } else {
    courses.push({
      id: uid(),
      absenceCount: 0,
      ...data,
    });
  }

  saveCourses();
  closeCourseModal();
  renderAll();
});

/* ---------- Import ---------- */
const importModal = document.getElementById("importModal");
const importText = document.getElementById("importText");
const importError = document.getElementById("importError");

document.getElementById("openImportBtn").addEventListener("click", () => {
  importText.value = "";
  importError.textContent = "";
  importModal.classList.add("open");
});
document.getElementById("cancelImportBtn").addEventListener("click", () => {
  importModal.classList.remove("open");
});
importModal.addEventListener("click", (e) => {
  if (e.target === importModal) importModal.classList.remove("open");
});

document.getElementById("submitImportBtn").addEventListener("click", () => {
  let entries;
  try {
    entries = JSON.parse(importText.value);
    if (!Array.isArray(entries)) throw new Error("配列である必要があります");
  } catch (e) {
    importError.textContent = "JSONの形式が正しくありません: " + e.message;
    return;
  }

  for (const entry of entries) {
    if (!entry.name || entry.day == null || entry.period == null) {
      importError.textContent = "各項目に name, day, period が必要です。";
      return;
    }
  }

  entries.forEach((entry) => {
    const numReports = Number(entry.numReports ?? 1);
    const submittedReports = Array.isArray(entry.reportScores)
      ? entry.reportScores.filter((s) => Number(s) > 0).length
      : Number(entry.submittedReports || 0);
    const data = {
      name: String(entry.name),
      day: Number(entry.day),
      period: Number(entry.period),
      wAttendance: Number(entry.wAttendance || 0),
      wExam: Number(entry.wExam ?? 100),
      wReport: Number(entry.wReport || 0),
      hasAttendance: entry.hasAttendance ?? true,
      totalClasses: Number(entry.totalClasses || 14),
      absenceLimit: Number(entry.absenceLimit || 5),
      numReports,
      submittedReports,
    };

    const existing = courses.find((c) => c.day === data.day && c.period === data.period);
    if (existing) {
      Object.assign(existing, data);
    } else {
      courses.push({ id: uid(), absenceCount: 0, ...data });
    }
  });

  saveCourses();
  importModal.classList.remove("open");
  renderAll();
});

/* ---------- Utils ---------- */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ---------- Init ---------- */
renderAll();
