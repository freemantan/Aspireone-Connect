CREATE TABLE `oauth` (
	`token` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`board` text,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `records_kind_board` ON `records` (`kind`,`board`);--> statement-breakpoint
CREATE TABLE `revisions` (
	`id` integer PRIMARY KEY NOT NULL,
	`value` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`expires` integer NOT NULL
);
