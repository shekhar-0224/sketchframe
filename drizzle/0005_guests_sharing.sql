ALTER TABLE `projects` ADD `share_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `projects_share_token_unique` ON `projects` (`share_token`);--> statement-breakpoint
ALTER TABLE `users` ADD `guest` integer DEFAULT false NOT NULL;