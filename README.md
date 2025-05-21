# Contentful Case-Sensitive Search

A utility script to find exact case-sensitive matches in your Contentful space using the Contentful Preview API.

## Setup

1. Copy `sample.env` to `.env`
2. Add your Contentful Space ID and Preview API Token to the `.env` file

## Usage

```bash
node index.js "search term" [locale]
```

### Parameters:

- `search term`: The exact case-sensitive term you want to search for (required)
- `locale`: The locale code to search within (optional, defaults to "en-US")

### Examples:

Search for "ProductName" in the default locale (en-US):

```bash
node index.js "ProductName"
```

Search for "ProductName" in the German locale:

```bash
node index.js "ProductName" de-DE
```

## Features

- Searches through all entries in your Contentful space
- Case-sensitive matching
- Locale-specific searching
- Works with the Preview API to find both published and unpublished content
- Shows context around matched terms
