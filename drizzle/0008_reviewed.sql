ALTER TABLE `projects` ADD `reviewed_at` integer;--> statement-breakpoint
-- Stories that already have drawings were effectively reviewed; do not lock them out of their board.
UPDATE `projects` SET `reviewed_at` = `updated_at` WHERE `id` IN (SELECT DISTINCT `project_id` FROM `shots` WHERE `image_path` IS NOT NULL);
