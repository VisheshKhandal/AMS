/**
 * Dashboard — live hero, animated stats, analytics charts, timeline
 */

let dashboardData = null;
let clockInterval = null;
let weeklyAreaChart = null;
let classBarChart = null;

document.addEventListener('DOMContentLoaded', () => {
  initHeroClock();
  document.getElementById('refreshDashboardBtn')?.addEventListener('click', () => loadDashboardStats(true));
  window.addEventListener('livesync:dashboard', () => loadDashboardStats());
  Promise.all([AppLayout.init('dashboard'), loadDashboardStats()]).then(() => {
    if (typeof LiveSync !== 'undefined') LiveSync.connect();
  });
});

function initHeroClock() {
  const tick = () => {
    const now = new Date();
    const dateEl = document.getElementById('heroDate');
    const clockEl = document.getElementById('heroClock');
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    }
  };
  tick();
  clockInterval = setInterval(tick, 1000);
}

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getDisplayName() {
  const user = typeof Auth !== 'undefined' ? Auth.getUser() : null;
  if (!user) return 'Teacher';
  return user.fullName?.trim() || user.username || user.email || 'Teacher';
}

function updateHero(stats) {
  const name = getDisplayName();
  const greeting = document.getElementById('heroGreeting');
  const insight = document.getElementById('heroInsight');
  const trend = document.getElementById('heroTrend');

  if (greeting) greeting.textContent = `${getTimeGreeting()}, ${name} 👋`;

  const marked = stats.attendanceToday ?? 0;
  const present = stats.presentToday ?? 0;

  if (insight) {
    if (marked === 0) {
      insight.textContent =
        'No attendance marked yet today. Head to Attendance when your class is ready.';
    } else {
      insight.textContent = `You marked attendance for ${marked} student${marked === 1 ? '' : 's'} today (${present} present).`;
    }
  }

  if (trend) {
    const change = stats.weekOverWeekChange ?? 0;
    if (stats.attendanceToday > 0 || change !== 0) {
      trend.hidden = false;
      if (change > 0) {
        trend.textContent = `↑ Attendance consistency improved by ${Math.abs(change)}% vs last week.`;
        trend.className = 'hero-trend';
      } else if (change < 0) {
        trend.textContent = `↓ Attendance rate dipped ${Math.abs(change)}% compared to last week.`;
        trend.className = 'hero-trend down';
      } else {
        trend.textContent = 'Attendance rate is steady compared to last week.';
        trend.className = 'hero-trend';
      }
    } else {
      trend.hidden = true;
    }
  }
}

async function loadDashboardStats(isRefresh = false) {
  const statEls = {
    classes: document.getElementById('statClasses'),
    students: document.getElementById('statStudents'),
    today: document.getElementById('statToday'),
    percentage: document.getElementById('statPercentage'),
  };

  Object.values(statEls).forEach((el) => el && (el.textContent = '…'));
  document.querySelectorAll('.stat-card').forEach((c) => c.classList.remove('is-live'));

  try {
    const res = await API.dashboard.getStats();
    const s = res.data;
    dashboardData = s;

    updateHero(s);

    animateCounter(statEls.classes, s.totalClasses ?? 0);
    animateCounter(statEls.students, s.totalStudents ?? 0);
    animateCounter(statEls.today, s.attendanceToday ?? 0);
    animateCounter(statEls.percentage, s.attendancePercentage ?? 0, '%');
    updateStatTrends(s.statTrends || {});

    document.querySelectorAll('.stat-card').forEach((c) => c.classList.add('is-live'));

    renderAreaChart(s.weeklyTrend || []);
    renderClassBarChart(s.classComparison || []);
    renderHeatmap(s.heatmap || []);
    renderPieChart(s.distribution || {});
    renderStreakCard(s.attendanceStreak || {});
    renderTimeline(s.recentActivity || []);
    updateWidgets(s);

    const chartsSection = document.getElementById('chartsSection');
    if (chartsSection) chartsSection.hidden = false;

    if (isRefresh) Toast.success('Dashboard refreshed');
  } catch (err) {
    Object.values(statEls).forEach((el) => el && (el.textContent = '—'));
    Toast.error(err.message);
  }
}

function animateCounter(el, target, suffix = '') {
  if (!el) return;
  const numTarget = Number(target) || 0;
  const duration = 900;
  const start = performance.now();
  el.textContent = suffix ? `0${suffix}` : '0';

  const frame = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    const value = Math.round(numTarget * ease);
    el.textContent = suffix ? `${value}${suffix}` : String(value);
    el.dataset.count = String(numTarget);
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function updateStatTrends(trends) {
  const map = {
    classes: 'statClassesTrend',
    students: 'statStudentsTrend',
    today: 'statTodayTrend',
    percentage: 'statPercentageTrend',
  };

  Object.entries(map).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (!el) return;

    const trend = trends[key];
    if (!trend) {
      el.hidden = true;
      return;
    }

    const change = Number(trend.change) || 0;
    el.hidden = false;
    el.classList.remove('up', 'down', 'neutral');
    const arrow = el.querySelector('.stat-trend-arrow');
    const text = el.querySelector('.stat-trend-text');

    if (change > 0) {
      el.classList.add('up');
      if (arrow) arrow.textContent = '↑';
    } else if (change < 0) {
      el.classList.add('down');
      if (arrow) arrow.textContent = '↓';
    } else {
      el.classList.add('neutral');
      if (arrow) arrow.textContent = '→';
    }

    if (text) text.textContent = formatTrendText(key, change);
  });
}

function formatTrendText(key, change) {
  const abs = Math.abs(change);
  if (key === 'percentage') {
    if (change === 0) return 'Same rate as last week';
    return `${abs} pt vs last week`;
  }
  if (change === 0) return 'Same as last week';
  const sign = change > 0 ? '+' : '';
  return `${sign}${change} vs last week`;
}

function getChartColors() {
  const style = getComputedStyle(document.documentElement);
  return {
    primary: style.getPropertyValue('--primary').trim() || '#2563eb',
    primaryHover: style.getPropertyValue('--primary-hover').trim() || '#3b82f6',
    success: style.getPropertyValue('--success').trim() || '#22c55e',
    danger: style.getPropertyValue('--danger').trim() || '#ef4444',
    textMuted: style.getPropertyValue('--text-muted').trim() || '#64748b',
    textSecondary: style.getPropertyValue('--text-secondary').trim() || '#94a3b8',
    border: style.getPropertyValue('--border-light').trim() || 'rgba(148, 163, 184, 0.15)',
    bgCard: style.getPropertyValue('--bg-card').trim() || '#1e293b',
  };
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(37, 99, 235, ${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getBaseChartOptions(colors) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 900,
      easing: 'easeOutQuart',
    },
    plugins: {
      legend: {
        labels: {
          color: colors.textSecondary,
          font: { family: 'Inter, system-ui, sans-serif', size: 11 },
          boxWidth: 10,
          boxHeight: 10,
          usePointStyle: true,
        },
      },
      tooltip: {
        backgroundColor: colors.bgCard,
        titleColor: colors.textSecondary,
        bodyColor: colors.textSecondary,
        borderColor: colors.border,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        titleFont: { family: 'Inter, system-ui, sans-serif', weight: '600' },
        bodyFont: { family: 'Inter, system-ui, sans-serif' },
      },
    },
    scales: {
      x: {
        grid: { color: colors.border, drawBorder: false },
        ticks: { color: colors.textMuted, font: { size: 11 } },
      },
      y: {
        grid: { color: colors.border, drawBorder: false },
        ticks: { color: colors.textMuted, font: { size: 11 } },
      },
    },
  };
}

function destroyChart(chart) {
  if (chart) chart.destroy();
  return null;
}

function renderAreaChart(trend) {
  const wrap = document.getElementById('weeklyLineChart');
  const canvas = document.getElementById('weeklyAreaChart');
  if (!wrap || !canvas || typeof Chart === 'undefined') return;

  const hasData = trend.some((d) => d.marked > 0);
  if (!trend.length || !hasData) {
    weeklyAreaChart = destroyChart(weeklyAreaChart);
    wrap.innerHTML = chartEmptyState('No data yet', 'Mark attendance to see your weekly trend');
    return;
  }

  if (!wrap.querySelector('canvas')) {
    wrap.innerHTML = '<canvas id="weeklyAreaChart"></canvas>';
  }
  const chartCanvas = document.getElementById('weeklyAreaChart');
  weeklyAreaChart = destroyChart(weeklyAreaChart);

  const colors = getChartColors();
  const ctx = chartCanvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, chartCanvas.offsetHeight || 200);
  gradient.addColorStop(0, hexToRgba(colors.primary, 0.35));
  gradient.addColorStop(1, hexToRgba(colors.primary, 0));

  const labels = trend.map((d) => d.label);
  const rates = trend.map((d) => (d.marked > 0 ? d.rate : 0));
  const marked = trend.map((d) => d.marked);

  weeklyAreaChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Attendance rate',
          data: rates,
          borderColor: colors.primaryHover,
          backgroundColor: gradient,
          fill: true,
          tension: 0.42,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: colors.primaryHover,
          pointBorderColor: colors.bgCard,
          pointBorderWidth: 2,
        },
      ],
    },
    options: {
      ...getBaseChartOptions(colors),
      interaction: { mode: 'index', intersect: false },
      plugins: {
        ...getBaseChartOptions(colors).plugins,
        legend: { display: false },
        tooltip: {
          ...getBaseChartOptions(colors).plugins.tooltip,
          callbacks: {
            label(ctx) {
              const i = ctx.dataIndex;
              return [
                `Rate: ${ctx.parsed.y}%`,
                `Marked: ${marked[i] ?? 0}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          ...getBaseChartOptions(colors).scales.x,
          grid: { display: false },
        },
        y: {
          ...getBaseChartOptions(colors).scales.y,
          min: 0,
          max: 100,
          ticks: {
            ...getBaseChartOptions(colors).scales.y.ticks,
            callback: (v) => `${v}%`,
          },
        },
      },
    },
  });
}

function renderClassBarChart(classes) {
  const wrap = document.getElementById('classCompareChart');
  const canvas = document.getElementById('classBarChart');
  if (!wrap || typeof Chart === 'undefined') return;

  if (!classes.length) {
    classBarChart = destroyChart(classBarChart);
    wrap.innerHTML = '<p class="empty-state">Create classes to see comparison</p>';
    return;
  }

  if (!wrap.querySelector('canvas')) {
    wrap.innerHTML = '<canvas id="classBarChart"></canvas>';
  }
  const chartCanvas = document.getElementById('classBarChart');
  classBarChart = destroyChart(classBarChart);

  const colors = getChartColors();
  const labels = classes.map((c) => {
    const name = c.name || 'Class';
    return name.length > 18 ? `${name.slice(0, 16)}…` : name;
  });

  classBarChart = new Chart(chartCanvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Present',
          data: classes.map((c) => c.present ?? 0),
          backgroundColor: hexToRgba(colors.success, 0.85),
          borderRadius: 4,
          borderSkipped: false,
        },
        {
          label: 'Absent',
          data: classes.map((c) => c.absent ?? 0),
          backgroundColor: hexToRgba(colors.danger, 0.75),
          borderRadius: 4,
          borderSkipped: false,
        },
      ],
    },
    options: {
      ...getBaseChartOptions(colors),
      plugins: {
        ...getBaseChartOptions(colors).plugins,
        tooltip: {
          ...getBaseChartOptions(colors).plugins.tooltip,
          callbacks: {
            afterBody(items) {
              const i = items[0]?.dataIndex;
              if (i == null) return '';
              const c = classes[i];
              return c ? `Rate: ${c.rate}%` : '';
            },
          },
        },
      },
      scales: {
        x: {
          ...getBaseChartOptions(colors).scales.x,
          grid: { display: false },
        },
        y: {
          ...getBaseChartOptions(colors).scales.y,
          beginAtZero: true,
          ticks: { ...getBaseChartOptions(colors).scales.y.ticks, stepSize: 1 },
        },
      },
    },
  });
}

function updateWidgets(s) {
  const summary = s.todaySummary || {};
  animateCounter(document.getElementById('summaryPresent'), summary.present ?? 0);
  animateCounter(document.getElementById('summaryAbsent'), summary.absent ?? 0);
  animateCounter(document.getElementById('summaryMarked'), summary.marked ?? 0);

  const health = s.health || {};
  const badge = document.getElementById('healthBadge');
  const widget = document.getElementById('healthWidget');
  const fill = document.getElementById('healthBarFill');
  const percentEl = document.getElementById('healthPercent');

  if (badge) badge.textContent = health.label || '—';
  if (widget) {
    widget.className = `widget-card card health-widget ${health.level || 'neutral'}`;
  }
  const pct = Math.round((s.attendancePercentage ?? 0) * 10) / 10;
  if (fill) {
    requestAnimationFrame(() => {
      fill.style.width = `${pct}%`;
    });
  }
  if (percentEl) percentEl.textContent = `${pct}% overall`;
}

function chartEmptyState(title, hint) {
  return `
    <div class="chart-empty-state" role="status">
      <svg class="chart-empty-svg" viewBox="0 0 200 120" aria-hidden="true">
        <defs>
          <linearGradient id="emptyChartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="M20 90 L55 72 L90 78 L125 48 L160 58 L180 42" fill="none" stroke="var(--border)" stroke-width="2" stroke-dasharray="6 6" stroke-linecap="round"/>
        <path d="M20 90 L55 72 L90 78 L125 48 L160 58 L180 42 L180 100 L20 100 Z" fill="url(#emptyChartGrad)" opacity="0.5"/>
        <circle cx="55" cy="72" r="4" fill="var(--border)"/>
        <circle cx="90" cy="78" r="4" fill="var(--border)"/>
        <circle cx="125" cy="48" r="4" fill="var(--border)"/>
        <circle cx="160" cy="58" r="4" fill="var(--border)"/>
        <line x1="20" y1="100" x2="180" y2="100" stroke="var(--border-light)" stroke-width="1"/>
      </svg>
      <p class="chart-empty-title">${escapeHtml(title)}</p>
      <p class="chart-empty-hint">${escapeHtml(hint)}</p>
    </div>`;
}

function renderHeatmap(cells) {
  const root = document.getElementById('attendanceHeatmap');
  if (!root) return;

  if (!cells.length) {
    root.innerHTML = '<p class="empty-state">No activity data yet</p>';
    return;
  }

  const gridCells = cells
    .map((cell, i) => {
      const delay = (i % 50) * 0.008;
      return `<div class="heatmap-cell level-${cell.level}" 
        style="animation-delay:${delay}s" 
        title="${cell.date}: ${cell.count} marked"></div>`;
    })
    .join('');

  root.innerHTML = `
    <div class="heatmap-grid">${gridCells}</div>
    <div class="heatmap-legend">
      <span>Less</span>
      <span class="level-0"></span>
      <span class="level-1"></span>
      <span class="level-2"></span>
      <span class="level-3"></span>
      <span class="level-4"></span>
      <span>More</span>
    </div>`;
}

function renderStreakCard(streak) {
  const root = document.getElementById('streakCardBody');
  const card = document.getElementById('streakCard');
  if (!root) return;

  const days = streak.days ?? 0;
  const best = streak.bestClass;
  const improvement = streak.monthImprovement ?? 0;
  const sparkline = streak.sparkline || [];

  if (card) {
    card.classList.toggle('streak-active', days > 0);
    card.classList.toggle('streak-hot', days >= 7);
  }

  if (days === 0 && !best) {
    root.innerHTML = `
      <div class="streak-empty">
        <span class="streak-empty-icon">📅</span>
        <p class="streak-empty-title">No streak yet</p>
        <p class="streak-empty-hint">Mark attendance daily to build your consistency streak.</p>
      </div>`;
    return;
  }

  const ringPct = Math.min(100, Math.round((days / 30) * 100));
  const ringOffset = 226 - (226 * ringPct) / 100;
  const improvementText =
    improvement > 0
      ? `+${improvement}% improvement this month`
      : improvement < 0
        ? `${improvement}% vs last month`
        : 'Steady vs last month';

  const bars = sparkline
    .map((day, i) => {
      const maxH = 28;
      const h = day.marked === 0 ? 4 : Math.min(maxH, 6 + day.marked * 2);
      return `<span class="streak-spark-bar${day.active ? ' active' : ''}" style="height:${h}px;animation-delay:${i * 0.04}s" title="${day.date}: ${day.marked} marked"></span>`;
    })
    .join('');

  root.innerHTML = `
    <div class="streak-main">
      <div class="streak-ring-wrap" aria-hidden="true">
        <svg class="streak-ring-svg" viewBox="0 0 88 88">
          <circle class="streak-ring-bg" cx="44" cy="44" r="36"></circle>
          <circle class="streak-ring-fill" cx="44" cy="44" r="36" style="stroke-dashoffset:${ringOffset}"></circle>
        </svg>
        <div class="streak-ring-center">
          <span class="streak-days-value">${days}</span>
          <span class="streak-days-label">days</span>
        </div>
      </div>
      <div class="streak-details">
        <p class="streak-headline"><span class="streak-flame-inline">🔥</span> ${days} day${days === 1 ? '' : 's'} consistent</p>
        ${
          best
            ? `<p class="streak-best">Best performing class:<br><strong>${escapeHtml(best.name)}</strong> <span class="streak-best-rate">${Math.round(best.rate * 10) / 10}%</span></p>`
            : '<p class="streak-best text-muted">Add classes to track performance</p>'
        }
        <p class="streak-improvement${improvement >= 0 ? ' up' : ' down'}">${escapeHtml(improvementText)}</p>
      </div>
    </div>
    <div class="streak-sparkline" aria-label="Last 14 days activity">${bars}</div>`;
}

function renderPieChart(dist) {
  const root = document.getElementById('distributionPie');
  if (!root) return;

  const present = dist.present ?? 0;
  const absent = dist.absent ?? 0;
  const total = present + absent;

  if (total === 0) {
    root.innerHTML = '<p class="empty-state">No records yet</p>';
    return;
  }

  const roundPct = (n) => Math.round(n * 10) / 10;
  const presentPct = roundPct(dist.presentPercent ?? (present / total) * 100);
  const absentPct = roundPct(100 - presentPct);

  root.innerHTML = `
    <div class="pie-ring" style="background: conic-gradient(var(--success) 0% ${presentPct}%, var(--danger) ${presentPct}% 100%)" data-center="${presentPct}%"></div>
    <div class="pie-legend">
      <div class="pie-legend-item"><span class="pie-legend-dot present"></span> Present ${present} (${presentPct}%)</div>
      <div class="pie-legend-item"><span class="pie-legend-dot absent"></span> Absent ${absent} (${absentPct}%)</div>
    </div>`;
}

function renderTimeline(items) {
  const feed = document.getElementById('activityTimeline');
  if (!feed) return;

  if (!items.length) {
    feed.innerHTML = '<li class="timeline-item empty-feed">No activity yet. Mark attendance or add a class.</li>';
    return;
  }

  const icons = {
    present: '🟢',
    absent: '🔴',
    class: '🟣',
    student: '🔵',
    attendance: '✅',
  };

  feed.innerHTML = items
    .map((item, i) => {
      const variant = item.variant || item.type || 'attendance';
      const icon = icons[variant] || '•';
      const time = formatRelativeTime(item.at);
      return `
        <li class="timeline-item variant-${variant}" style="animation-delay:${i * 0.04}s">
          <span class="timeline-icon">${icon}</span>
          <span class="timeline-text">${escapeHtml(item.text)}</span>
          <span class="timeline-time">${time}</span>
        </li>`;
    })
    .join('');
}

function formatRelativeTime(d) {
  if (!d) return '';
  const date = new Date(d);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);

  let relative;
  if (mins < 1) relative = 'Just now';
  else if (mins < 60) relative = `${mins}m ago`;
  else {
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) relative = `${hrs}h ago`;
    else {
      const days = Math.floor(hrs / 24);
      if (days < 7) relative = `${days}d ago`;
      else return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
  }

  if (date >= startOfToday) return `Today · ${relative}`;
  if (date >= startOfYesterday) return `Yesterday · ${relative}`;
  return relative;
}

function escapeHtml(str) {
  const el = document.createElement('div');
  el.textContent = str ?? '';
  return el.innerHTML;
}
