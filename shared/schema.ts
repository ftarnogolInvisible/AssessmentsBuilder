import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// =============================================================================
// USER MANAGEMENT
// =============================================================================

// Users schema for admin authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("editor"), // owner, editor, reviewer
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  twoFactorSecret: text("two_factor_secret"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Clients schema - for multi-tenant management
export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Client users - many-to-many relationship
export const clientUsers = pgTable("client_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("editor"), // owner, editor, reviewer
  createdAt: timestamp("created_at").defaultNow(),
});

// =============================================================================
// ASSESSMENT BUILDER SCHEMA
// =============================================================================

// Campaigns - top-level folders for organizing assessments
export const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  archived: boolean("archived").notNull().default(false),
  tags: json("tags").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Projects - assessments grouped under campaigns
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  archived: boolean("archived").notNull().default(false),
  tags: json("tags").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Assessments - individual assessment instances with versioning
export const assessments = pgTable("assessments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("draft"), // draft, published, archived
  publicUrl: text("public_url").unique(), // Unique URL for public access
  version: integer("version").notNull().default(1),
  publishedAt: timestamp("published_at"),
  archived: boolean("archived").notNull().default(false),
  tags: json("tags").$type<string[]>().notNull().default([]),
  settings: json("settings").$type<{
    allowMultipleSubmissions?: boolean;
    requireEmail?: boolean;
    requireName?: boolean;
    showProgress?: boolean;
    autosaveInterval?: number; // milliseconds
  }>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Blocks - individual question/element blocks within assessments
export const blocks = pgTable("blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assessmentId: varchar("assessment_id").notNull().references(() => assessments.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // multiple_choice, multi_select, audio_response, video_response, media_stimulus, free_text, coding_block, latex_block
  order: integer("order").notNull(), // Order within assessment
  groupId: varchar("group_id"), // Groups blocks together to show side-by-side in preview
  title: text("title"),
  instructions: text("instructions"),
  required: boolean("required").notNull().default(false),
  timeLimitSeconds: integer("time_limit_seconds"), // Optional time limit
  config: json("config").$type<{
    // For multiple choice / multi-select
    options?: Array<{ id: string; label: string; value: string; correct?: boolean }>;
    // For free text
    maxLength?: number;
    minLength?: number;
    placeholder?: string; // Suggested response text (used for LLM review/grading)
    // For media stimulus - supports multiple media items (up to 4)
    mediaItems?: Array<{
      id: string;
      title?: string; // Optional title displayed above the media item
      mediaType: "video" | "image" | "audio";
      mediaUrl?: string;
      mediaS3Key?: string;
    }>;
    // Legacy single media support (deprecated, use mediaItems instead)
    mediaType?: "video" | "image" | "audio";
    mediaUrl?: string;
    mediaS3Key?: string;
    // For audio/video response
    maxDurationSeconds?: number;
    minDurationSeconds?: number;
    // For audio response with PDF script
    scriptPdfUrl?: string;
    scriptPdfS3Key?: string;
    // Scoring
    points?: number;
    rubric?: Array<{ level: string; description: string; points: number }>;
    // Anti-cheating
    preventCopyPaste?: boolean; // Prevent copy/paste for this block
    // For coding block
    language?: string; // Programming language mode (e.g., "javascript", "python", "java")
    theme?: string; // ACE editor theme (e.g., "monokai", "twilight", "github")
    example?: string; // Example code to show test takers
    fontSize?: number; // Font size for the editor
    showLineNumbers?: boolean; // Show line numbers
    readOnly?: boolean; // Make editor read-only
    wrap?: boolean; // Enable word wrap
    // For LaTeX block
    latexExample?: string; // Example LaTeX to show test takers
    displayMode?: boolean; // Display LaTeX in display mode (centered, larger) vs inline mode
  }>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Assessment submissions - user submissions for assessments
export const assessmentSubmissions = pgTable("assessment_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assessmentId: varchar("assessment_id").notNull().references(() => assessments.id, { onDelete: "cascade" }),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  email: text("email"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  name: text("name"), // Legacy field, kept for backward compatibility
  status: text("status").notNull().default("in_progress"), // in_progress, to_review, reviewed, abandoned
  progress: integer("progress").notNull().default(0), // Percentage 0-100
  submittedAt: timestamp("submitted_at"),
  reviewerNotes: text("reviewer_notes"), // Internal notes from admin reviewers
  totalScore: integer("total_score"), // Calculated total score
  maxScore: integer("max_score"), // Maximum possible score
  integrityViolations: json("integrity_violations").$type<{
    copyAttempts?: number; // Count of copy attempts
    pasteAttempts?: Array<{
      blockId: string;
      timestamp: string;
      attemptedContent: string; // What they tried to paste
    }>;
    proctoring?: {
      lookAway?: Array<{ timestamp: string; screenshot?: string }>; // Look away violations with optional screenshot
      multipleFaces?: Array<{ timestamp: string; screenshot?: string }>; // Multiple faces detected with optional screenshot
    };
  }>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Block responses - individual responses to blocks within a submission
export const blockResponses = pgTable("block_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  submissionId: varchar("submission_id").notNull().references(() => assessmentSubmissions.id, { onDelete: "cascade" }),
  blockId: varchar("block_id").notNull().references(() => blocks.id, { onDelete: "cascade" }),
  // Response data varies by block type
  responseData: json("response_data").$type<{
    // For multiple choice
    selectedOptionId?: string;
    // For multi-select
    selectedOptionIds?: string[];
    // For audio/video response
    mediaUrl?: string;
    mediaS3Key?: string;
    mediaType?: "audio" | "video";
    duration?: number; // seconds
    // For file uploads
    fileUrl?: string;
    fileS3Key?: string;
    fileName?: string;
    fileType?: string;
    // Text responses
    text?: string;
    // For coding block
    code?: string; // Code written by the user
    // For LaTeX block
    latex?: string; // LaTeX code written by the user
  }>().notNull(),
  score: integer("score"), // Points awarded for this response
  maxScore: integer("max_score"), // Maximum points possible for this block
  reviewerFeedback: text("reviewer_feedback"), // Feedback from admin reviewer
  autoGraded: boolean("auto_graded").notNull().default(false), // Whether score was auto-calculated
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// =============================================================================
// API & INTEGRATION SCHEMA
// =============================================================================

// API keys for n8n and external integrations
export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // Human-readable name for the key
  keyHash: text("key_hash").notNull().unique(), // Hashed API key
  permissions: json("permissions").$type<string[]>().notNull().default([]), // e.g., ["read:assessments", "write:scores"]
  webhookUrl: text("webhook_url"), // Webhook URL for this key
  active: boolean("active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Webhook events - log of webhook triggers
export const webhookEvents = pgTable("webhook_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  apiKeyId: varchar("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(), // submission.completed, block.completed, etc.
  payload: json("payload").notNull(),
  status: text("status").notNull().default("pending"), // pending, sent, failed
  responseCode: integer("response_code"),
  responseBody: text("response_body"),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  sentAt: timestamp("sent_at"),
});

// =============================================================================
// PLATFORM SETTINGS
// =============================================================================

// Platform settings - branding, domain, email templates
export const platformSettings = pgTable("platform_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().unique().references(() => clients.id, { onDelete: "cascade" }),
  branding: json("branding").$type<{
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
  }>().notNull().default({}),
  domain: text("domain"),
  emailTemplates: json("email_templates").$type<{
    assessmentInvite?: string;
    submissionConfirmation?: string;
  }>().notNull().default({}),
  storageProvider: text("storage_provider").notNull().default("s3"), // s3, gcs, etc.
  storageConfig: json("storage_config").$type<Record<string, any>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// =============================================================================
// INSERT SCHEMAS
// =============================================================================

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAssessmentSchema = createInsertSchema(assessments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
});

export const insertBlockSchema = createInsertSchema(blocks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAssessmentSubmissionSchema = createInsertSchema(assessmentSubmissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBlockResponseSchema = createInsertSchema(blockResponses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastUsedAt: true,
});

// =============================================================================
// EXPORT TYPES
// =============================================================================

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Assessment = typeof assessments.$inferSelect;
export type InsertAssessment = z.infer<typeof insertAssessmentSchema>;
export type Block = typeof blocks.$inferSelect;
export type InsertBlock = z.infer<typeof insertBlockSchema>;
export type AssessmentSubmission = typeof assessmentSubmissions.$inferSelect;
export type InsertAssessmentSubmission = z.infer<typeof insertAssessmentSubmissionSchema>;
export type BlockResponse = typeof blockResponses.$inferSelect;
export type InsertBlockResponse = z.infer<typeof insertBlockResponseSchema>;
export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type InsertWebhookEvent = typeof webhookEvents.$inferInsert;

