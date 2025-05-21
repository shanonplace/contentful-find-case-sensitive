import { createClient } from "contentful";
import dotenv from "dotenv";
import { documentToPlainTextString } from "@contentful/rich-text-plain-text-renderer";

// Load environment variables from .env file
dotenv.config();

const term = process.argv[2];
const locale = process.argv[3] || "en-US"; // Default to en-US if not provided
if (!term) throw new Error('Usage: node index.js "string to search" [locale]');

// Contentful API client setup
const { SPACE_ID, CPA_TOKEN, ENVIRONMENT_ID } = process.env;

if (!SPACE_ID || !CPA_TOKEN)
  throw new Error("Set SPACE_ID and CPA_TOKEN and ENVIRONMENT_ID env vars.");

const client = createClient({
  space: SPACE_ID,
  environment: ENVIRONMENT_ID,
  accessToken: CPA_TOKEN,
  host: "preview.contentful.com",
});

// Debug helps when it's not clear why a match is not found
const DEBUG_MODE = process.env.DEBUG_MODE === "true";

// Extracts searchable string content from different field types (string, rich text, localized fields)
const extractStringContent = (fieldValue, fieldName, locale) => {
  // Case 1: Direct string
  if (typeof fieldValue === "string") {
    if (DEBUG_MODE) {
      console.log(`  Direct string value found (non-localized field)`);
    }
    return fieldValue;
  }

  // Case 2: Rich text (non-localized)
  if (
    fieldValue &&
    typeof fieldValue === "object" &&
    !Array.isArray(fieldValue) &&
    fieldValue.nodeType &&
    fieldValue.content
  ) {
    if (DEBUG_MODE) {
      console.log(`  Rich Text field detected`);
    }
    try {
      return documentToPlainTextString(fieldValue);
    } catch (error) {
      if (DEBUG_MODE) {
        console.log(
          `  ⚠️ Error converting Rich Text to plain text: ${error.message}`
        );
      }
      return null;
    }
  }

  // Case 3: Localized field
  if (
    fieldValue &&
    typeof fieldValue === "object" &&
    !Array.isArray(fieldValue)
  ) {
    // Check if the field has the specified locale
    if (DEBUG_MODE) {
      console.log(
        `  Checking if field "${fieldName}" has locale "${locale}": ${
          locale in fieldValue
        }`
      );
    }
    if (locale in fieldValue) {
      const value = fieldValue[locale];

      // Case 3a: Localized rich text
      if (
        value &&
        typeof value === "object" &&
        value.nodeType &&
        value.content
      ) {
        if (DEBUG_MODE) {
          console.log(
            `  Localized Rich Text field detected in locale "${locale}"`
          );
        }
        try {
          return documentToPlainTextString(value);
        } catch (error) {
          if (DEBUG_MODE) {
            console.log(
              `  ⚠️ Error converting Rich Text to plain text: ${error.message}`
            );
          }
          return null;
        }
      }

      // Case 3b: Localized string
      if (typeof value === "string") {
        return value;
      }
    }
  }

  return null;
};

const entryLink = (id) =>
  `https://app.contentful.com/spaces/${SPACE_ID}/environments/${ENVIRONMENT_ID}/entries/${id}`;

// Snippet maker hack
const makeSnippet = (txt, i) => {
  const pre = txt.slice(Math.max(0, i - 30), i);
  const post = txt.slice(i + term.length, i + term.length + 30);
  return `${i > 30 ? "…" : ""}${pre}[${term}]${post}${
    i + term.length + 30 < txt.length ? "…" : ""
  }`;
};

const processStringValue = (entry, fieldName, value, rows) => {
  const idx = value.indexOf(term); // case-sensitive check

  if (idx !== -1) {
    if (DEBUG_MODE) {
      console.log(`✅ MATCH FOUND in ${fieldName} at position ${idx}`);

      // Show context around the match
      const start = Math.max(0, idx - 30);
      const end = Math.min(value.length, idx + term.length + 30);
      const context =
        value.substring(start, idx) +
        "[" +
        value.substring(idx, idx + term.length) +
        "]" +
        value.substring(idx + term.length, end);
      console.log(
        `  Context: ${start > 0 ? "..." : ""}${context}${
          end < value.length ? "..." : ""
        }`
      );
    }

    rows.push({
      id: entry.sys.id,
      contentType: entry.sys.contentType?.sys.id || "Unknown",
      fieldName,
      locale: locale,
      link: entryLink(entry.sys.id),
      snippet: makeSnippet(value, idx),
    });
    return true;
  }

  if (DEBUG_MODE && value.toLowerCase().includes(term.toLowerCase())) {
    console.log(`⚠️  Would match if case-insensitive`);
  }

  return false;
};

const searchContentful = async () => {
  const pageSize = 1000;
  let skip = 0,
    total = 0,
    rows = [];

  if (DEBUG_MODE) {
    console.log(
      `Searching for exact case-sensitive matches of "${term}" in locale "${locale}"`
    );
  }

  do {
    const { items, total: t } = await client.getEntries({
      query: term,
      limit: pageSize,
      skip,
      include: 1,
    });
    total = t;

    if (DEBUG_MODE) {
      console.log(
        `Found ${items.length} potential entries (page ${skip / pageSize + 1})`
      );
    }

    for (const entry of items) {
      if (DEBUG_MODE) {
        const contentType = entry.sys.contentType?.sys.id || "Unknown";
        console.log(`\nChecking entry: ${entry.sys.id} (${contentType})`);
      }

      for (const [fieldName, fieldValue] of Object.entries(entry.fields)) {
        if (DEBUG_MODE) {
          console.log(
            `Field "${fieldName}" type: ${typeof fieldValue}, isArray: ${Array.isArray(
              fieldValue
            )}`
          );
        }

        const value = extractStringContent(fieldValue, fieldName, locale);

        if (value) {
          if (DEBUG_MODE) {
            console.log(
              `Checking "${fieldName}" (${locale}) value: "${value.substring(
                0,
                50
              )}${value.length > 50 ? "..." : ""}"`
            );
          }

          if (processStringValue(entry, fieldName, value, rows)) {
            break;
          }
        }
      }
    }

    skip += pageSize;
  } while (skip < total);

  return rows;
};

(async () => {
  try {
    const results = await searchContentful();

    if (results.length) {
      console.log(`\n========================================`);
      console.log(
        `Found ${results.length} case-sensitive matches for "${term}" in locale "${locale}":`
      );
      console.table(results);
    } else {
      console.log(
        `\nNo case-sensitive matches found for "${term}" in locale "${locale}"`
      );
    }
  } catch (error) {
    console.error("Error:", error);
  }
})();
