import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials in environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Get student's current grades and submission summary
 */
export async function getStudentGradesSummary(studentUserId, courseId = null) {
  try {
    console.log('[getStudentGradesSummary] Starting query for studentUserId:', studentUserId, 'courseId:', courseId);
    let query = supabase
      .from('submissions')
      .select(`
        score,
        grade,
        excused,
        missing,
        late,
        submitted_at,
        graded_at,
        assignment_id,
        assignments(name, points_possible, due_at, course_id, courses(course_code, name)),
        student_user_id
      `)
      .eq('student_user_id', studentUserId);

    if (courseId) {
      query = query.eq('assignments.course_id', courseId);
    }

    const { data, error } = await query;
    console.log('[getStudentGradesSummary] Query completed');
    console.log('[getStudentGradesSummary] Error:', error);
    console.log('[getStudentGradesSummary] Data length:', data?.length || 0);
    console.log('[getStudentGradesSummary] Raw data:', JSON.stringify(data, null, 2));
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching student grades:', error);
    throw error;
  }
}

/**
 * Get missing assignments for a student
 */
export async function getMissingAssignments(studentUserId, courseId = null) {
  try {
    let query = supabase
      .from('submissions')
      .select(`
        submission_id,
        missing,
        late,
        excused,
        submitted_at,
        assignment_id,
        assignments(name, due_at, points_possible, courses(name)),
        student_user_id
      `)
      .eq('student_user_id', studentUserId)
      .eq('missing', true);
    
    if (courseId) {
      query = query.eq('assignments.course_id', courseId);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching missing assignments:', error);
    throw error;
  }
}

/**
 * Get student's course enrollments and grades
 */
export async function getStudentCourses(studentUserId) {
  try {
    const { data, error } = await supabase
      .from('enrollments')
      .select(`
        course_id,
        courses(course_code, name, account_id)
      `)
      .eq('user_id', studentUserId)
      .eq('role', 'student');
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching student courses:', error);
    throw error;
  }
}

/**
 * Get assignment group weights and details
 */
export async function getAssignmentGroupWeights(courseId) {
  try {
    const { data, error } = await supabase
      .from('assignment_groups')
      .select('*')
      .eq('course_id', courseId);
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching assignment groups:', error);
    throw error;
  }
}

/**
 * Get student information
 */
export async function getStudentInfo(studentUserId) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', studentUserId)
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching student info:', error);
    throw error;
  }
}

/**
 * Get all submissions for a course
 */
export async function getCourseSubmissions(courseId) {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select(`
        score,
        grade,
        missing,
        late,
        excused,
        graded_at,
        assignment_id,
        student_user_id,
        assignments(name, due_at, assignment_group_id),
        users(full_name, email)
      `)
      .eq('assignments.course_id', courseId);
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching course submissions:', error);
    throw error;
  }
}

/**
 * Get grading periods for a course
 */
export async function getGradingPeriods(courseId) {
  try {
    const { data, error } = await supabase
      .from('grading_periods')
      .select('*')
      .eq('course_id', courseId)
      .order('start_date', { ascending: true });
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching grading periods:', error);
    throw error;
  }
}

/**
 * Get late submissions
 */
export async function getLateSubmissions(studentUserId) {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select(`
        submission_id,
        score,
        grade,
        late,
        submitted_at,
        assignment_id,
        assignments(name, due_at, points_possible),
        student_user_id
      `)
      .eq('student_user_id', studentUserId)
      .eq('late', true);
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching late submissions:', error);
    throw error;
  }
}

/**
 * Query relevant data for a question (intelligent search)
 */
export async function queryContextForQuestion(question, studentUserId, courseId = null) {
  try {
    const questionLower = question.toLowerCase();
    let context = {};

    // Help determine what data to fetch based on question keywords
    // Enhanced grade detection for various phrasings
    const gradeKeywords = ['grade', 'score', 'average', 'gpa', 'performance', 'overall', 'mean', 'standing'];
    const hasGradeQuery = gradeKeywords.some(keyword => questionLower.includes(keyword));
    if (hasGradeQuery) {
      context.grades = await getStudentGradesSummary(studentUserId);
    }
    
    if (questionLower.includes('missing')) {
      context.missing = await getMissingAssignments(studentUserId, courseId);
    }
    
    if (questionLower.includes('late')) {
      context.late = await getLateSubmissions(studentUserId);
    }
    
    if (questionLower.includes('course') || questionLower.includes('class')) {
      context.courses = await getStudentCourses(studentUserId);
    }
    
    if (questionLower.includes('assignment') || questionLower.includes('group') || questionLower.includes('weight')) {
      if (courseId) {
        context.assignmentGroups = await getAssignmentGroupWeights(courseId);
      }
    }
    
    if (questionLower.includes('period')) {
      if (courseId) {
        context.gradingPeriods = await getGradingPeriods(courseId);
      }
    }

    // Always include student info
    context.studentInfo = await getStudentInfo(studentUserId);
    
    return context;
  } catch (error) {
    console.error('Error querying context:', error);
    throw error;
  }
}

/**
 * Convert letter grade to numeric GPA value
 */
export function convertGradeToGPA(grade) {
  if (!grade) return null;

  const gradeStr = String(grade).trim();

  // Handle percentage grades (e.g., "85.00%", "92%")
  if (gradeStr.includes('%')) {
    const percentMatch = gradeStr.match(/(\d+\.?\d*)/);
    if (percentMatch) {
      const percent = parseFloat(percentMatch[1]);
      console.log(`[convertGradeToGPA] Converting percentage "${grade}" to GPA`);
      
      if (percent >= 97) return 4.0;
      if (percent >= 93) return 4.0;
      if (percent >= 90) return 3.7;
      if (percent >= 87) return 3.3;
      if (percent >= 83) return 3.0;
      if (percent >= 80) return 2.7;
      if (percent >= 77) return 2.3;
      if (percent >= 73) return 2.0;
      if (percent >= 70) return 1.7;
      if (percent >= 67) return 1.3;
      if (percent >= 63) return 1.0;
      if (percent >= 60) return 0.7;
      return 0.0;
    }
  }

  // Handle letter grades (e.g., "A", "B+", "A-")
  const gradeMap = {
    'A+': 4.0, 'A': 4.0, 'A-': 3.7,
    'B+': 3.3, 'B': 3.0, 'B-': 2.7,
    'C+': 2.3, 'C': 2.0, 'C-': 1.7,
    'D+': 1.3, 'D': 1.0, 'D-': 0.7,
    'F': 0.0
  };

  console.log(`[convertGradeToGPA] Converting letter grade "${grade}" to GPA`);
  return gradeMap[gradeStr.toUpperCase()] || null;
}

/**
 * Convert numeric score into GPA value (if letter not available)
 */
export function convertScoreToGPA(score, pointsPossible = null) {
  if (score == null) return null;

  let percent;
  if (pointsPossible && Number(pointsPossible) > 0) {
    percent = (Number(score) / Number(pointsPossible)) * 100;
  } else {
    percent = Number(score);
  }

  if (Number.isNaN(percent)) return null;

  if (percent >= 97) return 4.0;
  if (percent >= 93) return 4.0;
  if (percent >= 90) return 3.7;
  if (percent >= 87) return 3.3;
  if (percent >= 83) return 3.0;
  if (percent >= 80) return 2.7;
  if (percent >= 77) return 2.3;
  if (percent >= 73) return 2.0;
  if (percent >= 70) return 1.7;
  if (percent >= 67) return 1.3;
  if (percent >= 63) return 1.0;
  if (percent >= 60) return 0.7;
  return 0.0;
}

/**
 * Calculate average grade from letter grades or numeric score fallback.
 */
export function calculateAverageGrade(grades) {
  console.log('\n[calculateAverageGrade] ========== START ==========');
  console.log('[calculateAverageGrade] Input: grades.length =', grades.length);
  
  // Log why each grade is being filtered
  grades.forEach((g, idx) => {
    console.log(`[calculateAverageGrade] Record ${idx}: excused=${g.excused}, missing=${g.missing}`);
    if (g.excused || g.missing) {
      console.log(`[calculateAverageGrade]   -> FILTERED OUT (excused or missing)`);
    }
  });
  
  const filtered = grades.filter(g => !(g.excused || g.missing));
  console.log('[calculateAverageGrade] After excused/missing filter:', filtered.length, 'remaining');
  
  const numericGrades = filtered
    .map((g, idx) => {
      const hasGrade = g.grade && g.grade.trim() !== '';
      const hasScore = g.score != null;
      const hasAssignments = !!g.assignments;
      console.log(`[calculateAverageGrade] Processing ${idx}: grade="${g.grade}" (has=${hasGrade}), score=${g.score} (has=${hasScore}), assignments=${hasAssignments}`);
      
      if (hasGrade) {
        const gpa = convertGradeToGPA(g.grade);
        console.log(`[calculateAverageGrade]   -> Using letter grade: "${g.grade}" -> GPA ${gpa}`);
        return gpa;
      }

      if (hasScore) {
        const pointsPossible = g.assignments?.points_possible || null;
        const gpa = convertScoreToGPA(g.score, pointsPossible);
        console.log(`[calculateAverageGrade]   -> Using score fallback: ${g.score}/${pointsPossible} -> GPA ${gpa}`);;
        return gpa;
      }

      console.log(`[calculateAverageGrade]   -> FILTERED OUT (no grade and no score)`);
      return null;
    })
    .filter(g => g !== null);

  console.log('[calculateAverageGrade] After mapping/filtering: numericGrades.length =', numericGrades.length);
  console.log('[calculateAverageGrade] numericGrades =', numericGrades);
  
  if (numericGrades.length === 0) {
    console.log('[calculateAverageGrade] NO VALID GRADES FOUND - returning null');
    console.log('[calculateAverageGrade] ========== END (RETURNED NULL) ==========\n');
    return null;
  }

  const avg = numericGrades.reduce((a, b) => a + b, 0) / numericGrades.length;
  const result = avg.toFixed(2);
  console.log('[calculateAverageGrade] Average calculated:', result);
  console.log('[calculateAverageGrade] ========== END (SUCCESS) ==========\n');
  return result;
}

/**
 * Calculate overall percentage grade from all assignments
 */
export function calculateOverallPercentage(grades) {
  console.log('[calculateOverallPercentage] Starting with', grades.length, 'grades');
  
  const filtered = grades.filter(g => !(g.excused || g.missing));
  console.log('[calculateOverallPercentage] After filtering excused/missing:', filtered.length, 'remaining');
  
  const percentages = filtered
    .map((g, idx) => {
      // If grade is already a percentage string like "85.00%"
      if (g.grade && String(g.grade).includes('%')) {
        const match = String(g.grade).match(/(\d+\.?\d*)/);
        if (match) {
          const percent = parseFloat(match[1]);
          console.log(`[calculateOverallPercentage] Idx ${idx}: Extracted percentage from "${g.grade}" = ${percent}%`);
          return percent;
        }
      }
      
      // Fall back to calculating from score
      if (g.score != null && g.assignments?.points_possible != null) {
        const pointsPossible = Number(g.assignments.points_possible);
        if (pointsPossible > 0) {
          const percent = (Number(g.score) / pointsPossible) * 100;
          console.log(`[calculateOverallPercentage] Idx ${idx}: Calculated from score ${g.score}/${pointsPossible} = ${percent.toFixed(2)}%`);
          return percent;
        }
      }
      
      console.log(`[calculateOverallPercentage] Idx ${idx}: No percentage available`);
      return null;
    })
    .filter(p => p !== null);
  
  console.log('[calculateOverallPercentage] Valid percentages:', percentages);
  
  if (percentages.length === 0) {
    console.log('[calculateOverallPercentage] NO VALID PERCENTAGES - returning null');
    return null;
  }
  
  const avg = percentages.reduce((a, b) => a + b, 0) / percentages.length;
  const result = avg.toFixed(2);
  console.log('[calculateOverallPercentage] Overall percentage calculated:', result);
  return result;
}
export function formatContextForOpenAI(contextData) {
  let contextString = 'Student Database Context:\n\n';

  if (contextData.studentInfo) {
    contextString += `Student: ${contextData.studentInfo.full_name} (${contextData.studentInfo.email})\n`;
    contextString += `User Type: ${contextData.studentInfo.user_type}\n\n`;
  }

  if (contextData.courses && contextData.courses.length > 0) {
    contextString += 'Enrolled Courses:\n';
    contextData.courses.forEach(c => {
      if (c.courses) {
        contextString += `- ${c.courses.course_code || 'N/A'}: ${c.courses.name}\n`;
      }
    });
    contextString += '\n';
  }

  if (contextData.grades && contextData.grades.length > 0) {
    contextString += 'Grade Summary:\n';

    // Calculate average from letter grades
    const avgGrade = calculateAverageGrade(contextData.grades);
    if (avgGrade !== null) {
      contextString += `- Average Grade (GPA): ${avgGrade}\n`;
    }

    // Show individual grades
    const validGrades = contextData.grades.filter(g => g.grade && g.grade.trim() !== '');
    if (validGrades.length > 0) {
      contextString += `- Total Graded Assignments: ${validGrades.length}\n`;
      contextString += 'Recent Grades:\n';
      validGrades.slice(0, 5).forEach(g => {
        if (g.assignments) {
          contextString += `  - ${g.assignments.name}: ${g.grade} (${g.score || 'N/A'}%)\n`;
        }
      });
    }

    const excused = contextData.grades.filter(g => g.excused).length;
    if (excused > 0) {
      contextString += `- Excused Assignments: ${excused}\n`;
    }
    contextString += '\n';
  }

  if (contextData.missing && contextData.missing.length > 0) {
    contextString += `Missing Assignments (${contextData.missing.length}):\n`;
    contextData.missing.slice(0, 5).forEach(m => {
      if (m.assignments) {
        contextString += `- ${m.assignments.name} (due: ${m.assignments.due_at || 'N/A'})\n`;
      }
    });
    contextString += '\n';
  }

  if (contextData.late && contextData.late.length > 0) {
    contextString += `Late Submissions (${contextData.late.length}):\n`;
    contextData.late.slice(0, 5).forEach(l => {
      if (l.assignments) {
        contextString += `- ${l.assignments.name}: ${l.score || 0}/${l.assignments.points_possible}\n`;
      }
    });
    contextString += '\n';
  }

  if (contextData.assignmentGroups && contextData.assignmentGroups.length > 0) {
    contextString += 'Assignment Group Weights:\n';
    contextData.assignmentGroups.forEach(g => {
      contextString += `- ${g.name}: ${g.group_weight || 'N/A'}%\n`;
    });
    contextString += '\n';
  }

  if (contextData.gradingPeriods && contextData.gradingPeriods.length > 0) {
    contextString += 'Grading Periods:\n';
    contextData.gradingPeriods.forEach(p => {
      contextString += `- ${p.title}: ${p.start_date} to ${p.end_date}\n`;
    });
  }

  return contextString;
}

export default supabase;
