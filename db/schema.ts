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
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  googleId: varchar("google_id", { length: 255 }).unique(),
  name: varchar("name", { length: 100 }).notNull(),
  bio: varchar("bio", { length: 200 }).default(""),
  locationLabel: varchar("location_label", { length: 200 }).default(""),
  activityInterests: text("activity_interests")
    .array()
    .default([])
    .notNull(),
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
    sentAt: timestamp("sent_at").defaultNow().notNull(),
  },
  (table) => [index("idx_messages_match_sent").on(table.matchId, table.sentAt)]
);
