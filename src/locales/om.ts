import type { UiCatalog } from "./en";
import reviewedStrings from "./om.json" with { type: "json" };

// Add only wording approved by fluent Oromo reviewers. Missing entries use
// the English catalog during development; Settings declares that fallback.
export const om: Partial<UiCatalog> = reviewedStrings;
