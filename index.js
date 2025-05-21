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

const entryLink = (id) =>
  `https://app.contentful.com/spaces/${SPACE_ID}/environments/${ENVIRONMENT_ID}/entries/${id}`;

const makeSnippet = (txt, i) => {
  const pre = txt.slice(Math.max(0, i - 30), i);
  const post = txt.slice(i + term.length, i + term.length + 30);
  return `${i > 30 ? "…" : ""}${pre}[${term}]${post}${
    i + term.length + 30 < txt.length ? "…" : ""
  }`;
};

const processStringValue = (entry, fieldName, value, rows) => {
  console.log(
    `Searching for exact term: "${term}" in value: "${value.substring(0, 50)}${
      value.length > 50 ? "..." : ""
    }"`
  );

  // Show character-by-character comparison if there's a case-insensitive match
  const lowerValue = value.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const possibleMatch = lowerValue.indexOf(lowerTerm);

  if (possibleMatch !== -1) {
    const actualChars = value.substring(
      possibleMatch,
      possibleMatch + term.length
    );
    console.log(`DEBUG - Term vs. characters at position ${possibleMatch}:`);
    console.log(`Search term: "${term}"`);
    console.log(`Field chars: "${actualChars}"`);

    // Create a visual comparison showing exact differences
    let diffMarker = "";
    for (let i = 0; i < term.length; i++) {
      diffMarker += term[i] === actualChars[i] ? " " : "^";
    }
    if (diffMarker.trim()) {
      console.log(`Difference:   ${diffMarker}`);
    }
  }

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
    // Check if it would match case-insensitive to help debug
    if (possibleMatch !== -1) {
      console.log(
        `⚠️  Would match if case-insensitive at position ${possibleMatch}`
      );
      console.log(
        `  Case mismatch: "${term}" vs "${value.substring(
          possibleMatch,
          possibleMatch + term.length
        )}"`
      );
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
    // Log the search parameters
    console.log(
      `Searching for entries with query: "${term}" in locale: "${locale}"`
    );
    console.log(
      `Using Preview API with Space: ${SPACE_ID}, Environment: ${ENVIRONMENT_ID}`
    );

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

        // Handle different field types and structures
        let value;

        // Case 1: Field is directly a string (non-localized field or default locale)
        if (typeof fieldValue === "string") {
          console.log(`  Direct string value found (non-localized field)`);
          value = fieldValue;

          // Log the value to see what we're checking
          console.log(
            `  Direct value preview: "${value.substring(0, 50)}${
              value.length > 50 ? "..." : ""
            }"`
          );

          // Process this direct value
          processStringValue(e, fieldName, value, rows);
          continue;
        }
        // Case 2: Field is an object with locale keys or a rich text field
        else if (
          fieldValue &&
          typeof fieldValue === "object" &&
          !Array.isArray(fieldValue)
        ) {
          // Check if it's a Rich Text field (has a 'nodeType' and 'content' properties)
          if (fieldValue.nodeType && fieldValue.content) {
            console.log(`  Rich Text field detected`);
            try {
              // Convert Rich Text to plain text
              const plainText = documentToPlainTextString(fieldValue);
              console.log(
                `  Converted Rich Text to plain text: "${plainText.substring(
                  0,
                  50
                )}${plainText.length > 50 ? "..." : ""}"`
              );
              processStringValue(e, fieldName, plainText, rows);
            } catch (error) {
              console.log(
                `  ⚠️ Error converting Rich Text to plain text: ${error.message}`
              );
            }
            continue;
          }
          // Check if the field has the specified locale
          console.log(
            `  Checking if field "${fieldName}" has locale "${locale}": ${
              locale in fieldValue
            }`
          );
          if (locale in fieldValue) {
            const value = fieldValue[locale];

            // If it's a rich text field inside a localized field
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
                // Convert Rich Text to plain text
                const plainText = documentToPlainTextString(value);
                console.log(
                  `  Converted Rich Text to plain text: "${plainText.substring(
                    0,
                    50
                  )}${plainText.length > 50 ? "..." : ""}"`
                );
                processStringValue(e, fieldName, plainText, rows);
              } catch (error) {
                console.log(
                  `  ⚠️ Error converting Rich Text to plain text: ${error.message}`
                );
              }
              continue;
            }
            // Handle regular string values
            else if (typeof value === "string") {
              // Log the value with better visibility for comparison
              console.log(
                `Checking field "${fieldName}" with value: "${value.substring(
                  0,
                  50
                )}${value.length > 50 ? "..." : ""}"`
              );
              console.log(`Searching for exact term: "${term}"`);

              // For better diagnostics, show a character-by-character comparison of the first occurrence
              // of something similar to the search term
              const lowerValue = value.toLowerCase();
              const lowerTerm = term.toLowerCase();
              const possibleMatch = lowerValue.indexOf(lowerTerm);

              if (possibleMatch !== -1) {
                const actualChars = value.substring(
                  possibleMatch,
                  possibleMatch + term.length
                );
                console.log(`DEBUG - Term vs. actual characters in field:`);
                console.log(`Search term: "${term}"`);
                console.log(`Field chars: "${actualChars}"`);

                // Create a visual comparison showing exact differences
                let diffMarker = "";
                for (let i = 0; i < term.length; i++) {
                  diffMarker += term[i] === actualChars[i] ? " " : "^";
                }
                if (diffMarker.trim()) {
                  console.log(`Difference:   ${diffMarker}`);
                }
              }

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
                // Check if it would match case-insensitive to help debug
                if (value.toLowerCase().includes(term.toLowerCase())) {
                  const lowerValue = value.toLowerCase();
                  const lowerTerm = term.toLowerCase();
                  const insensitivePos = lowerValue.indexOf(lowerTerm);
                  console.log(
                    `⚠️  Would match if case-insensitive at position ${insensitivePos}`
                  );
                  console.log(
                    `  Case mismatch: "${term}" vs "${value.substring(
                      insensitivePos,
                      insensitivePos + term.length
                    )}"`
                  );
                }
              }
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
