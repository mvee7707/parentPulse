import fs from "fs";
import path from "path";
import { supabase } from "./supabaseClient.js";
import "./initSchema.js";  

const JSON_DIR = "./jsonData"; 
const DRY_RUN = false; // Set to true to skip actual DB writes and just log actions

function fakeId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

async function insertRow(table, payload) {
  if (DRY_RUN) {
    const fake = { id: fakeId(table) };
    console.log(`[DRY RUN] → ${table}`, payload, "→", fake.id);
    return fake;
  }

  const { data, error } = await supabase.from(table).insert(payload).select();
  if (error) throw error;
  return data[0];
}

function mapStatus(status) {
  return {
    excused: status === "Excuse",
    missing: status === "Missing",
    late: status === "Late"
  };
}

async function importGrades() {
  const files = fs.readdirSync(JSON_DIR).filter(f => f.endsWith(".json"));
  console.log(`Found ${files.length} JSON files`);

  for (const file of files) {
    console.log(`\n📄 Importing ${file}`);

    const raw = JSON.parse(fs.readFileSync(path.join(JSON_DIR, file), "utf8"));
    const studentName = raw.student;

    // 1. ACCOUNT
    const accountRow = await insertRow("accounts", {
      name: `${studentName}-account`
    });

    // 2. USER
    const userRow = await insertRow("users", {
      account_id: accountRow.id,
      full_name: studentName,
      email: `${studentName.toLowerCase()}@school.edu`,
      user_type: "student"
    });

    // 3. CLASSES → COURSES
    for (const [className, classData] of Object.entries(raw.classes)) {
      const courseRow = await insertRow("courses", {
        account_id: accountRow.id,
        course_code: className,
        name: className
      });

      // 4. ENROLLMENT
      await insertRow("enrollments", {
        user_id: userRow.id,
        course_id: courseRow.id,
        role: "student"
      });

      // 5. TERMS → GRADING PERIODS
      for (const [termLabel, termData] of Object.entries(classData.terms)) {
        const gradingPeriodRow = await insertRow("grading_periods", {
          course_id: courseRow.id,
          title: termLabel,
          start_date: "2024-01-01",
          end_date: "2024-12-31"
        });

        // 6. ASSIGNMENTS
        for (const a of termData.assignments) {
          // CATEGORY → assignment_groups
          let groupId = null;
          if (a.category) {
            const groupRow = await insertRow("assignment_groups", {
              course_id: courseRow.id,
              name: a.category
            });
            groupId = groupRow.id;
          }

          const assignmentRow = await insertRow("assignments", {
            course_id: courseRow.id,
            assignment_group_id: groupId,
            name: a.name,
            points_possible: a.max,
            due_at: a.due ? new Date(a.due) : null
          });

          const flags = mapStatus(a.status);

          // 7. SUBMISSIONS
          await insertRow("submissions", {
            assignment_id: assignmentRow.id,
            student_user_id: userRow.id,
            score: a.pts,
            grade:
              a.pts != null && a.max != null
                ? ((a.pts / a.max) * 100).toFixed(2) + "%"
                : null,
            excused: flags.excused,
            missing: flags.missing,
            late: flags.late
          });
        }
      }
    }
  }

  console.log("\n Import complete");
}

importGrades();
