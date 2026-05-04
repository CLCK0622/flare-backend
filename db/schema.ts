import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  doublePrecision,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  googleId: varchar("google_id", { length: 255 }).unique(),
  username: varchar("username", { length: 50 }).unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  email: varchar("email", { length: 255 }),
  role: varchar("role", { length: 20 }).default("user").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  bio: varchar("bio", { length: 200 }).default(""),
  locationLabel: varchar("location_label", { length: 200 }).default(""),
  activityInterests: text("activity_interests")
    .array()
    .default([])
    .notNull(),
  photoUrl: varchar("photo_url", { length: 500 }).default(""),
  memberSince: timestamp("member_since").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const flares = pgTable(
  "flares",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    activity: varchar("activity", { length: 200 }).notNull(),
    category: varchar("category", { length: 50 }).default(""),
    description: text("description").default(""),
    timeframe: varchar("timeframe", { length: 20 }).notNull(),
    timeLabel: varchar("time_label", { length: 100 }).default(""),
    locationName: varchar("location_name", { length: 200 }).default(""),
    locationAddress: varchar("location_address", { length: 300 }).default(""),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    maxSlots: integer("max_slots").default(1).notNull(),
    requiresApproval: boolean("requires_approval").default(false).notNull(),
    status: varchar("status", { length: 20 }).default("active").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_flares_status").on(table.status),
    index("idx_flares_expires").on(table.expiresAt),
    index("idx_flares_user").on(table.userId),
    index("idx_flares_status_expires_cat").on(table.status, table.expiresAt, table.category),
  ]
);

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    flareId: uuid("flare_id")
      .references(() => flares.id)
      .notNull(),
    responderId: uuid("responder_id")
      .references(() => users.id)
      .notNull(),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    chatExpiresAt: timestamp("chat_expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_matches_flare").on(table.flareId),
    index("idx_matches_responder").on(table.responderId),
    index("idx_matches_flare_status").on(table.flareId, table.status),
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id")
      .references(() => matches.id)
      .notNull(),
    senderId: uuid("sender_id")
      .references(() => users.id)
      .notNull(),
    text: text("text").notNull(),
    imageUrl: varchar("image_url", { length: 500 }).default(""),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_messages_match_sent").on(table.matchId, table.sentAt),
    index("idx_messages_sender").on(table.senderId),
  ]
);

export const ratings = pgTable(
  "ratings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    flareId: uuid("flare_id")
      .references(() => flares.id)
      .notNull(),
    raterId: uuid("rater_id")
      .references(() => users.id)
      .notNull(),
    rateeId: uuid("ratee_id")
      .references(() => users.id)
      .notNull(),
    stars: integer("stars").notNull(), // 0-5
    comment: text("comment").default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_ratings_ratee").on(table.rateeId),
    index("idx_ratings_flare").on(table.flareId),
    index("idx_ratings_rater_flare").on(table.raterId, table.flareId),
  ]
);

export const achievements = pgTable(
  "achievements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    key: varchar("key", { length: 50 }).notNull(),
    unlockedAt: timestamp("unlocked_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_achievements_user_key").on(table.userId, table.key),
  ]
);

export const follows = pgTable(
  "follows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    followerId: uuid("follower_id")
      .references(() => users.id)
      .notNull(),
    followeeId: uuid("followee_id")
      .references(() => users.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_follows_pair").on(table.followerId, table.followeeId),
    index("idx_follows_followee").on(table.followeeId),
  ]
);

export const blocks = pgTable(
  "blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    blockerId: uuid("blocker_id")
      .references(() => users.id)
      .notNull(),
    blockedId: uuid("blocked_id")
      .references(() => users.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_blocks_pair").on(table.blockerId, table.blockedId),
    index("idx_blocks_blocker").on(table.blockerId),
  ]
);

export const templates = pgTable(
  "templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    label: varchar("label", { length: 200 }).notNull(),
    category: varchar("category", { length: 50 }).default(""),
    description: text("description").default(""),
    timeframe: varchar("timeframe", { length: 20 }).default("NOW"),
    locationName: varchar("location_name", { length: 200 }).default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("idx_templates_user").on(table.userId)]
);

export const flareFeedback = pgTable(
  "flare_feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    flareId: uuid("flare_id")
      .references(() => flares.id)
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    photoUrl: varchar("photo_url", { length: 500 }).default(""),
    note: text("note").default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_feedback_flare").on(table.flareId),
    uniqueIndex("idx_feedback_flare_user").on(table.flareId, table.userId),
  ]
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reporterId: uuid("reporter_id")
      .references(() => users.id)
      .notNull(),
    targetType: varchar("target_type", { length: 20 }).notNull(),
    targetId: uuid("target_id").notNull(),
    reason: varchar("reason", { length: 50 }).notNull(),
    details: text("details").default(""),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_reports_status").on(table.status),
    index("idx_reports_target").on(table.targetType, table.targetId),
  ]
);

export const recurringFlares = pgTable(
  "recurring_flares",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    activity: varchar("activity", { length: 200 }).notNull(),
    category: varchar("category", { length: 50 }).default(""),
    description: text("description").default(""),
    timeframe: varchar("timeframe", { length: 20 }).notNull(),
    dayOfWeek: integer("day_of_week").notNull(),
    locationName: varchar("location_name", { length: 200 }).default(""),
    locationAddress: varchar("location_address", { length: 300 }).default(""),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    active: boolean("active").default(true).notNull(),
    lastFiredAt: timestamp("last_fired_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("idx_recurring_user").on(table.userId)]
);

export const readReceipts = pgTable(
  "read_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id")
      .references(() => matches.id)
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    lastReadAt: timestamp("last_read_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_read_receipts_match_user").on(table.matchId, table.userId),
  ]
);

export const settings = pgTable("settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull()
    .unique(),
  notifyMatches: boolean("notify_matches").default(true).notNull(),
  notifyMessages: boolean("notify_messages").default(true).notNull(),
  notifyFlareEdits: boolean("notify_flare_edits").default(true).notNull(),
  profileVisibility: varchar("profile_visibility", { length: 20 }).default("public").notNull(),
  theme: varchar("theme", { length: 20 }).default("system").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
