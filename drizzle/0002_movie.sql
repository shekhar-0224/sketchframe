ALTER TABLE `characters` ADD `voice` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `characters` ADD `voice_style` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `shots` ADD `audio_path` text;--> statement-breakpoint
ALTER TABLE `shots` ADD `audio_seconds` real;--> statement-breakpoint
ALTER TABLE `shots` ADD `audio_key` text;--> statement-breakpoint
ALTER TABLE `shots` ADD `audio_status` text DEFAULT 'empty' NOT NULL;--> statement-breakpoint
ALTER TABLE `shots` ADD `audio_error` text;--> statement-breakpoint
ALTER TABLE `shots` ADD `clip_path` text;--> statement-breakpoint
ALTER TABLE `shots` ADD `clip_seconds` real;--> statement-breakpoint
ALTER TABLE `shots` ADD `clip_status` text DEFAULT 'empty' NOT NULL;--> statement-breakpoint
ALTER TABLE `shots` ADD `clip_error` text;