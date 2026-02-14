-- V12: Disable Auto Seat Regeneration Trigger
-- The trigger calls the old 1-argument function which no longer exists.
-- Seat generation is now handled explicitly by the application with specific row/col layouts.

DROP TRIGGER IF EXISTS trigger_auto_regenerate_seats ON workshop_sessions;
DROP FUNCTION IF EXISTS auto_regenerate_seats();
