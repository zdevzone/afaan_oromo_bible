import type { FormEvent } from "react";
import { ArrowRight, LoaderCircle, Search } from "lucide-react";
import type { BookSummary, SearchResult, SearchResults } from "../../domain/scripture";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { SelectField } from "../../components/ui/select";
import type { UiCatalog } from "../../locales/en";

export function SearchPanel({
  editionLabel,
  languageTag,
  books,
  query,
  setQuery,
  book,
  setBook,
  searching,
  error,
  results,
  onSubmit,
  onLoadMore,
  onOpen,
  strings,
}: {
  editionLabel: string;
  languageTag: string;
  books: BookSummary[];
  query: string;
  setQuery: (value: string) => void;
  book: string;
  setBook: (value: string) => void;
  searching: boolean;
  error: string;
  results: SearchResults | null;
  onSubmit: (event: FormEvent) => void;
  onLoadMore: () => void;
  onOpen: (result: SearchResult) => void;
  strings: UiCatalog;
}) {
  return (
    <div className="panel-body">
      <p className="muted panel-intro">{strings.searchIntro.replace("{edition}", editionLabel)}</p>
      <form onSubmit={onSubmit} className="search-form">
        <label htmlFor="scripture-query">{strings.searchQueryLabel}</label>
        <div className="search-input">
          <Search size={17} aria-hidden="true" />
          <Input
            id="scripture-query"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={strings.searchPlaceholder}
            aria-invalid={!!error}
            aria-describedby={error ? "search-help search-error" : "search-help"}
          />
        </div>
        <p id="search-help" className="field-help">
          {strings.searchHelp}
        </p>
        <SelectField
          id="search-book"
          label={strings.searchIn}
          value={book}
          onValueChange={setBook}
          options={[
            { value: "all", label: strings.allBooks },
            ...books.map((item) => ({ value: item.code, label: item.name })),
          ]}
        />
        <Button type="submit" disabled={searching}>
          {searching ? (
            <LoaderCircle className="spin" size={16} aria-hidden="true" />
          ) : (
            <Search size={16} aria-hidden="true" />
          )}
          {strings.searchScripture}
        </Button>
      </form>
      {error && (
        <p id="search-error" role="alert" className="error-box">
          {error}
        </p>
      )}
      {results && (
        <div className="search-results">
          <p className="sidebar-section-label">
            {(results.total === 1 ? strings.resultSummarySingular : strings.resultSummaryPlural)
              .replace("{total}", String(results.total))
              .replace("{shown}", String(results.items.length))}
          </p>
          {results.items.length === 0 ? (
            <p className="muted">{strings.noSearchResults}</p>
          ) : (
            <ol>
              {results.items.map((result) => (
                <li key={result.unitKey}>
                  <button type="button" className="search-result" onClick={() => onOpen(result)}>
                    <strong>
                      {result.bookName} {result.chapterLabel}:{result.verseLabel}
                      <ArrowRight size={14} aria-hidden="true" />
                    </strong>
                    <span lang={languageTag}>{result.textPlain}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          {results.hasMore && (
            <Button type="button" variant="outline" disabled={searching} onClick={onLoadMore}>
              {searching ? strings.loadingMore : strings.loadMoreResults}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
