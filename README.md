# Web to React CLI

A CLI tool that scrapes websites and converts them to React projects with routing - no LLM required.

## 🚀 Usage

```bash
# Basic usage
node index.js <website-url>

# With custom output directory
node index.js https://example.com -o my-project
```

## 📦 What It Does

1. **Scrapes** the website HTML and CSS
2. **Detects** all internal pages and links
3. **Converts** HTML to React components
4. **Generates** React Router configuration for navigation
5. **Creates** image placeholders with path info
6. **Outputs** a complete Vite + React project

## 📁 Output Structure

```
generated-site/
├── src/
│   ├── pages/           # Page components (Home.jsx, Contact.jsx, etc.)
│   ├── App.jsx         # Main app with routing
│   ├── main.jsx        # Entry point
│   └── index.css       # Global styles
├── public/             # Static assets
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## 🖼️ Image Handling

Images are converted to placeholders showing:
- Original filename
- Alt text
- Image number

Replace them by:
1. Adding images to `public/` folder
2. Updating `src` attributes in components
3. Or replacing placeholder divs with `<img>` tags

## ⚠️ Limitations

- JavaScript interactivity needs manual reimplementation
- Complex layouts may need adjustments
- External CSS files are referenced but not fetched
- Some CSS may need manual cleanup

## 🔧 Requirements

- Node.js 18+
- Internet connection (for scraping)
