CREATE TABLE `generation_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`day_local` text NOT NULL,
	`title` text NOT NULL,
	`model_id` text NOT NULL,
	`model_label` text NOT NULL,
	`surface` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`billable_units` integer DEFAULT 0 NOT NULL,
	`unit_label` text DEFAULT 'tokens' NOT NULL,
	`usd_micros` integer DEFAULT 0 NOT NULL,
	`brl_micros` integer DEFAULT 0 NOT NULL,
	`brl_per_usd_micros` integer DEFAULT 0 NOT NULL,
	`pricing_date` text,
	`result_url` text,
	`settings_json` text NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_sessions_request_id_unique` ON `generation_sessions` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_generation_sessions_user_day` ON `generation_sessions` (`user_id`,`day_local`);