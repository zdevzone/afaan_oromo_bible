import type { ScriptureLibrary } from '../../domain/ports';
import { assertBook, assertChapter, assertEdition, assertSearchResults } from '../../domain/validation';
import { resolveReference } from '../../services/reference';
import { validateParsedSearch } from '../../services/search';
import { expectArray, request } from './transport';

export function createTauriLibrary(): ScriptureLibrary {
  const library: ScriptureLibrary = {
    async listEditions() {
      return expectArray(await request('library_list_editions'), assertEdition);
    },
    async listBooks(editionId) {
      return expectArray(await request('library_list_books', { editionId }), assertBook);
    },
    async getChapter(key) {
      const result = await request('library_get_chapter', { key });
      assertChapter(result);
      return result;
    },
    async resolveReference(input, editionId) {
      return resolveReference(input, editionId, await library.listBooks(editionId), library.getChapter);
    },
    async search(searchRequest) {
      validateParsedSearch(searchRequest.query);
      const result = await request('library_search', { request: searchRequest });
      assertSearchResults(result);
      return result;
    },
  };
  return library;
}
