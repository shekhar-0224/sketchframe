CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'supporting' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`personality` text DEFAULT '' NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`sheet_status` text DEFAULT 'empty' NOT NULL,
	`sheet_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `characters_project_idx` ON `characters` (`project_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`logline` text DEFAULT '' NOT NULL,
	`script_text` text DEFAULT '' NOT NULL,
	`source_kind` text DEFAULT 'script' NOT NULL,
	`art_style` text DEFAULT 'sketch' NOT NULL,
	`aspect_ratio` text DEFAULT '16:9' NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`status_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reference_images` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`character_id` text,
	`kind` text NOT NULL,
	`path` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `refs_character_idx` ON `reference_images` (`character_id`);--> statement-breakpoint
CREATE TABLE `scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`position` integer NOT NULL,
	`heading` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`time_of_day` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scenes_project_idx` ON `scenes` (`project_id`);--> statement-breakpoint
CREATE TABLE `shots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`scene_id` text,
	`position` integer NOT NULL,
	`shot_size` text DEFAULT 'Medium' NOT NULL,
	`camera_angle` text DEFAULT 'Eye level' NOT NULL,
	`camera_move` text DEFAULT 'Static' NOT NULL,
	`action` text DEFAULT '' NOT NULL,
	`dialogue` text DEFAULT '' NOT NULL,
	`speaker` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`duration` real DEFAULT 3 NOT NULL,
	`character_ids` text DEFAULT '[]' NOT NULL,
	`prompt_extra` text DEFAULT '' NOT NULL,
	`image_path` text,
	`layout_path` text,
	`image_status` text DEFAULT 'empty' NOT NULL,
	`image_error` text,
	`image_version` integer DEFAULT 0 NOT NULL,
	`last_reference_ids` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scene_id`) REFERENCES `scenes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `shots_project_idx` ON `shots` (`project_id`,`position`);