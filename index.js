import { createClient } from "contentful";
import dotenv from "dotenv";
import { documentToPlainTextString } from "@contentful/rich-text-plain-text-renderer";

// Load environment variables from .env file
dotenv.config();

const term = process.argv[2];
const locale = process.argv[3] || "en-US"; // Default to en-US if not provided
if (!term) throw new Error('Usage: node index.js "string to search" [locale]');

const { SPACE_ID, CPA_TOKEN, ENVIRONMENT_ID } = process.env;
if (!SPACE_ID || !CPA_TOKEN)
  throw new Error("Set SPACE_ID and CPA_TOKEN and ENVIRONMENT_ID env vars.");

const client = createClient({
  space: SPACE_ID,
  environment: ENVIRONMENT_ID,
  accessToken: CPA_TOKEN,
  host: "preview.contentful.com",
});

// Extracts searchable string content from different field types (string, rich text, localized fields)
const extractStringContent = (fieldValue, fieldName, locale) => {
  // Case 1: Direct string
  if (typeof fieldValue === "string") {
    console.log(`  Direct string value found (non-localized field)`);
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
    console.log(`  Rich Text field detected`);
    try {
      return documentToPlainTextString(fieldValue);
    } catch (error) {
      console.log(
        `  ⚠️ Error converting Rich Text to plain text: ${error.message}`
      );
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
    console.log(
      `  Checking if field "${fieldName}" has locale "${locale}": ${
        locale in fieldValue
      }`
    );
    if (locale in fieldValue) {
      const value = fieldValue[locale];

      // Case 3a: Localized rich text
      if (
        value &&
        typeof value === "object" &&
        value.nodeType &&
        value.content
      ) {
        console.log(
          `  Localized Rich Text field detected in locale "${locale}"`
        );
        try {
          return documentToPlainTextString(value);
        } catch (error) {
          console.log(
            `  ⚠️ Error converting Rich Text to plain text: ${error.message}`
          );
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
  // console.log(`Checking field "${fieldName}" for term: "${term}"`);

  const idx = value.indexOf(term); // case-sensitive check
  if (idx !== -1) {
    console.log(`✅ MATCH FOUND at position ${idx}`);

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

    // Add to results
    rows.push({
      id: entry.sys.id,
      fieldName,
      link: entryLink(entry.sys.id),
      snippet: makeSnippet(value, idx),
    });
    return true;
  } else {
    console.log(`❌ NO MATCH (case-sensitive comparison)`);
    // Simple note if there would be a case-insensitive match
    if (value.toLowerCase().includes(term.toLowerCase())) {
      console.log(`⚠️  Would match if case-insensitive`);
    }
    return false;
  }
};

(async () => {
  const pageSize = 1000;
  let skip = 0,
    total = 0,
    rows = [];

  do {
    // console.log(
    //   `Searching for entries with query: "${term}" in locale: "${locale}"`
    // );
    // console.log(
    //   `Using Preview API with Space: ${SPACE_ID}, Environment: ${ENVIRONMENT_ID}`
    // );

    // Use the Content Delivery API's full-text search functionality
    const { items, total: t } = await client.getEntries({
      query: term, // initial coarse filter (case-insensitive)
      locale: locale, // Use the specified locale
      limit: pageSize,
      skip,
      include: 1, // Include 1 level of linked entries
    });
    total = t;

    console.log(
      `Found ${
        items.length
      } entries for "${term}" in locale "${locale}" (page ${
        skip / pageSize + 1
      })`
    );

    // Filter out entries that don't match the term
    // This is a more precise filter (case-sensitive)
    // and is necessary because the initial query is case-insensitive
    // and may return entries that don't actually contain the term.
    console.log(
      `\nBeginning to check ${items.length} entries for case-sensitive matches...`
    );

    for (const e of items) {
      try {
        // Log the entry ID for debugging
        const contentType = e.sys.contentType?.sys.id || "Unknown";
        console.log(
          `\nChecking entry: ${e.sys.id} (Content Type: ${contentType})`
        );

        console.log(
          `Entry has ${Object.keys(e.fields).length} fields: ${Object.keys(
            e.fields
          ).join(", ")}`
        );
      } catch (error) {
        console.log(`Error processing entry: ${e?.sys?.id || "unknown"}`);
        console.error(error);
        continue;
      }
      console.log(`Beginning to check fields for entry ${e.sys.id}...`);
      for (const [fieldName, fieldValue] of Object.entries(e.fields)) {
        // Log the field type to diagnose issues
        console.log(
          `Field "${fieldName}" type: ${typeof fieldValue}, isArray: ${Array.isArray(
            fieldValue
          )}`
        );

        // Extract string content from the field
        const value = extractStringContent(fieldValue, fieldName, locale);

        if (value) {
          console.log(
            `Checking field "${fieldName}" with value: "${value.substring(
              0,
              50
            )}${value.length > 50 ? "..." : ""}"`
          );

          const idx = value.indexOf(term); // case-sensitive check

          if (idx !== -1) {
            console.log(`✅ MATCH FOUND at position ${idx}`);

            // Show context around the match to make it clear why it matched
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

            rows.push({
              id: e.sys.id,
              fieldName,
              link: entryLink(e.sys.id),
              snippet: makeSnippet(value, idx),
            });
            break;
          } else {
            console.log(`❌ NO MATCH (case-sensitive comparison)`);
            // Simple note if there would be a case-insensitive match
            if (value.toLowerCase().includes(term.toLowerCase())) {
              console.log(`⚠️  Would match if case-insensitive`);
            }
          }
        }
        if (rows.length && rows.at(-1).id === e.sys.id) break;
      }
    }
    skip += pageSize;
  } while (skip < total);

  rows.length ? console.table(rows) : console.log(`No matches for "${term}"`);
})().catch(console.error);
