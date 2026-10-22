import type { UserStore } from "../../domain/ports";
import { validateNote, validatePreferences, validateReadingPosition } from "../../domain/notes";
import { expectArray, expectVoid, request } from "./transport";

export function createTauriUserStore(): UserStore {
  return {
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
