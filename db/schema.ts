import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const records = sqliteTable('records', { id: text('id').primaryKey(), kind: text('kind').notNull(), board: text('board'), payload: text('payload').notNull() }, t=>[index('records_kind_board').on(t.kind,t.board)]);
export const revisions = sqliteTable('revisions', { id: integer('id').primaryKey(), value: integer('value').notNull() });
export const sessions = sqliteTable('sessions', { token: text('token').primaryKey(), user: text('user').notNull(), expires: integer('expires').notNull() });
export const oauth = sqliteTable('oauth', { token: text('token').primaryKey(), payload: text('payload').notNull(), expires: integer('expires').notNull() });
