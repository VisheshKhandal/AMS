import Class from '../models/class.model.js';
import Student from '../models/student.model.js';
import Attendance from '../models/attendance.model.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';

const getStartOfDay = (date = new Date()) => {
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized;
};

const addDays = (date, days) => {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

const toDateKey = (date) => date.toISOString().split('T')[0];

const countLevel = (count) => {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 10) return 3;
  return 4;
};

const aggregateDailyStats = async (classIds, startDate, endDate) => {
  if (!classIds.length) return new Map();

  const rows = await Attendance.aggregate([
    {
      $match: {
        class: { $in: classIds },
        date: { $gte: startDate, $lt: endDate },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        marked: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$status', 'Present'] }, 1, 0] } },
      },
    },
  ]);

  return new Map(rows.map((row) => [row._id, { marked: row.marked, present: row.present }]));
};

const buildWeeklyTrend = (today, dailyStats) => {
  const trend = [];
  let totalPresent = 0;
  let totalMarked = 0;

  for (let i = 6; i >= 0; i -= 1) {
    const dayStart = addDays(today, -i);
    const key = toDateKey(dayStart);
    const day = dailyStats.get(key) || { marked: 0, present: 0 };

    totalPresent += day.present;
    totalMarked += day.marked;

    trend.push({
      date: key,
      label: dayStart.toLocaleDateString('en-US', { weekday: 'short' }),
      marked: day.marked,
      present: day.present,
      absent: day.marked - day.present,
      rate: day.marked === 0 ? 0 : Math.round((day.present / day.marked) * 100),
    });
  }

  return { trend, totalPresent, totalMarked };
};

const sumWeekRange = (today, dailyStats, startOffset, endOffset) => {
  let present = 0;
  let marked = 0;

  for (let i = startOffset; i >= endOffset; i -= 1) {
    const key = toDateKey(addDays(today, -i));
    const day = dailyStats.get(key) || { marked: 0, present: 0 };
    present += day.present;
    marked += day.marked;
  }

  return { present, marked };
};

const calcAttendanceStreak = (today, dailyStats) => {
  let streak = 0;
  let startOffset = (dailyStats.get(toDateKey(today))?.marked ?? 0) > 0 ? 0 : 1;

  for (let i = startOffset; i < 90; i += 1) {
    const marked = dailyStats.get(toDateKey(addDays(today, -i)))?.marked ?? 0;
    if (marked > 0) streak += 1;
    else break;
  }

  return streak;
};

const buildMonthImprovement = (today, dailyStats) => {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const dayOfMonth = today.getUTCDate();

  let thisPresent = 0;
  let thisMarked = 0;
  let lastPresent = 0;
  let lastMarked = 0;

  for (let day = 1; day <= dayOfMonth; day += 1) {
    const thisKey = toDateKey(new Date(Date.UTC(year, month, day)));
    const lastKey = toDateKey(new Date(Date.UTC(year, month - 1, day)));
    const thisDay = dailyStats.get(thisKey) || { marked: 0, present: 0 };
    const lastDay = dailyStats.get(lastKey) || { marked: 0, present: 0 };

    thisPresent += thisDay.present;
    thisMarked += thisDay.marked;
    lastPresent += lastDay.present;
    lastMarked += lastDay.marked;
  }

  const thisRate = thisMarked === 0 ? 0 : (thisPresent / thisMarked) * 100;
  const lastRate = lastMarked === 0 ? 0 : (lastPresent / lastMarked) * 100;

  if (thisMarked === 0 && lastMarked === 0) return 0;
  if (lastMarked === 0) return Math.round(thisRate * 10) / 10;

  return Math.round((thisRate - lastRate) * 10) / 10;
};

const buildStreakSparkline = (today, dailyStats, days = 14) => {
  const sparkline = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const dayStart = addDays(today, -i);
    const key = toDateKey(dayStart);
    const day = dailyStats.get(key) || { marked: 0, present: 0 };

    sparkline.push({
      date: key,
      label: dayStart.toLocaleDateString('en-US', { weekday: 'narrow' }),
      marked: day.marked,
      active: day.marked > 0,
    });
  }

  return sparkline;
};

const getDashboardStats = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const classIds = await Class.find({ createdBy: userId }).distinct('_id');

  const today = getStartOfDay();
  const tomorrow = addDays(today, 1);
  const heatmapStart = addDays(today, -83);
  const classFilter = classIds.length ? { class: { $in: classIds } } : { class: null };

  const [
    totalClasses,
    totalStudents,
    attendanceToday,
    presentToday,
    totalRecords,
    totalPresent,
    dailyStatsMap,
    classComparisonAgg,
    recentAttendance,
    recentClasses,
    recentStudents,
    classes,
  ] = await Promise.all([
    Class.countDocuments({ createdBy: userId }),
    classIds.length ? Student.countDocuments({ classId: { $in: classIds } }) : Promise.resolve(0),
    classIds.length
      ? Attendance.countDocuments({ ...classFilter, date: today })
      : Promise.resolve(0),
    classIds.length
      ? Attendance.countDocuments({ ...classFilter, date: today, status: 'Present' })
      : Promise.resolve(0),
    classIds.length ? Attendance.countDocuments(classFilter) : Promise.resolve(0),
    classIds.length
      ? Attendance.countDocuments({ ...classFilter, status: 'Present' })
      : Promise.resolve(0),
    aggregateDailyStats(classIds, heatmapStart, tomorrow),
    classIds.length
      ? Attendance.aggregate([
          { $match: { class: { $in: classIds } } },
          {
            $group: {
              _id: '$class',
              total: { $sum: 1 },
              present: { $sum: { $cond: [{ $eq: ['$status', 'Present'] }, 1, 0] } },
            },
          },
        ])
      : Promise.resolve([]),
    Attendance.find({ markedBy: userId })
      .sort({ updatedAt: -1 })
      .limit(12)
      .populate('student', 'name')
      .populate('class', 'className section'),
    Class.find({ createdBy: userId }).sort({ createdAt: -1 }).limit(4).select('className section createdAt'),
    classIds.length
      ? Student.find({ classId: { $in: classIds } })
          .sort({ createdAt: -1 })
          .limit(4)
          .select('name createdAt')
      : Promise.resolve([]),
    Class.find({ createdBy: userId }).select('className section'),
  ]);

  const absentToday = attendanceToday - presentToday;
  const attendancePercentage =
    totalRecords === 0 ? 0 : Math.round((totalPresent / totalRecords) * 10000) / 100;

  const { trend: weeklyTrend, totalPresent: thisWeekPresent, totalMarked: thisWeekMarked } =
    buildWeeklyTrend(today, dailyStatsMap);

  const { present: lastWeekPresent, marked: lastWeekMarked } = sumWeekRange(today, dailyStatsMap, 13, 7);

  const thisWeekRate = thisWeekMarked === 0 ? 0 : (thisWeekPresent / thisWeekMarked) * 100;
  const lastWeekRate = lastWeekMarked === 0 ? 0 : (lastWeekPresent / lastWeekMarked) * 100;
  const weekOverWeekChange = Math.round((thisWeekRate - lastWeekRate) * 10) / 10;

  const weekAgo = addDays(today, -7);
  const twoWeeksAgo = addDays(today, -14);
  const lastWeekSameDay = addDays(today, -7);

  const [
    classesThisWeek,
    classesLastWeek,
    studentsThisWeek,
    studentsLastWeek,
    markedLastWeekSameDay,
  ] = await Promise.all([
    Class.countDocuments({ createdBy: userId, createdAt: { $gte: weekAgo, $lt: tomorrow } }),
    Class.countDocuments({ createdBy: userId, createdAt: { $gte: twoWeeksAgo, $lt: weekAgo } }),
    classIds.length
      ? Student.countDocuments({ classId: { $in: classIds }, createdAt: { $gte: weekAgo, $lt: tomorrow } })
      : Promise.resolve(0),
    classIds.length
      ? Student.countDocuments({ classId: { $in: classIds }, createdAt: { $gte: twoWeeksAgo, $lt: weekAgo } })
      : Promise.resolve(0),
    classIds.length
      ? Attendance.countDocuments({ ...classFilter, date: lastWeekSameDay })
      : Promise.resolve(0),
  ]);

  const statTrends = {
    classes: { change: classesThisWeek - classesLastWeek },
    students: { change: studentsThisWeek - studentsLastWeek },
    today: { change: attendanceToday - markedLastWeekSameDay },
    percentage: { change: weekOverWeekChange },
  };

  const classNameMap = new Map(
    classes.map((cls) => [cls._id.toString(), `${cls.className} — ${cls.section}`])
  );

  const classComparison = classComparisonAgg
    .map((row) => {
      const total = row.total;
      const present = row.present;
      const rate = total === 0 ? 0 : Math.round((present / total) * 1000) / 10;
      return {
        classId: row._id,
        name: classNameMap.get(row._id.toString()) || 'Unknown class',
        total,
        present,
        absent: total - present,
        rate,
      };
    })
    .sort((a, b) => b.rate - a.rate);

  const totalAbsent = totalRecords - totalPresent;
  const distribution = {
    present: totalPresent,
    absent: totalAbsent,
    presentPercent: attendancePercentage,
    absentPercent: totalRecords === 0 ? 0 : Math.round((totalAbsent / totalRecords) * 10000) / 100,
  };

  const heatmap = [];
  for (let i = 83; i >= 0; i -= 1) {
    const dayStart = addDays(today, -i);
    const key = toDateKey(dayStart);
    const count = dailyStatsMap.get(key)?.marked ?? 0;

    heatmap.push({
      date: key,
      count,
      level: countLevel(count),
    });
  }

  const recentActivity = [];

  recentAttendance.forEach((a) => {
    const studentName = a.student?.name || 'Student';
    const classLabel = a.class ? `${a.class.className} — ${a.class.section}` : 'class';
    const isPresent = a.status === 'Present';
    recentActivity.push({
      type: 'attendance',
      variant: isPresent ? 'present' : 'absent',
      text: `${studentName} marked ${a.status.toLowerCase()} in ${classLabel}`,
      at: a.updatedAt || a.createdAt,
    });
  });

  recentStudents.forEach((s) => {
    recentActivity.push({
      type: 'student',
      variant: 'student',
      text: `New student added: ${s.name}`,
      at: s.createdAt,
    });
  });

  recentClasses.forEach((c) => {
    recentActivity.push({
      type: 'class',
      variant: 'class',
      text: `Class created: ${c.className} — ${c.section}`,
      at: c.createdAt,
    });
  });

  recentActivity.sort((a, b) => new Date(b.at) - new Date(a.at));

  const streakDays = calcAttendanceStreak(today, dailyStatsMap);
  const bestClass = classComparison[0] ?? null;
  const monthImprovement = buildMonthImprovement(today, dailyStatsMap);
  const streakSparkline = buildStreakSparkline(today, dailyStatsMap);

  let healthLabel = 'Getting started';
  let healthLevel = 'neutral';
  if (attendancePercentage >= 85) {
    healthLabel = 'Excellent';
    healthLevel = 'excellent';
  } else if (attendancePercentage >= 70) {
    healthLabel = 'Good';
    healthLevel = 'good';
  } else if (totalRecords > 0) {
    healthLabel = 'Needs attention';
    healthLevel = 'warning';
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totalClasses,
        totalStudents,
        attendanceToday,
        presentToday,
        absentToday,
        attendancePercentage,
        weekOverWeekChange,
        statTrends,
        weeklyTrend,
        classComparison,
        distribution,
        heatmap,
        recentActivity: recentActivity.slice(0, 15),
        todaySummary: {
          present: presentToday,
          absent: absentToday,
          marked: attendanceToday,
        },
        health: { label: healthLabel, level: healthLevel },
        attendanceStreak: {
          days: streakDays,
          bestClass: bestClass
            ? { name: bestClass.name, rate: bestClass.rate }
            : null,
          monthImprovement,
          sparkline: streakSparkline,
        },
      },
      'Dashboard stats fetched successfully'
    )
  );
});

export { getDashboardStats };
