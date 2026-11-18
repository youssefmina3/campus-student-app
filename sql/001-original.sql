-- 1. Application users linked to Supabase Auth.
-- When inserting a user, supply the corresponding auth.users.id.
CREATE TABLE public.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid()
        REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    full_name text NOT NULL,
    timezone text NOT NULL DEFAULT 'UTC',
    default_currency_code text NOT NULL,
    CONSTRAINT users_currency_check
        CHECK (default_currency_code ~ '^[A-Z]{3}$')
);

-- 2. Courses owned by a user, including attendance policies.
CREATE TABLE public.courses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    user_id uuid NOT NULL
        REFERENCES public.users(id) ON DELETE CASCADE,
    course_code text,
    name text NOT NULL,
    semester text NOT NULL,
    semester_start date NOT NULL,
    semester_end date NOT NULL,
    professor_name text,
    professor_email text,
    minimum_attendance_percent numeric(5,2) NOT NULL DEFAULT 75.00,
    late_counts_as_present boolean NOT NULL DEFAULT true,
    exclude_excused_from_percentage boolean NOT NULL DEFAULT true,
    attendance_alert_enabled boolean NOT NULL DEFAULT true,
    CONSTRAINT courses_dates_check
        CHECK (semester_end >= semester_start),
    CONSTRAINT courses_attendance_percent_check
        CHECK (minimum_attendance_percent BETWEEN 0 AND 100)
);

-- 3. Saved classrooms and campus locations.
CREATE TABLE public.rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    user_id uuid NOT NULL
        REFERENCES public.users(id) ON DELETE CASCADE,
    room_name text NOT NULL,
    building text,
    campus text,
    directions text
);

-- 4. Recurring weekly schedules for courses.
CREATE TABLE public.schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    course_id uuid NOT NULL
        REFERENCES public.courses(id) ON DELETE NO ACTION,
    room_id uuid
        REFERENCES public.rooms(id) ON DELETE SET NULL,
    title text NOT NULL,
    weekday smallint NOT NULL,
    starts_at_local time NOT NULL,
    ends_at_local time NOT NULL,
    timezone text NOT NULL DEFAULT 'UTC',
    repeat_every_weeks smallint NOT NULL DEFAULT 1,
    effective_from date NOT NULL,
    effective_until date NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    CONSTRAINT schedules_weekday_check
        CHECK (weekday BETWEEN 1 AND 7),
    CONSTRAINT schedules_repeat_check
        CHECK (repeat_every_weeks > 0),
    CONSTRAINT schedules_times_check
        CHECK (ends_at_local > starts_at_local),
    CONSTRAINT schedules_dates_check
        CHECK (effective_until >= effective_from)
);

-- 5. Individual dated classes, including one-off and rescheduled classes.
CREATE TABLE public.class_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    course_id uuid NOT NULL
        REFERENCES public.courses(id) ON DELETE NO ACTION,
    schedule_id uuid
        REFERENCES public.schedules(id) ON DELETE SET NULL,
    room_id uuid
        REFERENCES public.rooms(id) ON DELETE SET NULL,
    occurrence_date date NOT NULL,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'scheduled',
    notes text,
    CONSTRAINT class_sessions_times_check
        CHECK (ends_at > starts_at),
    CONSTRAINT class_sessions_status_check
        CHECK (status IN ('scheduled', 'completed', 'cancelled')),
    CONSTRAINT class_sessions_occurrence_unique
        UNIQUE (schedule_id, occurrence_date)
);

-- 6. One attendance record per class session.
CREATE TABLE public.attendance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    class_session_id uuid NOT NULL UNIQUE
        REFERENCES public.class_sessions(id) ON DELETE CASCADE,
    status text NOT NULL,
    marked_at timestamptz NOT NULL DEFAULT now(),
    notes text,
    CONSTRAINT attendance_status_check
        CHECK (status IN ('present', 'absent', 'late', 'excused'))
);

-- 7. Assignments, exams, study tasks, and personal tasks with optional subtasks.
CREATE TABLE public.tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    user_id uuid NOT NULL
        REFERENCES public.users(id) ON DELETE CASCADE,
    course_id uuid
        REFERENCES public.courses(id) ON DELETE SET NULL,
    parent_task_id uuid
        REFERENCES public.tasks(id) ON DELETE SET NULL,
    title text NOT NULL,
    description text,
    task_type text NOT NULL,
    status text NOT NULL DEFAULT 'todo',
    priority smallint NOT NULL DEFAULT 2,
    planned_start_at timestamptz,
    planned_end_at timestamptz,
    due_at timestamptz,
    estimated_minutes integer,
    completed_at timestamptz,
    CONSTRAINT tasks_type_check
        CHECK (task_type IN ('assignment', 'exam', 'study', 'personal')),
    CONSTRAINT tasks_status_check
        CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),
    CONSTRAINT tasks_priority_check
        CHECK (priority BETWEEN 1 AND 3),
    CONSTRAINT tasks_estimated_minutes_check
        CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
    CONSTRAINT tasks_planned_times_check
        CHECK (
            planned_end_at IS NULL
            OR (
                planned_start_at IS NOT NULL
                AND planned_end_at > planned_start_at
            )
        ),
    CONSTRAINT tasks_parent_check
        CHECK (parent_task_id IS NULL OR parent_task_id <> id),
    CONSTRAINT tasks_completion_check
        CHECK (
            (status = 'done' AND completed_at IS NOT NULL)
            OR (status <> 'done' AND completed_at IS NULL)
        )
);

-- 8. Multiple reminders per task or class session with delivery tracking.
CREATE TABLE public.reminders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    user_id uuid NOT NULL
        REFERENCES public.users(id) ON DELETE CASCADE,
    task_id uuid
        REFERENCES public.tasks(id) ON DELETE CASCADE,
    class_session_id uuid
        REFERENCES public.class_sessions(id) ON DELETE CASCADE,
    remind_at timestamptz NOT NULL,
    channel text NOT NULL DEFAULT 'in_app',
    status text NOT NULL DEFAULT 'pending',
    attempt_count integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz,
    delivered_at timestamptz,
    last_error text,
    CONSTRAINT reminders_target_check
        CHECK (
            (task_id IS NOT NULL AND class_session_id IS NULL)
            OR (task_id IS NULL AND class_session_id IS NOT NULL)
        ),
    CONSTRAINT reminders_channel_check
        CHECK (channel IN ('in_app', 'email', 'push')),
    CONSTRAINT reminders_status_check
        CHECK (
            status IN (
                'pending', 'processing', 'delivered', 'failed', 'cancelled'
            )
        ),
    CONSTRAINT reminders_attempt_count_check
        CHECK (attempt_count >= 0),
    CONSTRAINT reminders_delivery_check
        CHECK (
            (status = 'delivered' AND delivered_at IS NOT NULL)
            OR (status <> 'delivered' AND delivered_at IS NULL)
        )
);

-- 9. One budget per user per month, preserving historical limits.
CREATE TABLE public.monthly_budgets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    user_id uuid NOT NULL
        REFERENCES public.users(id) ON DELETE CASCADE,
    month_start date NOT NULL,
    spending_limit numeric(12,2) NOT NULL,
    currency_code text NOT NULL,
    CONSTRAINT monthly_budgets_user_month_unique
        UNIQUE (user_id, month_start),
    CONSTRAINT monthly_budgets_month_start_check
        CHECK (EXTRACT(DAY FROM month_start) = 1),
    CONSTRAINT monthly_budgets_limit_check
        CHECK (spending_limit >= 0),
    CONSTRAINT monthly_budgets_currency_check
        CHECK (currency_code ~ '^[A-Z]{3}$')
);

-- 10. Expenses and income recorded in the linked budget's currency.
CREATE TABLE public.transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    monthly_budget_id uuid NOT NULL
        REFERENCES public.monthly_budgets(id) ON DELETE CASCADE,
    amount numeric(12,2) NOT NULL,
    transaction_type text NOT NULL,
    category text NOT NULL,
    transaction_date date NOT NULL DEFAULT CURRENT_DATE,
    description text,
    CONSTRAINT transactions_amount_check
        CHECK (amount > 0),
    CONSTRAINT transactions_type_check
        CHECK (transaction_type IN ('expense', 'income'))
);

-- 11. Saved university information, contacts, notes, links, and clubs.
CREATE TABLE public.university_info (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    user_id uuid NOT NULL
        REFERENCES public.users(id) ON DELETE CASCADE,
    course_id uuid
        REFERENCES public.courses(id) ON DELETE SET NULL,
    title text NOT NULL,
    info_type text NOT NULL,
    content text,
    location text,
    contact_name text,
    contact_email text,
    contact_phone text,
    url text,
    CONSTRAINT university_info_type_check
        CHECK (
            info_type IN (
                'office', 'rule', 'contact', 'link', 'note', 'club'
            )
        )
);

-- Indexes for foreign-key lookups and common dashboard queries.
CREATE INDEX courses_user_id_idx
    ON public.courses (user_id);

CREATE INDEX rooms_user_id_idx
    ON public.rooms (user_id);

CREATE INDEX schedules_course_id_idx
    ON public.schedules (course_id);

CREATE INDEX schedules_room_id_idx
    ON public.schedules (room_id);

CREATE INDEX class_sessions_course_start_idx
    ON public.class_sessions (course_id, starts_at);

CREATE INDEX class_sessions_room_id_idx
    ON public.class_sessions (room_id);

CREATE INDEX tasks_user_due_idx
    ON public.tasks (user_id, due_at);

CREATE INDEX tasks_user_planned_start_idx
    ON public.tasks (user_id, planned_start_at);

CREATE INDEX tasks_course_id_idx
    ON public.tasks (course_id);

CREATE INDEX tasks_parent_task_id_idx
    ON public.tasks (parent_task_id);

CREATE INDEX reminders_user_id_idx
    ON public.reminders (user_id);

CREATE INDEX reminders_task_id_idx
    ON public.reminders (task_id);

CREATE INDEX reminders_class_session_id_idx
    ON public.reminders (class_session_id);

CREATE INDEX reminders_pending_time_idx
    ON public.reminders (remind_at)
    WHERE status = 'pending';

CREATE INDEX reminders_retry_time_idx
    ON public.reminders (next_attempt_at)
    WHERE status = 'failed';

CREATE INDEX transactions_budget_date_idx
    ON public.transactions (monthly_budget_id, transaction_date);

CREATE INDEX university_info_user_id_idx
    ON public.university_info (user_id);

CREATE INDEX university_info_course_id_idx
    ON public.university_info (course_id);

-- Enable row-level security.
-- Add ownership policies before accessing these tables through the client API.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.university_info ENABLE ROW LEVEL SECURITY;

-- Cross-table ownership checks, task-cycle prevention, transaction-month
-- validation, recurrence generation, and reminder delivery require additional
-- triggers, policies, or application logic beyond this table-creation script.