import type { UserStore } from "../../domain/ports";
import { createBackup, parseBackup, type PersonalSnapshot } from "../../domain/backup";
import { AppError } from "../../domain/scripture";
import {
  validateBookmark,
  validateHighlight,
  validateNote,
  validatePreferences,
  validateReadingPosition,
} from "../../domain/notes";
import { expectArray, expectVoid, request } from "./transport";

export function createTauriUserStore(): UserStore {
  return {
    async readSnapshot() {
      const response = await request("user_read_snapshot");
      if (typeof response !== "object" || response === null || Array.isArray(response))
        throw new AppError("RESPONSE_INVALID", "The desktop snapshot was invalid.");
      const value = response as Record<string, unknown>;
      const snapshot: PersonalSnapshot = {
        notes: expectArray(value.notes, validateNote),
        bookmarks: expectArray(value.bookmarks, validateBookmark),
        highlights: expectArray(value.highlights, validateHighlight),
        preferences: expectArray(value.preferences, validatePreferences),
        readingPositions: expectArray(value.readingPositions, validateReadingPosition),
      };
      createBackup(snapshot, "1ba9139d-41dd-4f2a-bd11-09738a9e4970", "0.1.0");
      return snapshot;
    },
    async getDatabaseId() {
      const id = await request("user_get_database_id");
      if (
        typeof id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)
      )
        throw new AppError("RESPONSE_INVALID", "The desktop database identity was invalid.");
      return id;
    },
    async readRecoveryBackup() {
      const text = await request("user_read_recovery_backup");
      if (text === null) return null;
      if (typeof text !== "string")
        throw new AppError("RESPONSE_INVALID", "The recovery response was invalid.");
      return parseBackup(text).backup;
    },
    async replaceSnapshot(snapshot) {
      const databaseId = await this.getDatabaseId();
      const createdAt = new Date().toISOString();
      createBackup(snapshot, databaseId, "0.1.0", createdAt);
      const location = await request("user_replace_snapshot", { snapshot, createdAt });
      if (typeof location !== "string" || location.length === 0)
        throw new AppError("RESPONSE_INVALID", "The recovery location was invalid.");
      return location;
    },
    async listBookmarks() {
      return expectArray(await request("user_list_bookmarks"), validateBookmark);
    },
    async saveBookmark(bookmark) {
      validateBookmark(bookmark);
      const saved = await request("user_save_bookmark", { bookmark });
      validateBookmark(saved);
      return saved;
    },
    async deleteBookmark(id) {
      expectVoid(await request("user_delete_bookmark", { id }));
    },
    async listHighlights() {
      return expectArray(await request("user_list_highlights"), validateHighlight);
    },
    async saveHighlights(highlights) {
      highlights.forEach(validateHighlight);
      return expectArray(await request("user_save_highlights", { highlights }), validateHighlight);
    },
    async deleteHighlights(ids) {
      expectVoid(await request("user_delete_highlights", { ids }));
    },
    async listNotes() {
      return expectArray(await request("user_list_notes"), validateNote);
    },
    async saveNote(note) {
      validateNote(note);
      const saved = await request("user_save_note", { note });
      validateNote(saved);
      return saved;
    },
    async deleteNote(id) {
      expectVoid(await request("user_delete_note", { id }));
    },
    async getReadingPosition() {
      const result = await request("user_get_reading_position");
      if (result === null) return null;
      validateReadingPosition(result);
      return result;
    },
    async saveReadingPosition(position) {
      validateReadingPosition(position);
      expectVoid(await request("user_save_reading_position", { position }));
    },
    async getPreferences() {
      const result = await request("user_get_preferences");
      validatePreferences(result);
      return result;
    },
    async savePreferences(preferences) {
      validatePreferences(preferences);
      expectVoid(await request("user_save_preferences", { preferences }));
    },
  };
}
