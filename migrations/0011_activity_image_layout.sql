-- Store activity cover image layout so cards, detail pages, and LINE share use the same ratio.

ALTER TABLE activities ADD COLUMN image_layout TEXT NOT NULL DEFAULT 'landscape';
