import type { FormEvent } from "react";
import { ArrowRight, LoaderCircle, Search } from "lucide-react";
import type { BookSummary, SearchResult, SearchResults } from "../../domain/scripture";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { SelectField } from "../../components/ui/select";

export function SearchPanel({
  editionLabel,
  books,
  query,
  setQuery,
  book,
  setBook,
  searching,
  error,
  results,
  onSubmit,
  onOpen,
}: {
  editionLabel: string;
  books: BookSummary[];
  query: string;
  setQuery: (value: string) => void;
  book: string;
  setBook: (value: string) => void;
  searching: boolean;
  error: string;
  results: SearchResults | null;
  onSubmit: (event: FormEvent) => void;
  onOpen: (result: SearchResult) => void;
}) {
  return (
    <div className="panel-body">
      <p className="muted panel-intro">Find words and phrases in {editionLabel}.</p>
      <form onSubmit={onSubmit} className="search-form">
        <label htmlFor="scripture-query">Words or quoted phrase</label>
        <div className="search-input">
          <Search size={17} aria-hidden="true" />
          <Input
            id="scripture-query"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='Try sample or "careful reading"'
            aria-invalid={!!error}
            aria-describedby="search-help"
          />
        </div>
        <p id="search-help" className="field-help">
          All words must match. Use quotes for a phrase or a trailing * for a prefix.
        </p>
        <SelectField
          id="search-book"
          label="Search in"
          value={book}
          onValueChange={setBook}
          options={[
            { value: "all", label: "All books" },
            ...books.map((item) => ({ value: item.code, label: item.name })),
          ]}
        />
        <Button type="submit" disabled={searching}>
          {searching ? (
            <LoaderCircle className="spin" size={16} aria-hidden="true" />
          ) : (
            <Search size={16} aria-hidden="true" />
          )}
          Search Scripture
        </Button>
      </form>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {results && (
        <div className="search-results">
          <p className="sidebar-section-label">
            {results.total} {results.total === 1 ? "RESULT" : "RESULTS"}
            {results.hasMore ? " · FIRST 50" : ""}
          </p>
          {results.items.length === 0 ? (
            <p className="muted">No passages match this search. Try a different word or book.</p>
          ) : (
            <ol>
              {results.items.map((result) => (
                <li key={result.unitKey}>
                  <button type="button" className="search-result" onClick={() => onOpen(result)}>
                    <strong>
                      {result.bookName} {result.chapterLabel}:{result.verseLabel}
                      <ArrowRight size={14} aria-hidden="true" />
                    </strong>
                    <span>{result.textPlain}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          {results.hasMore && (
            <p className="field-help">
              This first development slice displays the first 50 results. Narrow your words or
              choose a book.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
