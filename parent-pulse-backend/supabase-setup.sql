-- Supabase Database Setup for ParentPulse Chatbot
-- Run this SQL in your Supabase SQL Editor to create the required tables

-- Enable Row Level Security (RLS) for all tables
-- This ensures data security and proper access control

-- ============================================
-- ACCOUNTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.accounts (
  account_id bigint NOT NULL DEFAULT nextval('accounts_account_id_seq'::regclass),
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT accounts_pkey PRIMARY KEY (account_id)
);

-- Enable RLS
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TERMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.terms (
  term_id bigint NOT NULL DEFAULT nextval('terms_term_id_seq'::regclass),
  account_id bigint NOT NULL,
  name text NOT NULL,
  start_date date,
  end_date date,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT terms_pkey PRIMARY KEY (term_id),
  CONSTRAINT terms_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(account_id)
);

ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.users (
  user_id bigint NOT NULL DEFAULT nextval('users_user_id_seq'::regclass),
  account_id bigint NOT NULL,
  full_name text NOT NULL,
  email text,
  user_type text NOT NULL CHECK (user_type = ANY (ARRAY['student'::text, 'teacher'::text, 'parent'::text, 'admin'::text])),
  sis_user_id text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (user_id),
  CONSTRAINT users_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(account_id)
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- ============================================
-- COURSES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.courses (
  course_id bigint NOT NULL DEFAULT nextval('courses_course_id_seq'::regclass),
  account_id bigint NOT NULL,
  term_id bigint,
  course_code text,
  name text NOT NULL,
  sis_course_id text,
  workflow_state text NOT NULL DEFAULT 'available'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT courses_pkey PRIMARY KEY (course_id),
  CONSTRAINT courses_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(account_id),
  CONSTRAINT courses_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.terms(term_id)
);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- ============================================
-- SECTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.sections (
  section_id bigint NOT NULL DEFAULT nextval('sections_section_id_seq'::regclass),
  course_id bigint NOT NULL,
  name text NOT NULL,
  sis_section_id text,
  start_date date,
  end_date date,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT sections_pkey PRIMARY KEY (section_id),
  CONSTRAINT sections_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(course_id)
);

ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

-- ============================================
-- ASSIGNMENT_GROUPS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.assignment_groups (
  assignment_group_id bigint NOT NULL DEFAULT nextval('assignment_groups_assignment_group_id_seq'::regclass),
  course_id bigint NOT NULL,
  name text NOT NULL,
  position integer,
  group_weight numeric,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT assignment_groups_pkey PRIMARY KEY (assignment_group_id),
  CONSTRAINT assignment_groups_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(course_id)
);

ALTER TABLE public.assignment_groups ENABLE ROW LEVEL SECURITY;

-- ============================================
-- ASSIGNMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.assignments (
  assignment_id bigint NOT NULL DEFAULT nextval('assignments_assignment_id_seq'::regclass),
  course_id bigint NOT NULL,
  assignment_group_id bigint,
  name text NOT NULL,
  points_possible numeric,
  due_at timestamp with time zone,
  unlock_at timestamp with time zone,
  lock_at timestamp with time zone,
  published boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  semester integer,
  CONSTRAINT assignments_pkey PRIMARY KEY (assignment_id),
  CONSTRAINT assignments_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(course_id),
  CONSTRAINT assignments_assignment_group_id_fkey FOREIGN KEY (assignment_group_id) REFERENCES public.assignment_groups(assignment_group_id)
);

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- ENROLLMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.enrollments (
  enrollment_id bigint NOT NULL DEFAULT nextval('enrollments_enrollment_id_seq'::regclass),
  course_id bigint NOT NULL,
  section_id bigint,
  user_id bigint NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['student'::text, 'teacher'::text, 'ta'::text, 'observer'::text, 'designer'::text])),
  enrollment_state text NOT NULL DEFAULT 'active'::text CHECK (enrollment_state = ANY (ARRAY['active'::text, 'inactive'::text, 'completed'::text, 'invited'::text])),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT enrollments_pkey PRIMARY KEY (enrollment_id),
  CONSTRAINT enrollments_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(course_id),
  CONSTRAINT enrollments_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(section_id),
  CONSTRAINT enrollments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);

ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- SUBMISSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.submissions (
  submission_id bigint NOT NULL DEFAULT nextval('submissions_submission_id_seq'::regclass),
  assignment_id bigint NOT NULL,
  student_user_id bigint NOT NULL,
  score numeric,
  grade text,
  excused boolean DEFAULT false,
  missing boolean DEFAULT false,
  late boolean DEFAULT false,
  workflow_state text DEFAULT 'submitted'::text,
  submitted_at timestamp with time zone,
  graded_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT submissions_pkey PRIMARY KEY (submission_id),
  CONSTRAINT submissions_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignments(assignment_id),
  CONSTRAINT submissions_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES public.users(user_id)
);

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- GRADING_PERIODS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.grading_periods (
  grading_period_id bigint NOT NULL DEFAULT nextval('grading_periods_grading_period_id_seq'::regclass),
  course_id bigint NOT NULL,
  title text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  close_date date,
  weight numeric,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT grading_periods_pkey PRIMARY KEY (grading_period_id),
  CONSTRAINT grading_periods_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(course_id)
);

ALTER TABLE public.grading_periods ENABLE ROW LEVEL SECURITY;

-- ============================================
-- OBSERVER_LINKS TABLE (for parent-student relationships)
-- ============================================
CREATE TABLE IF NOT EXISTS public.observer_links (
  parent_user_id bigint NOT NULL,
  student_user_id bigint NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT observer_links_pkey PRIMARY KEY (parent_user_id, student_user_id),
  CONSTRAINT observer_links_parent_user_id_fkey FOREIGN KEY (parent_user_id) REFERENCES public.users(user_id),
  CONSTRAINT observer_links_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES public.users(user_id)
);

ALTER TABLE public.observer_links ENABLE ROW LEVEL SECURITY;

-- ============================================
-- IMPORT TABLES (for grade imports)
-- ============================================
CREATE TABLE IF NOT EXISTS public.import_batches (
  import_batch_id bigint NOT NULL DEFAULT nextval('import_batches_import_batch_id_seq'::regclass),
  batch_name text NOT NULL,
  source_file_name text,
  source_type text,
  imported_by text,
  imported_at timestamp with time zone DEFAULT now(),
  notes text,
  CONSTRAINT import_batches_pkey PRIMARY KEY (import_batch_id)
);

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.raw_grade_imports (
  raw_import_id bigint NOT NULL DEFAULT nextval('raw_grade_imports_raw_import_id_seq'::regclass),
  import_batch_id bigint,
  student_name text,
  course_name text,
  teacher_name text,
  assignment_group_name text,
  assignment_name text,
  due_date_text text,
  submitted_date_text text,
  points_possible_text text,
  score_text text,
  grade_text text,
  missing_text text,
  late_text text,
  excused_text text,
  source_file_name text,
  imported_at timestamp with time zone DEFAULT now(),
  semester_text text,
  percentage_text text,
  CONSTRAINT raw_grade_imports_pkey PRIMARY KEY (raw_import_id)
);

ALTER TABLE public.raw_grade_imports ENABLE ROW LEVEL SECURITY;

-- ============================================
-- CREATE SEQUENCES (if not already created)
-- ============================================
CREATE SEQUENCE IF NOT EXISTS accounts_account_id_seq;
CREATE SEQUENCE IF NOT EXISTS terms_term_id_seq;
CREATE SEQUENCE IF NOT EXISTS users_user_id_seq;
CREATE SEQUENCE IF NOT EXISTS courses_course_id_seq;
CREATE SEQUENCE IF NOT EXISTS sections_section_id_seq;
CREATE SEQUENCE IF NOT EXISTS assignment_groups_assignment_group_id_seq;
CREATE SEQUENCE IF NOT EXISTS assignments_assignment_id_seq;
CREATE SEQUENCE IF NOT EXISTS enrollments_enrollment_id_seq;
CREATE SEQUENCE IF NOT EXISTS submissions_submission_id_seq;
CREATE SEQUENCE IF NOT EXISTS grading_periods_grading_period_id_seq;
CREATE SEQUENCE IF NOT EXISTS import_batches_import_batch_id_seq;
CREATE SEQUENCE IF NOT EXISTS raw_grade_imports_raw_import_id_seq;

-- ============================================
-- BASIC RLS POLICIES (Allow authenticated users to read)
-- ============================================
-- Note: You'll want to customize these policies based on your security requirements

-- Allow authenticated users to read accounts
CREATE POLICY "Allow authenticated users to read accounts" ON public.accounts
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allow authenticated users to read users
CREATE POLICY "Allow authenticated users to read users" ON public.users
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allow authenticated users to read courses
CREATE POLICY "Allow authenticated users to read courses" ON public.courses
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allow authenticated users to read enrollments
CREATE POLICY "Allow authenticated users to read enrollments" ON public.enrollments
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allow authenticated users to read assignments
CREATE POLICY "Allow authenticated users to read assignments" ON public.assignments
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allow authenticated users to read submissions
CREATE POLICY "Allow authenticated users to read submissions" ON public.submissions
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
-- After running this script, your Supabase database will be ready for the chatbot!
-- Run the seed script: node scripts/seed.js
-- Then test: curl -X POST http://localhost:3000/api/chat/ask -H "Content-Type: application/json" -d '{"question":"What is my overall grade?","studentUserId":1}'