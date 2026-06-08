/**
 * Attendance mark + history (Phase 6)
 */

let classesCache = [];
let studentsInClass = [];
let markedForDate = new Map();
let classAttendanceCache = [];
let autoSaveTimer = null;

function getAttendancePrefs() {
  if (typeof UserPreferences !== 'undefined') {
    return UserPreferences.getAttendancePrefsWithDefaults();
  }
  return {
    defaultMode: 'present',
    editPast: false,
    autoSave: true,
    confirmPopup: true,
  };
}

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

function applyEditPastRestrictions() {
  const prefs = getAttendancePrefs();
  const dateInput = document.getElementById('attendanceDate');
  if (!dateInput) return;

  if (prefs.editPast) {
    dateInput.removeAttribute('min');
  } else {
    dateInput.min = todayIso();
    if (dateInput.value && dateInput.value < dateInput.min) {
      dateInput.value = dateInput.min;
    }
  }
}

function getSelectedDate() {
  const input = document.getElementById('attendanceDate');
  return input?.value || new Date().toISOString().split('T')[0];
}

function dateToUtcStart(isoDate) {
  const d = new Date(isoDate);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function initStatusToggles(root = document) {
  root.querySelectorAll('.status-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.closest('.status-toggle');
      if (!group) return;
      group.querySelectorAll('.status-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const prefs = getAttendancePrefs();
      if (prefs.autoSave) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => saveAttendance({ silent: true }), 600);
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const page = document.body.dataset.page;

  if (page === 'attendance') {
    await AppLayout.init('attendance');
    await initMarkAttendancePage();
  } else if (page === 'history') {
    await AppLayout.init('history');
    await initHistoryPage();
  }
});

async function initMarkAttendancePage() {
  const classSelect = document.getElementById('attendanceClass');
  const tbody = document.querySelector('.table-wrapper tbody');
  const dateInput = document.getElementById('attendanceDate');

  if (dateInput && !dateInput.value) {
    dateInput.value = todayIso();
  }
  applyEditPastRestrictions();

  dateInput?.addEventListener('change', () => {
    applyEditPastRestrictions();
    loadStudentsForAttendance();
    renderAttendanceCalendar();
  });

  classSelect?.addEventListener('change', () => {
    loadStudentsForAttendance();
    renderAttendanceCalendar();
  });

  try {
    const res = await API.classes.list();
    classesCache = Array.isArray(res.data) ? res.data : [];

    if (classSelect) {
      if (!classesCache.length) {
        classSelect.innerHTML = '<option value="">No classes — create one first</option>';
      } else {
        classSelect.innerHTML = classesCache
          .map(
            (c) =>
              `<option value="${c._id}">${escapeHtml(c.className)} — ${escapeHtml(c.section)}</option>`
          )
          .join('');
      }
    }

    await loadStudentsForAttendance();
    renderAttendanceCalendar();
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="3" class="empty-state error">${escapeHtml(err.message)}</td></tr>`;
    Toast.error(err.message);
  }

  document.getElementById('saveAttendanceBtn')?.addEventListener('click', saveAttendance);
}

async function loadStudentsForAttendance() {
  const classId = document.getElementById('attendanceClass')?.value;
  const selectedDate = getSelectedDate();
  const tbody = document.querySelector('.table-wrapper tbody');
  if (!tbody || !classId) return;

  tbody.innerHTML = `<tr><td colspan="3" class="empty-state"><span class="empty-icon">⏳</span> Loading…</td></tr>`;
  markedForDate = new Map();

  try {
    const [studentsRes, attendanceRes] = await Promise.all([
      API.students.byClass(classId),
      API.attendance.byClass(classId),
    ]);

    studentsInClass = Array.isArray(studentsRes.data) ? studentsRes.data : [];
    classAttendanceCache = Array.isArray(attendanceRes.data) ? attendanceRes.data : [];

    const selectedStart = dateToUtcStart(selectedDate);

    classAttendanceCache.forEach((r) => {
      if (!r.student?._id) return;
      const d = new Date(r.date);
      d.setUTCHours(0, 0, 0, 0);
      if (d.getTime() === selectedStart) {
        markedForDate.set(r.student._id, r.status);
      }
    });

    if (!studentsInClass.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="empty-state"><span class="empty-icon">👨‍🎓</span> No students in this class.</td></tr>`;
      return;
    }

    const prefs = getAttendancePrefs();
    const defaultPresent = prefs.defaultMode !== 'absent';

    tbody.innerHTML = studentsInClass
      .map((s) => {
        const existingStatus = markedForDate.get(s._id);
        const alreadyMarked = markedForDate.has(s._id);
        const isPresent = alreadyMarked ? existingStatus === 'Present' : defaultPresent;
        return `
        <tr data-student-id="${s._id}" data-class-id="${classId}">
          <td>${s.rollNumber}</td>
          <td>${escapeHtml(s.name)}</td>
          <td>
            <div class="status-toggle">
              <button type="button" class="status-btn present ${isPresent ? 'active' : ''}" data-status="Present">Present</button>
              <button type="button" class="status-btn absent ${!isPresent && alreadyMarked ? 'active' : ''}" data-status="Absent">Absent</button>
            </div>
            ${alreadyMarked ? `<span class="text-muted marked-hint">Saved as ${existingStatus} — save again to update</span>` : ''}
          </td>
        </tr>`;
      })
      .join('');

    initStatusToggles(tbody);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty-state error">${escapeHtml(err.message)}</td></tr>`;
    Toast.error(err.message);
  }
}

function renderAttendanceCalendar() {
  const container = document.getElementById('attendanceCalendar');
  if (!container) return;

  const classId = document.getElementById('attendanceClass')?.value;
  const selectedDate = getSelectedDate();
  const [year, month] = selectedDate.split('-').map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const summaryByDay = {};
  classAttendanceCache
    .filter((r) => {
      if (!classId) return true;
      const cid = r.class?._id ?? r.class;
      return String(cid) === String(classId);
    })
    .forEach((r) => {
      const key = formatDate(r.date);
      if (!summaryByDay[key]) summaryByDay[key] = { P: 0, A: 0 };
      if (r.status === 'Present') summaryByDay[key].P += 1;
      else summaryByDay[key].A += 1;
    });

  const monthLabel = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  let cells = '';
  const prefs = getAttendancePrefs();
  const minDate = prefs.editPast ? null : todayIso();

  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const stats = summaryByDay[iso];
    const isSelected = iso === selectedDate;
    const isPast = minDate && iso < minDate;
    const hint = stats ? `P:${stats.P} A:${stats.A}` : '—';
    cells += `
      <button type="button" class="cal-day ${isSelected ? 'selected' : ''} ${isPast ? 'disabled' : ''}" data-date="${iso}" title="${hint}" ${isPast ? 'disabled' : ''}>
        <span class="cal-num">${day}</span>
        ${stats ? `<span class="cal-mini">${stats.P > 0 ? 'P' : ''}${stats.A > 0 ? 'A' : ''}</span>` : ''}
      </button>`;
  }

  container.innerHTML = `
    <div class="cal-header">
      <h3>${monthLabel}</h3>
      <p class="text-muted">Click a date to mark attendance</p>
    </div>
    <div class="cal-grid">${cells}</div>`;

  container.querySelectorAll('.cal-day').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dateInput = document.getElementById('attendanceDate');
      if (dateInput) dateInput.value = btn.dataset.date;
      loadStudentsForAttendance();
      renderAttendanceCalendar();
    });
  });
}

async function saveAttendance({ silent = false } = {}) {
  const classId = document.getElementById('attendanceClass')?.value;
  const selectedDate = getSelectedDate();
  const btn = document.getElementById('saveAttendanceBtn');
  const rows = document.querySelectorAll('tbody tr[data-student-id]');
  const prefs = getAttendancePrefs();

  if (!classId) {
    if (!silent) Toast.error('Select a class first.');
    return;
  }

  if (!selectedDate) {
    if (!silent) Toast.error('Select a date.');
    return;
  }

  if (!prefs.editPast && selectedDate < todayIso()) {
    if (!silent) Toast.error('Editing past attendance is disabled in your preferences.');
    return;
  }

  if (!silent && prefs.confirmPopup) {
    const ok = await ConfirmModal.ask(
      `Save attendance for ${rows.length} student(s) on ${selectedDate}?`,
      { title: 'Confirm attendance', confirmLabel: 'Save', danger: false }
    );
    if (!ok) return;
  }

  const toMark = [];
  rows.forEach((row) => {
    const studentId = row.dataset.studentId;
    const active = row.querySelector('.status-btn.active');
    const status = active?.dataset.status || 'Present';
    toMark.push({ studentId, classId, status, date: selectedDate });
  });

  if (!toMark.length) {
    if (!silent) Toast.info('No students to save.');
    return;
  }

  if (!silent) setButtonLoading(btn, true, 'Saving attendance…');
  let success = 0;
  const errors = [];

  for (const entry of toMark) {
    try {
      await API.attendance.mark(entry);
      success += 1;
    } catch (err) {
      errors.push(err.message);
    }
  }

  if (!silent) setButtonLoading(btn, false);

  if (success > 0) {
    if (!silent) {
      Toast.success(`Attendance saved for ${success} student(s) on ${selectedDate}`);
    }
    await loadStudentsForAttendance();
    renderAttendanceCalendar();
  }
  if (errors.length && !silent) {
    Toast.error(errors[0]);
  }
}

async function initHistoryPage() {
  const classSelect = document.getElementById('historyClass');
  const studentSelect = document.getElementById('historyStudent');
  const filterBtn = document.getElementById('historyFilterBtn');
  const tbody = document.getElementById('historyTableBody');

  try {
    const res = await API.classes.list();
    classesCache = Array.isArray(res.data) ? res.data : [];

    if (classSelect) {
      classSelect.innerHTML =
        `<option value="">All Classes</option>` +
        classesCache
          .map(
            (c) =>
              `<option value="${c._id}">${escapeHtml(c.className)} — ${escapeHtml(c.section)}</option>`
          )
          .join('');
    }

    classSelect?.addEventListener('change', async () => {
      await populateHistoryStudents();
      await loadHistory();
    });

    studentSelect?.addEventListener('change', loadHistory);
    filterBtn?.addEventListener('click', loadHistory);
    document.getElementById('historyStatus')?.addEventListener('change', loadHistory);

    await populateHistoryStudents();
    await loadHistory();
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="empty-state error">${escapeHtml(err.message)}</td></tr>`;
    Toast.error(err.message);
  }
}

async function populateHistoryStudents() {
  const classId = document.getElementById('historyClass')?.value;
  const studentSelect = document.getElementById('historyStudent');
  if (!studentSelect) return;

  if (!classId) {
    studentSelect.innerHTML = '<option value="">All students</option>';
    studentSelect.disabled = true;
    return;
  }

  studentSelect.disabled = false;
  try {
    const res = await API.students.byClass(classId);
    const students = Array.isArray(res.data) ? res.data : [];
    studentSelect.innerHTML =
      `<option value="">All students in class</option>` +
      students
        .map((s) => `<option value="${s._id}">${escapeHtml(s.name)} (${s.rollNumber})</option>`)
        .join('');
  } catch {
    studentSelect.innerHTML = '<option value="">Could not load students</option>';
  }
}

async function loadHistory() {
  const classId = document.getElementById('historyClass')?.value;
  const studentId = document.getElementById('historyStudent')?.value;
  const from = document.getElementById('historyFrom')?.value;
  const to = document.getElementById('historyTo')?.value;
  const statusFilter = document.getElementById('historyStatus')?.value;
  const tbody = document.getElementById('historyTableBody');

  const presentEl = document.querySelector('.summary-pill.present .value');
  const absentEl = document.querySelector('.summary-pill.absent .value');
  const rateEl = document.querySelector('.summary-pill.rate .value');

  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Loading…</td></tr>`;

  try {
    if (studentId) {
      const [recordsRes, pctRes] = await Promise.all([
        API.attendance.byStudent(studentId),
        API.attendance.percentage(studentId),
      ]);
      let records = Array.isArray(recordsRes.data) ? recordsRes.data : [];
      const pct = pctRes.data;

      if (from) records = records.filter((r) => formatDate(r.date) >= from);
      if (to) records = records.filter((r) => formatDate(r.date) <= to);
      if (statusFilter) records = records.filter((r) => r.status === statusFilter);

      if (presentEl) presentEl.textContent = pct.presentDays ?? 0;
      if (absentEl) absentEl.textContent = pct.absentDays ?? 0;
      if (rateEl) rateEl.textContent = `${pct.percentage ?? 0}%`;

      if (!records.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state"><span class="empty-icon">📭</span> No records found.</td></tr>`;
        return;
      }

      tbody.innerHTML = records
        .map((r) => {
          const date = formatDate(r.date);
          const badge =
            r.status === 'Present'
              ? '<span class="badge badge-success">Present</span>'
              : '<span class="badge badge-danger">Absent</span>';
          return `
          <tr>
            <td>${date}</td>
            <td>—</td>
            <td>${r.status === 'Present' ? 1 : 0}</td>
            <td>${r.status === 'Absent' ? 1 : 0}</td>
            <td>${badge}</td>
          </tr>`;
        })
        .join('');
      return;
    }

    if (!classId) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state"><span class="empty-icon">📚</span> Select a class to view history.</td></tr>`;
      if (presentEl) presentEl.textContent = '—';
      if (absentEl) absentEl.textContent = '—';
      if (rateEl) rateEl.textContent = '—';
      return;
    }

    const res = await API.attendance.byClass(classId);
    let records = Array.isArray(res.data) ? res.data : [];

    if (from) records = records.filter((r) => formatDate(r.date) >= from);
    if (to) records = records.filter((r) => formatDate(r.date) <= to);
    if (statusFilter) records = records.filter((r) => r.status === statusFilter);

    const byDate = {};
    records.forEach((r) => {
      const key = formatDate(r.date);
      if (!byDate[key]) byDate[key] = { present: 0, absent: 0, className: r.class?.className || '—' };
      if (r.status === 'Present') byDate[key].present += 1;
      else byDate[key].absent += 1;
    });

    const rows = Object.entries(byDate).sort((a, b) => (a[0] < b[0] ? 1 : -1));

    let totalP = 0;
    let totalA = 0;
    rows.forEach(([, v]) => {
      totalP += v.present;
      totalA += v.absent;
    });
    const total = totalP + totalA;
    const rate = total ? Math.round((totalP / total) * 1000) / 10 : 0;

    if (presentEl) presentEl.textContent = totalP;
    if (absentEl) absentEl.textContent = totalA;
    if (rateEl) rateEl.textContent = `${rate}%`;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state"><span class="empty-icon">📭</span> No attendance records found.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows
      .map(([date, v]) => {
        const sum = v.present + v.absent;
        const dayRate = sum ? Math.round((v.present / sum) * 1000) / 10 : 0;
        return `
        <tr>
          <td>${date}</td>
          <td>${escapeHtml(v.className)}</td>
          <td>${v.present}</td>
          <td>${v.absent}</td>
          <td><span class="badge badge-success">${dayRate}%</span></td>
        </tr>`;
      })
      .join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state error">${escapeHtml(err.message)}</td></tr>`;
    Toast.error(err.message);
  }
}

function formatDate(d) {
  const date = new Date(d);
  return date.toISOString().split('T')[0];
}

function escapeHtml(str) {
  const el = document.createElement('div');
  el.textContent = str ?? '';
  return el.innerHTML;
}
