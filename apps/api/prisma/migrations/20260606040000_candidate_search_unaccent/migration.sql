-- Diacritic-insensitive candidate search ("ky su" matches "kỹ sư").
-- The unaccent() function lets us strip Vietnamese diacritics at query time.
CREATE EXTENSION IF NOT EXISTS unaccent;
