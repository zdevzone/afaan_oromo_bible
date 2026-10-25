import { useState } from "react";
import { version as appVersion } from "../../../package.json";
import uiNotice from "../../assets/licenses/shadcn-ui-MIT.txt?raw";
import type { BookSummary, Edition } from "../../domain/scripture";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../components/ui/dialog";
import type { UiCatalog } from "../../locales/en";

export function AboutDialog({
  open,
  onOpenChange,
  edition,
  books,
  strings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edition: Edition | null;
  books: BookSummary[];
  strings: UiCatalog;
}) {
  const [showNotice, setShowNotice] = useState(false);

  const includedBooks = [...books].sort((a, b) => a.order - b.order);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={strings.closeDialog} className="about-dialog">
        <DialogTitle>{strings.aboutTitle}</DialogTitle>
        <DialogDescription>{strings.aboutDescription}</DialogDescription>
        <div className="about-sections">
          <section aria-labelledby="about-app">
            <h3 id="about-app">{strings.application}</h3>
            <p>{strings.versionLabel.replace("{version}", appVersion)}</p>
            <p>{strings.localRecordsDescription}</p>
          </section>
          <section aria-labelledby="about-content">
            <h3 id="about-content">{strings.installedContent}</h3>
            {edition ? (
              <>
                <p>
                  <strong lang={edition.languageTag}>{edition.title}</strong> (
                  {edition.abbreviation})
                </p>
                {edition.isSynthetic && <p role="status">{strings.syntheticContentWarning}</p>}
                <dl className="about-metadata">
                  <div>
                    <dt>{strings.languageTag}</dt>
                    <dd>{edition.languageTag}</dd>
                  </div>
                  {edition.languageName && (
                    <div>
                      <dt>{strings.languageVariety}</dt>
                      <dd>{edition.languageName}</dd>
                    </div>
                  )}
                  <div>
                    <dt>{strings.editionId}</dt>
                    <dd>{edition.id}</dd>
                  </div>
                  <div>
                    <dt>{strings.contentRevision}</dt>
                    <dd>{edition.contentRevision}</dd>
                  </div>
                  <div>
                    <dt>{strings.versification}</dt>
                    <dd>{edition.versificationId}</dd>
                  </div>
                  <div>
                    <dt>{strings.canonId}</dt>
                    <dd>{edition.canonId}</dd>
                  </div>
                  {edition.sourceTitle && (
                    <div>
                      <dt>{strings.sourceTitle}</dt>
                      <dd>{edition.sourceTitle}</dd>
                    </div>
                  )}
                  {edition.rightsHolderName && (
                    <div>
                      <dt>{strings.sourceRightsHolder}</dt>
                      <dd>{edition.rightsHolderName}</dd>
                    </div>
                  )}
                  {edition.sourceCompletedOn && (
                    <div>
                      <dt>{strings.sourceCompleted}</dt>
                      <dd>{edition.sourceCompletedOn}</dd>
                    </div>
                  )}
                  {edition.sourceArchiveSha256 && (
                    <div>
                      <dt>{strings.sourceArchiveHash}</dt>
                      <dd>{edition.sourceArchiveSha256}</dd>
                    </div>
                  )}
                </dl>
                <h4>{strings.includedBooks.replace("{count}", String(includedBooks.length))}</h4>
                <ol className="about-books">
                  {includedBooks.map((book) => (
                    <li key={book.code}>
                      <span lang={edition.languageTag}>{book.name}</span> ({book.code})
                    </li>
                  ))}
                </ol>
                <h4>{strings.attributionNotice}</h4>
                <p>{edition.attribution}</p>
                <p>{edition.licenseNotice}</p>
              </>
            ) : (
              <p>{strings.noApprovedContent}</p>
            )}
          </section>
          <section aria-labelledby="about-data">
            <h3 id="about-data">{strings.yourDataTitle}</h3>
            <p>{strings.aboutBackup}</p>
          </section>
          <section aria-labelledby="about-notices">
            <h3 id="about-notices">{strings.thirdPartyNotices}</h3>
            <Button
              variant="outline"
              onClick={() => setShowNotice((value) => !value)}
              aria-expanded={showNotice}
            >
              {showNotice ? strings.hideUiNotice : strings.readUiNotice}
            </Button>
            {showNotice && <pre className="about-notice-text">{uiNotice}</pre>}
            <p>{strings.noticeInventoryPending}</p>
          </section>
        </div>
        <DialogClose asChild>
          <Button variant="outline">{strings.done}</Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
