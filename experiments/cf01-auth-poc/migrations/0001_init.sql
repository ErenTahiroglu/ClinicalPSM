-- CF-01 PoC schema (Better Auth core + app tables). Generated from the test entrypoint; apply with:
--   wrangler d1 execute DB --local --file migrations/0001_init.sql
CREATE TABLE "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);
CREATE TABLE entitlement (user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE, plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','plus','pro')), polar_subscription_id TEXT, last_event_at INTEGER, updated_at INTEGER NOT NULL);
CREATE TABLE items (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, title TEXT NOT NULL CHECK (length(title) <= 200), created_at INTEGER NOT NULL);
CREATE TABLE "rateLimit" ("id" text not null primary key, "key" text not null unique, "count" integer not null, "lastRequest" bigint not null);
CREATE TABLE "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);
CREATE TABLE "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null);
CREATE TABLE "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);
CREATE TABLE webhook_events (event_id TEXT PRIMARY KEY, received_at INTEGER NOT NULL);
CREATE INDEX "account_userId_idx" on "account" ("userId");
CREATE INDEX idx_items_user ON items(user_id);
CREATE INDEX "session_userId_idx" on "session" ("userId");
CREATE INDEX "verification_identifier_idx" on "verification" ("identifier");
