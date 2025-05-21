# Contentful Case-Sensitive Search

A utility script to find exact case-sensitive matches in your Contentful space using the Contentful Preview API.

## Disclaimer

This project is not supported by Contentful. Use it at your own risk. The maintainers of this repository are not responsible for any issues or damages that may arise from its use.

## Getting Started

### Cloning the Repository

To clone this repository, run the following command:

```bash
git clone <repository-url>
cd find-all-case-sensitive
```

### Installing Dependencies

Make sure you have Node.js installed. Then, install the required dependencies:

```bash
npm install
```

### Setting Up Environment Variables

Create a `.env` file in the root directory and configure the following variables:

```env
SPACE_ID=your-space-id
CPA_TOKEN=your-access-token
ENVIRONMENT_ID=your-environment-id
DEBUG_MODE=true
```

Replace `your-space-id`, `your-access-token`, and `your-environment-id` with your Contentful credentials.

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
