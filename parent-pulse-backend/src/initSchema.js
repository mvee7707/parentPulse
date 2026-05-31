import { supabase } from "./supabaseClient.js";

async function runSQL(sql) {
  const { error } = await supabase.rpc("exec_sql", { sql });
  if (error) console.error("SQL Error:", error);
}

export async function initSchema() {
  console.log("🔧 Ensuring tables exist...");

  await runSQL(`
    CREATE TABLE IF NOT EXISTS accounts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text
    );
  `);

  await runSQL(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid REFERENCES accounts(id),
      full_name text,
      email text,
      user_type text
    );
  `);

  await runSQL(`
    CREATE TABLE IF NOT EXISTS courses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid REFERENCES accounts(id),
      course_code text,
      name text
    );
  `);

  await runSQL(`
    CREATE TABLE IF NOT EXISTS enrollments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES users(id),
      course_id uuid REFERENCES courses(id),
      role text
    );
  `);

  await runSQL(`
    CREATE TABLE IF NOT EXISTS grading_periods (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id uuid REFERENCES courses(id),
      title text,
      start_date date,
      end_date date
    );
  `);

  await runSQL(`
    CREATE TABLE IF NOT EXISTS assignment_groups (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id uuid REFERENCES courses(id),
      name text
    );
  `);

  await runSQL(`
    CREATE TABLE IF NOT EXISTS assignments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id uuid REFERENCES courses(id),
      assignment_group_id uuid REFERENCES assignment_groups(id),
      name text,
      points_possible numeric,
      due_at timestamptz
    );
  `);

  await runSQL(`
    CREATE TABLE IF NOT EXISTS submissions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id uuid REFERENCES assignments(id),
      student_user_id uuid REFERENCES users(id),
      score numeric,
      grade text,
      excused boolean,
      missing boolean,
      late boolean
    );
  `);

  console.log("✅ Schema ready");
}
