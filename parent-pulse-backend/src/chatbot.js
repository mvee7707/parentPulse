import { queryContextForQuestion, getStudentInfo, formatContextForOpenAI } from './supabaseClient.js';
import { generateResponse, generateResponseStream, classifyQuestionIntent, resolveCourseFromQuestionNLP } from './openaiClient.js';

function getCourseLabelFromGrade(grade) {
  const courseCode = grade?.assignments?.courses?.course_code;
  const courseName = grade?.assignments?.courses?.name;
  const fallbackCourseId = grade?.assignments?.course_id;

  if (courseCode && courseName) return `${courseCode} - ${courseName}`;
  if (courseName) return courseName;
  if (courseCode) return courseCode;
  if (fallbackCourseId != null) return `Course ${fallbackCourseId}`;
  return 'Unknown Course';
}

function getCourseLabelFromEnrollment(enrollment) {
  const courseCode = enrollment?.courses?.course_code;
  const courseName = enrollment?.courses?.name;

  if (courseCode && courseName) return `${courseCode} - ${courseName}`;
  if (courseName) return courseName;
  if (courseCode) return courseCode;
  return `Course ${enrollment?.course_id}`;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveCourseFromQuestion(question, courses) {
  const questionNorm = normalizeText(question);
  if (!questionNorm) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const course of courses || []) {
    if (!course?.courses) continue;

    const code = normalizeText(course.courses.course_code || '');
    const name = normalizeText(course.courses.name || '');
    const combined = normalizeText(`${course.courses.course_code || ''} ${course.courses.name || ''}`);

    let score = 0;
    if (code && questionNorm.includes(code)) score += 3;
    if (name && questionNorm.includes(name)) score += 4;
    if (combined && questionNorm.includes(combined)) score += 2;

    if (score === 0 && name) {
      const tokens = name.split(' ').filter(t => t.length > 3);
      const tokenHits = tokens.filter(t => questionNorm.includes(t)).length;
      if (tokens.length > 0 && tokenHits >= Math.ceil(tokens.length / 2)) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = course;
    }
  }

  return bestScore > 0 ? bestMatch : null;
}

function toLetterGrade(averageGPA) {
  if (averageGPA === null) return null;

  let letterGrade = 'F';
  const gpa = parseFloat(averageGPA);
  if (gpa >= 4.0) letterGrade = 'A+';
  else if (gpa >= 3.7) letterGrade = 'A-';
  else if (gpa >= 3.3) letterGrade = 'B+';
  else if (gpa >= 3.0) letterGrade = 'B';
  else if (gpa >= 2.7) letterGrade = 'B-';
  else if (gpa >= 2.3) letterGrade = 'C+';
  else if (gpa >= 2.0) letterGrade = 'C';
  else if (gpa >= 1.7) letterGrade = 'C-';
  else if (gpa >= 1.3) letterGrade = 'D+';
  else if (gpa >= 1.0) letterGrade = 'D';
  else if (gpa >= 0.7) letterGrade = 'D-';

  return letterGrade;
}

function percentToLetterGrade(pct) {
  if (pct === null || pct === undefined) return null;
  const p = parseFloat(pct);
  if (p >= 90) return 'A';
  if (p >= 80) return 'B';
  if (p >= 70) return 'C';
  if (p >= 60) return 'D';
  return 'F';
}

function isTrendQuery(question) {
  return /\b(trend|improv|getting\s+(better|worse)|going\s+(up|down)|declin|progress|over\s+time|throughout|trajectory|how\s+is\s+he\s+doing\s+over)\b/i.test(question);
}

function computeTrend(grades) {
  const valid = (grades || [])
    .filter(g =>
      !g.excused &&
      !g.missing &&
      g.score != null &&
      Number(g.assignments?.points_possible) > 0 &&
      g.assignments?.due_at
    )
    .sort((a, b) => new Date(a.assignments.due_at) - new Date(b.assignments.due_at));

  if (valid.length < 4) {
    return { hasEnoughData: false, count: valid.length };
  }

  const half = Math.floor(valid.length / 2);
  const firstHalf = valid.slice(0, half);
  const secondHalf = valid.slice(-half);

  const avg = (rows) => {
    let score = 0;
    let possible = 0;
    for (const g of rows) {
      score += Number(g.score);
      possible += Number(g.assignments.points_possible);
    }
    return possible > 0 ? (score / possible) * 100 : 0;
  };

  const firstAvg = avg(firstHalf);
  const secondAvg = avg(secondHalf);
  const diff = secondAvg - firstAvg;

  let direction;
  if (diff > 5) direction = 'improving';
  else if (diff < -5) direction = 'declining';
  else direction = 'steady';

  return {
    hasEnoughData: true,
    count: valid.length,
    firstHalfAvg: firstAvg.toFixed(1),
    secondHalfAvg: secondAvg.toFixed(1),
    diff: diff.toFixed(1),
    direction,
    firstDate: String(valid[0].assignments.due_at).slice(0, 10),
    lastDate: String(valid[valid.length - 1].assignments.due_at).slice(0, 10),
  };
}

function extractDateRange(question) {
  const q = question.toLowerCase();
  const now = new Date();

  if (/\bthis\s+week\b/.test(q)) {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return { start, end, label: 'this week' };
  }

  if (/\blast\s+week\b/.test(q)) {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay() - 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return { start, end, label: 'last week' };
  }

  if (/\bthis\s+month\b/.test(q)) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start, end, label: 'this month' };
  }

  if (/\blast\s+month\b/.test(q)) {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end, label: 'last month' };
  }

  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                       'july', 'august', 'september', 'october', 'november', 'december'];
  for (let i = 0; i < monthNames.length; i++) {
    if (new RegExp(`\\b${monthNames[i]}\\b`, 'i').test(q)) {
      let year = now.getFullYear();
      let start = new Date(year, i, 1);
      // If the month is in the future this year, use previous year
      if (start > now) {
        year -= 1;
        start = new Date(year, i, 1);
      }
      const end = new Date(year, i + 1, 1);
      return { start, end, label: monthNames[i] };
    }
  }

  // T1/T2/T3 semester references map to assignments.semester column
  const semMatch = q.match(/\b(t|term\s+|semester\s+)([1-3])\b/i);
  if (semMatch) {
    return { semester: Number(semMatch[2]), label: `T${semMatch[2]}` };
  }

  return null;
}

function buildAssignmentListContext(grades, courseLabel) {
  let context = courseLabel ? `Course: ${courseLabel}\n\n` : '';
  context += 'Assignment List (only graded, non-excused, non-missing):\n';

  const valid = (grades || []).filter(g => {
    if (g.excused || g.missing) return false;
    const a = g.assignments;
    return a && Number(a.points_possible) > 0 && g.score != null;
  });

  // Group by category
  const byCategory = new Map();
  for (const g of valid) {
    const cat = g.assignments?.assignment_groups?.name || 'Uncategorized';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(g);
  }

  for (const [cat, items] of byCategory.entries()) {
    context += `\n${cat}:\n`;
    for (const g of items) {
      const a = g.assignments;
      const pts = Number(a.points_possible);
      const score = Number(g.score);
      const pct = ((score / pts) * 100).toFixed(1);
      const due = a.due_at ? String(a.due_at).slice(0, 10) : 'N/A';
      context += `  - ${a.name}: ${score}/${pts} (${pct}%), due ${due}\n`;
    }
  }

  return context;
}

async function buildCourseBreakdown(grades) {
  const { calculateAverageGrade, calculateOverallPercentage } = await import('./supabaseClient.js');

  const grouped = new Map();
  for (const grade of grades || []) {
    const key = getCourseLabelFromGrade(grade);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(grade);
  }

  const rows = [];
  for (const [courseLabel, courseGrades] of grouped.entries()) {
    const averageGPA = calculateAverageGrade(courseGrades);
    const overallPercentage = calculateOverallPercentage(courseGrades);
    const gradedAssignments = courseGrades.filter(g => {
      const hasLetter = g.grade && g.grade.trim() !== '';
      const hasScore = g.score != null;
      return !(g.excused || g.missing) && (hasLetter || hasScore);
    }).length;

    rows.push({
      courseLabel,
      averageGrade: averageGPA,
      letterGrade: toLetterGrade(averageGPA),
      overallPercentage,
      gradedAssignments,
      totalAssignments: courseGrades.length
    });
  }

  rows.sort((a, b) => a.courseLabel.localeCompare(b.courseLabel));
  return rows;
}

/**
 * Get average grade data for a student
 */
export async function getAverageGrade(studentUserId, courseId = null) {
  try {
    // Import the required functions
    const { getStudentGradesSummary, calculateAverageGrade, calculateOverallPercentage } = await import('./supabaseClient.js');

    // Get all grades for the student (optionally filtered by course)
    const grades = await getStudentGradesSummary(studentUserId, courseId);

    // Calculate average GPA
    const averageGPA = calculateAverageGrade(grades);
    
    // Calculate overall percentage
    const overallPercentage = calculateOverallPercentage(grades);

    if (averageGPA === null) {
      return {
        studentUserId,
        averageGrade: null,
        overallPercentage: overallPercentage,
        letterGrade: null,
        gradedAssignments: 0,
        totalAssignments: grades.length,
        message: 'No graded assignments found for this student'
      };
    }

    const letterGrade = toLetterGrade(averageGPA);

    const gradedByGrade = grades.filter(g => g.grade && g.grade.trim() !== '').length;
    const gradedByScoreOnly = grades.filter(g => (!g.grade || g.grade.trim() === '') && g.score != null).length;

    return {
      studentUserId,
      averageGrade: averageGPA,
      overallPercentage: overallPercentage,
      letterGrade,
      gradedAssignments: gradedByGrade + gradedByScoreOnly,
      gradedByGrade,
      gradedByScoreOnly,
      totalAssignments: grades.length,
      allGrades: grades
    };
  } catch (error) {
    console.error('Error getting average grade:', error);
    throw error;
  }
}

/**
 * Ask a question and get AI response based on live database data
 */
export async function askQuestion(userQuestion, studentUserId, courseId = null) {
  try {
    // Use OpenAI to classify if this is a grade-related query
    const isGradeQuery = await classifyQuestionIntent(userQuestion);

    if (isGradeQuery) {
      let effectiveCourseId = courseId;
      const questionLower = userQuestion.toLowerCase();
      let matchedCourse = null;
      let courses = null;

      const allCoursesRegex = /\b(all\s+(classes|courses)|every\s+(class|course)|across\s+all\s+(classes|courses)|each\s+(class|course)|by\s+(class|course)|broken\s+down\s+by\s+(class|course)|per\s+(class|course))\b/i;
      const asksAllCoursesBreakdown = allCoursesRegex.test(questionLower);
      const asksOverallGPA = /\b(gpa|overall\s+(gpa|grade|average)|cumulative\s+(gpa|grade|average)|numerical\s+overall)\b/i.test(questionLower);

      if (asksAllCoursesBreakdown || asksOverallGPA) {
        // User explicitly asked for cross-course output, so ignore any incoming course scope.
        effectiveCourseId = null;
      }

      if (!asksAllCoursesBreakdown && !asksOverallGPA) {
        const { getStudentCourses } = await import('./supabaseClient.js');
        courses = await getStudentCourses(studentUserId);

        const nlpResolvedCourseId = await resolveCourseFromQuestionNLP(userQuestion, courses);
        if (nlpResolvedCourseId != null) {
          matchedCourse = courses.find(c => Number(c.course_id) === Number(nlpResolvedCourseId)) || null;
        }

        if (!matchedCourse) {
          matchedCourse = resolveCourseFromQuestion(userQuestion, courses);
        }

        // If user explicitly mentions a course in the question, that should win over any preselected courseId.
        if (matchedCourse && matchedCourse.course_id) {
          effectiveCourseId = matchedCourse.course_id;
        }
      }

      const averageData = await getAverageGrade(studentUserId, effectiveCourseId);

      const dateRange = extractDateRange(userQuestion);
      if (dateRange) {
        const allGrades = averageData.allGrades || [];
        const filteredGrades = allGrades.filter(g => {
          if (dateRange.semester != null) {
            return Number(g.assignments?.semester) === dateRange.semester;
          }
          const dueAt = g.assignments?.due_at;
          if (!dueAt) return false;
          const d = new Date(dueAt);
          return d >= dateRange.start && d < dateRange.end;
        });

        if (filteredGrades.length === 0) {
          return {
            question: userQuestion,
            response: `No graded assignments found for ${dateRange.label}.`,
            context: { ...averageData, dateRange: dateRange.label, filteredCount: 0 },
            allGrades: [],
            dataUsed: ['grades'],
            apiCall: 'DATE_RANGE_GRADE_QUERY'
          };
        }

        const courseLabel = matchedCourse ? getCourseLabelFromEnrollment(matchedCourse) : null;

        let totalScore = 0;
        let totalPossible = 0;
        for (const g of filteredGrades) {
          const pts = Number(g.assignments?.points_possible);
          if (!pts || pts <= 0 || g.score == null) continue;
          totalScore += Number(g.score);
          totalPossible += pts;
        }
        const periodPct = totalPossible > 0 ? ((totalScore / totalPossible) * 100).toFixed(2) : null;
        const periodLetter = percentToLetterGrade(periodPct);

        const summary = periodPct !== null
          ? `Period summary: ${totalScore}/${totalPossible} = ${periodPct}% (${periodLetter}) across ${filteredGrades.length} assignments for ${dateRange.label}.\nWhen answering, lead with this overall percentage and letter grade.\n\n`
          : '';

        const ctx = summary + `Date range: ${dateRange.label}\n\n` + buildAssignmentListContext(filteredGrades, courseLabel);
        const aiResponse = await generateResponse(userQuestion, ctx);

        return {
          question: userQuestion,
          response: aiResponse,
          context: { ...averageData, dateRange: dateRange.label, filteredCount: filteredGrades.length },
          allGrades: filteredGrades,
          dataUsed: ['grades'],
          apiCall: 'DATE_RANGE_GRADE_QUERY'
        };
      }

      if (isTrendQuery(userQuestion)) {
        const trend = computeTrend(averageData.allGrades);
        const courseLabel = matchedCourse
          ? getCourseLabelFromEnrollment(matchedCourse)
          : 'across all courses';

        if (!trend.hasEnoughData) {
          return {
            question: userQuestion,
            response: `Not enough graded assignments to detect a trend yet (need at least 4, currently have ${trend.count}).`,
            context: { ...averageData, trend },
            allGrades: averageData.allGrades,
            dataUsed: ['grades'],
            apiCall: 'TREND_QUERY'
          };
        }

        const sign = parseFloat(trend.diff) >= 0 ? '+' : '';
        const response = `${courseLabel}: Grades are ${trend.direction}. ` +
          `Early average (from ${trend.firstDate}): ${trend.firstHalfAvg}%. ` +
          `Recent average (through ${trend.lastDate}): ${trend.secondHalfAvg}%. ` +
          `That's a ${sign}${trend.diff}% change over ${trend.count} graded assignments.`;

        return {
          question: userQuestion,
          response,
          context: { ...averageData, trend },
          allGrades: averageData.allGrades,
          dataUsed: ['grades'],
          apiCall: 'TREND_QUERY'
        };
      }

      const asksSpecificAssignment = /\b(highest|lowest|best|worst|top|bottom|which\s+(assignment|test|quiz|project|grade|score)|what\s+(test|quiz|assignment|project)|how\s+did\s+he\s+do\s+on|how\s+did\s+she\s+do\s+on)\b/i.test(questionLower);

      if (asksSpecificAssignment && !asksAllCoursesBreakdown) {
        const courseLabel = matchedCourse ? getCourseLabelFromEnrollment(matchedCourse) : null;
        const detailedContext = buildAssignmentListContext(averageData.allGrades, courseLabel);
        const aiResponse = await generateResponse(userQuestion, detailedContext);

        return {
          question: userQuestion,
          response: aiResponse,
          overallPercentage: averageData.overallPercentage,
          context: averageData,
          allGrades: averageData.allGrades,
          dataUsed: ['grades'],
          apiCall: 'SPECIFIC_GRADE_QUERY'
        };
      }

      if (asksAllCoursesBreakdown) {
        const courseBreakdown = await buildCourseBreakdown(averageData.allGrades || []);

        if (courseBreakdown.length === 0) {
          return {
            question: userQuestion,
            response: 'I could not find graded assignments across your courses yet.',
            overallPercentage: averageData.overallPercentage,
            context: {
              ...averageData,
              courseBreakdown
            },
            allGrades: averageData.allGrades,
            dataUsed: ['grades'],
            apiCall: 'AVERAGE_GRADE'
          };
        }

        const courseLines = courseBreakdown
          .map(row => {
            const gpaPart = row.averageGrade !== null ? `GPA ${row.averageGrade} (${row.letterGrade})` : 'No GPA yet';
            const pctPart = row.overallPercentage !== null ? `${row.overallPercentage}%` : 'N/A%';
            return `- ${row.courseLabel}: ${gpaPart}, ${pctPart}, based on ${row.gradedAssignments}/${row.totalAssignments} assignments`;
          })
          .join('\n');

        return {
          question: userQuestion,
          response: `Here is your grade breakdown by course:\n${courseLines}\n\nOverall across all classes: GPA ${averageData.averageGrade} (${averageData.letterGrade}), ${averageData.overallPercentage}%, based on ${averageData.gradedAssignments}/${averageData.totalAssignments} assignments.`,
          overallPercentage: averageData.overallPercentage,
          context: {
            ...averageData,
            courseBreakdown
          },
          allGrades: averageData.allGrades,
          dataUsed: ['grades'],
          apiCall: 'AVERAGE_GRADE'
        };
      }

      if (asksOverallGPA) {
        return {
          question: userQuestion,
          response: `Your overall GPA is ${averageData.averageGrade}.`,
          overallPercentage: averageData.overallPercentage,
          context: averageData,
          allGrades: averageData.allGrades,
          dataUsed: ['grades'],
          apiCall: 'AVERAGE_GRADE'
        };
      }

      if (matchedCourse && effectiveCourseId) {
        const courseLabel = getCourseLabelFromEnrollment(matchedCourse);
        const gpaPart = averageData.averageGrade !== null
          ? `GPA ${averageData.averageGrade} (${averageData.letterGrade})`
          : 'No GPA yet';
        const pctPart = averageData.overallPercentage !== null
          ? `${averageData.overallPercentage}%`
          : 'N/A%';

        return {
          question: userQuestion,
          response: `${courseLabel}: ${gpaPart}, ${pctPart}, based on ${averageData.gradedAssignments}/${averageData.totalAssignments} assignments.`,
          overallPercentage: averageData.overallPercentage,
          context: {
            ...averageData,
            matchedCourse: {
              courseId: matchedCourse.course_id,
              courseLabel
            }
          },
          allGrades: averageData.allGrades,
          dataUsed: ['grades'],
          apiCall: 'AVERAGE_GRADE'
        };
      }

      return {
        question: userQuestion,
        response: `Your average grade (GPA) is ${averageData.averageGrade}, which corresponds to a letter grade of ${averageData.letterGrade}. Your overall percentage grade is ${averageData.overallPercentage}%. This is based on ${averageData.gradedAssignments} graded assignments out of ${averageData.totalAssignments} total assignments.`,
        overallPercentage: averageData.overallPercentage,
        context: averageData,
        allGrades: averageData.allGrades,
        dataUsed: ['grades'],
        apiCall: 'AVERAGE_GRADE'
      };
    }

    // Fetch relevant data from database based on the question
    const contextData = await queryContextForQuestion(userQuestion, studentUserId, courseId);

    if (!contextData || Object.keys(contextData).length === 0) {
      return {
        question: userQuestion,
        response: 'Unable to retrieve relevant data from the database.',
        context: {},
      };
    }

    // Build context string from actual database data
    const contextString = formatContextForOpenAI(contextData);

    // Generate response using OpenAI with real data context
    const aiResponse = await generateResponse(userQuestion, contextString);

    // Check if OpenAI indicated this should be an API call
    if (aiResponse.includes('[API_CALL:AVERAGE_GRADE]')) {
      // Extract the response part and call the average grade endpoint
      const responseText = aiResponse.replace('[API_CALL:AVERAGE_GRADE]', '').trim();
      const averageData = await getAverageGrade(studentUserId, courseId);
      return {
        question: userQuestion,
        response: responseText,
        context: averageData,
        dataUsed: ['grades'],
        apiCall: 'AVERAGE_GRADE'
      };
    }

    return {
      question: userQuestion,
      response: aiResponse,
      context: contextData, // Return actual data for reference
      allGrades: contextData.grades || [],
      dataUsed: Object.keys(contextData).filter(k => contextData[k] && contextData[k].length > 0),
    };
  } catch (error) {
    console.error('Error in askQuestion:', error);
    throw error;
  }
}

/**
 * Get insights about a student's performance
 */
export async function getStudentInsights(studentUserId, courseId = null) {
  try {
    const contextData = await queryContextForQuestion('overall performance', studentUserId, courseId);
    
    const insights = {
      studentName: contextData.studentInfo?.full_name,
      enrolledCourses: contextData.courses?.length || 0,
      averageGrade: null,
      missingCount: contextData.missing?.length || 0,
      lateCount: contextData.late?.length || 0,
      excusedCount: 0,
    };

    if (contextData.grades && contextData.grades.length > 0) {
      // Import the calculateAverageGrade function
      const { calculateAverageGrade } = await import('./supabaseClient.js');
      insights.averageGrade = calculateAverageGrade(contextData.grades);
      insights.excusedCount = contextData.grades.filter(g => g.excused).length;
    }

    return insights;
  } catch (error) {
    console.error('Error getting student insights:', error);
    throw error;
  }
}

/**
 * Interactive chat session
 */
export async function startChatSession(studentUserId, courseId = null) {
  return {
    sendMessage: async function(message) {
      try {
        const response = await askQuestion(message, studentUserId, courseId);
        return {
          userMessage: message,
          botResponse: response.response,
          context: response.context,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        console.error('Error in chat session:', error);
        throw error;
      }
    },
  };
}

export default {
  askQuestion,
  getStudentInsights,
  startChatSession,
};
