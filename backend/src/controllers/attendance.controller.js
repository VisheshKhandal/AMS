import Class from '../models/class.model.js';
import Student from '../models/student.model.js';
import Attendance from '../models/attendance.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { broadcastDashboardUpdate } from '../ws/liveSync.js';
/**
PURPOSE : 
“Normalize date to beginning of day.”
WHY THIS IS NEEDED?
Attendance should be: one attendance per DAY NOT per exact time.

setUTCHours instead of:setHours()
Because backend should use: timezone-independent standard time
UTC avoids timezone bugs. 
 */
const getStartOfDay = (date = new Date()) => {
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized;
};
/**
Without this: Any teacher could access any class.Huge security problem.
With this : Return class ONLY if current teacher owns it.
 */
const getOwnedClass = async (classId, userId) => {
  const classDoc = await Class.findById(classId);

  if (!classDoc) {
    throw new ApiError(404, 'Class not found');
  }

  if (!classDoc.createdBy.equals(userId)) {
    throw new ApiError(403, 'You are not authorized to access this class');
  }
  return classDoc;
};
// Return student ONLY if student's class belongs to teacher.
const getStudentOwnedByTeacher = async (studentId, userId) => {
  const student = await Student.findById(studentId);

  if (!student) {
    throw new ApiError(404, 'Student not found');
  }
// 
  await getOwnedClass(student.classId, userId);
  return student;
};

/**
 POST /attendance/mark — mark attendance for one student (one document per entry).
 */
const parseAttendanceDate = (dateInput) => {
  if (dateInput === undefined || dateInput === null || String(dateInput).trim() === '') {
    return getStartOfDay();
  }

  const parsed = new Date(dateInput);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, 'Invalid attendance date');
  }

  return getStartOfDay(parsed);
};

const markAttendance = asyncHandler(async (req, res) => {
  const { studentId, classId, status, date } = req.body;

  if (
    [studentId, classId, status].some(
      (field) => field === undefined || field === null || field.toString().trim() === ''
    )
  ) {
    throw new ApiError(400, 'Student, class, and status are required');
  }

  const attendanceDate = parseAttendanceDate(date);
// Status Normalization : Convert all variations into consistent format.
  const normalizedStatus =
    status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();

  if (!['Present', 'Absent'].includes(normalizedStatus)) {
    throw new ApiError(400, 'Status must be Present or Absent');
  }

  await getOwnedClass(classId, req.user._id);

  const student = await Student.findById(studentId);

  if (!student) {
    throw new ApiError(404, 'Student not found');
  }

  if (!student.classId.equals(classId)) {
    throw new ApiError(400, 'Student does not belong to this class');
  }

  const existingRecord = await Attendance.findOne({
    student: studentId,
    date: attendanceDate,
  });

  let attendance;
  let wasUpdate = false;
  let message = 'Attendance marked successfully';

  if (existingRecord) {
    existingRecord.status = normalizedStatus;
    existingRecord.markedBy = req.user._id;
    await existingRecord.save();
    attendance = existingRecord;
    wasUpdate = true;
    message = 'Attendance updated successfully';
  } else {
    try {
      attendance = await Attendance.create({
        student: studentId,
        class: classId,
        status: normalizedStatus,
        date: attendanceDate,
        markedBy: req.user._id,
      });
    } catch (err) {
      if (err.code === 11000) {
        const duplicate = await Attendance.findOne({
          student: studentId,
          date: attendanceDate,
        });
        if (duplicate) {
          duplicate.status = normalizedStatus;
          duplicate.markedBy = req.user._id;
          await duplicate.save();
          attendance = duplicate;
          wasUpdate = true;
          message = 'Attendance updated successfully';
        } else {
          throw new ApiError(409, 'Attendance already marked for this student on this date');
        }
      } else {
        throw err;
      }
    }
  }

  const populated = await Attendance.findById(attendance._id)
    .populate('student', 'name rollNumber')
    .populate('class', 'className section')
    .populate('markedBy', 'username email');

  broadcastDashboardUpdate({ reason: 'attendance-marked' });

  return res
    .status(wasUpdate ? 200 : 201)
    .json(new ApiResponse(wasUpdate ? 200 : 201, populated, message));
});

/**
 * GET /attendance/student/:id — attendance history for one student.
 */
const getAttendanceByStudent = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await getStudentOwnedByTeacher(id, req.user._id);

  const records = await Attendance.find({ student: id })
    .select('date status -_id')
    .sort({ date: -1 });

  return res
    .status(200)
    .json(new ApiResponse(200, records, 'Student attendance fetched successfully'));
});

/**
 * GET /attendance/student/:id/percentage — present days vs total marked days.
 */
const getAttendancePercentage = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await getStudentOwnedByTeacher(id, req.user._id);
// PARALLEL DATABASE QUERIES : Run BOTH queries simultaneously.
  const [totalDays, presentDays] = await Promise.all([
    Attendance.countDocuments({ student: id }),
    Attendance.countDocuments({ student: id, status: 'Present' }),
  ]);

  const percentage =
    totalDays === 0
      ? 0
    // Keep only 2 decimal places.     
  : Math.round((presentDays / totalDays) * 10000) / 100;

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totalDays,
        presentDays,
        absentDays: totalDays - presentDays,
        percentage,
      },
      'Attendance percentage calculated successfully'
    )
  );
});

/**
 * GET /attendance/class/:classId — all attendance records for a class (populated).
 */
const getAttendanceByClass = asyncHandler(async (req, res) => {
  const { classId } = req.params;
  const { date } = req.query;

  await getOwnedClass(classId, req.user._id);

  const filter = { class: classId };
  if (date) {
    filter.date = parseAttendanceDate(date);
  }

  const records = await Attendance.find(filter)
    .populate('student', 'name rollNumber')
// Sort by: newest date first,then alphabetical student name   
    .sort({ date: -1, 'student.name': 1 });

  return res
    .status(200)
    .json(new ApiResponse(200, records, 'Class attendance fetched successfully'));
});

export {
  markAttendance,
  getAttendanceByStudent,
  getAttendancePercentage,
  getAttendanceByClass,
};
