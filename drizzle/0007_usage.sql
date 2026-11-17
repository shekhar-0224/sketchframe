CREATE TABLE `usage_counters` (
	`scope` text NOT NULL,
	`period` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`scope`, `period`)
);
