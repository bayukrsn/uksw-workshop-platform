-- V17: Fix Workshop Descriptions & Mark Enrolled Seats as Occupied
-- 1. Richer multi-sentence descriptions for all seed workshops
-- 2. Assign an available seat to each active enrollment via workshop_enrollment_seats
--    and mark the seat as OCCUPIED

-- ═══════════════════════════════════════════════════════════════════════
-- PART 1 — Rich Workshop Descriptions
-- ═══════════════════════════════════════════════════════════════════════

UPDATE workshops
SET description = 'Dive deep into Go, one of the fastest-growing languages for cloud-native development. ' ||
                  'Students will build a fully functional microservices application using best practices like ' ||
                  'clean architecture, REST APIs, and Docker containerization. By the end of the workshop, ' ||
                  'participants will be confident deploying scalable backend systems in production.'
WHERE code = 'WS_TECH_01';

UPDATE workshops
SET description = 'Master the modern frontend stack from the ground up, starting with React 18 concepts like ' ||
                  'hooks, context, and concurrent rendering. Students will build and deploy a real-world ' ||
                  'single-page application using Vite and Tailwind CSS, and learn best practices for state ' ||
                  'management, component reusability, and performance optimization.'
WHERE code = 'WS_TECH_02';

UPDATE workshops
SET description = 'Understand how digital channels—social media, SEO, email, and paid ads—work together to ' ||
                  'grow a brand or product in today''s competitive market. This hands-on workshop walks ' ||
                  'students through building a full digital marketing campaign, from audience research and ' ||
                  'content strategy to analytics and conversion optimization.'
WHERE code = 'WS_BIZ_01';

UPDATE workshops
SET description = 'Learn the end-to-end product design process used at top tech companies, covering user ' ||
                  'research, wireframing, prototyping, and usability testing. Students will work in Figma to ' ||
                  'design a polished mobile app interface, gaining skills in visual hierarchy, accessibility, ' ||
                  'and design systems that developers can actually build from.'
WHERE code = 'WS_CREATE_01';

UPDATE workshops
SET description = 'Develop the soft skills that separate good engineers from great ones: clear communication, ' ||
                  'decision-making under uncertainty, running effective meetings, and mentoring junior team ' ||
                  'members. Through group exercises, case studies, and reflective journaling, students will ' ||
                  'leave with a personal leadership playbook ready to apply immediately.'
WHERE code = 'WS_LEAD_01';

-- ═══════════════════════════════════════════════════════════════════════
-- PART 2 — Assign seats to active enrollments
-- For each ACTIVE enrollment that doesn't already have a seat in
-- workshop_enrollment_seats, we pick the first AVAILABLE seat from
-- that workshop session and mark it OCCUPIED.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    rec     RECORD;
    v_seat_id UUID;
BEGIN
    FOR rec IN
        SELECT e.id AS enrollment_id, e.class_id AS session_id
        FROM enrollments e
        WHERE e.status = 'ACTIVE'
          AND NOT EXISTS (
              SELECT 1
              FROM workshop_enrollment_seats wes
              WHERE wes.enrollment_id = e.id
          )
    LOOP
        -- Pick the first available seat in this session
        SELECT id INTO v_seat_id
        FROM seats
        WHERE workshop_session_id = rec.session_id
          AND status = 'AVAILABLE'
        ORDER BY row_letter, column_number
        LIMIT 1;

        IF v_seat_id IS NOT NULL THEN
            -- Mark seat occupied
            UPDATE seats
            SET status = 'OCCUPIED', updated_at = NOW()
            WHERE id = v_seat_id;

            -- Link enrollment to seat
            INSERT INTO workshop_enrollment_seats (id, enrollment_id, seat_id, assigned_at)
            VALUES (gen_random_uuid(), rec.enrollment_id, v_seat_id, NOW())
            ON CONFLICT DO NOTHING;
        END IF;
    END LOOP;
END $$;
