# Web to React CLI

A CLI tool that scrapes websites and converts them to complete React projects with routing, SEO metadata, and interactivity detection - no LLM required.

## 🚀 Usage

```bash
# Basic usage
node index.js <website-url>

# With custom output directory
node index.js https://example.com -o my-project
```

## 📦 What It Does

1. **Scrapes** website HTML, CSS, and metadata
2. **Fetches** all external stylesheets automatically
3. **Detects** all internal pages and links
4. **Converts** HTML to React components with JSX
5. **Extracts** SEO metadata (Open Graph, Twitter Cards, structured data)
6. **Detects** JavaScript interactivity (onclick, onsubmit, etc.)
7. **Handles** responsive images (srcset) and background images
8. **Generates** React Router configuration for navigation
9. **Creates** image placeholders with exact path info
10. **Outputs** a complete Vite + React project ready to run

## ✨ Features

### CSS Processing
- ✅ **External stylesheets fetched** - All `<link rel="stylesheet"` files downloaded and merged
- ✅ **Inline styles converted** - `style="..."` attributes converted to CSS classes
- ✅ **Background images extracted** - Converted to CSS custom properties
- ✅ **Duplicate CSS removal** - Automatic deduplication of CSS rules
- ✅ **Layout detection** - Flexbox/Grid containers identified

### SEO & Metadata
- ✅ **Meta tags extracted** - Title, description, keywords, viewport, author
- ✅ **Open Graph** - `og:title`, `og:description`, `og:image`, etc.
- ✅ **Twitter Cards** - `twitter:title`, `twitter:description`, etc.
- ✅ **Structured data** - JSON-LD and Microdata schemas
- ✅ **Canonical URLs** - Preserved in seo-data.json export
- ✅ **Favicon** - Path extracted for replacement

### Images & Media
- ✅ **Responsive images (srcset)** - All variants parsed and documented
- ✅ **Lazy loading detection** - Hints provided for React implementation
- ✅ **Background images** - Extracted from inline styles with CSS custom property replacement
- ✅ **Image dimensions** - Width/height attributes preserved
- ✅ **Exact paths** - Full path info in placeholders and seo-data.json

### Interactivity
- ✅ **Event handlers detected** - onclick, onchange, onsubmit, onfocus, etc.
- ✅ **State variables extracted** - Common patterns detected
- ✅ **Forms analyzed** - Input fields and validation detected
- ✅ **Toggle/visibility patterns** - Show/hide logic identified
- ✅ **Helper files generated** - `.interactivity.js` files with implementation stubs

### Multi-Page Support
- ✅ **Internal link following** - All pages on the same domain scraped
- ✅ **React Router setup** - Automatic route configuration
- ✅ **Navigation generation** - Auto-generated nav bar with all pages
- ✅ **Route naming** - Smart component names from URL paths

## 📁 Output Structure

```
generated-site/
├── src/
│   ├── pages/
│   │   ├── Home.jsx                # Page component
│   │   ├── Home.css                 # Page-specific styles
│   │   └── Home.interactivity.js    # Event handler helpers (if detected)
│   ├── App.jsx                      # Router configuration
│   ├── App.css                      # Navigation styles
│   └── main.jsx                     # Entry point
├── public/                          # Add your images here
├── index.html                       # With extracted SEO meta tags
├── seo-data.json                    # All SEO data, image paths, structured data
├── package.json                     # React + Vite dependencies
├── vite.config.js
└── README.md                        # Project-specific guide
```

## 🖼️ Adding Images

Each image placeholder shows:
- **Exact path** where to place the image (e.g., `/public/images/logo.png`)
- **Responsive variants** (srcset) - All image sizes parsed and documented
- **Dimensions** - Original width/height attributes preserved
- **Lazy loading** - Hint shown if original used lazy loading
- **Alt text** for accessibility

### To Replace Images:
1. Check `seo-data.json` for all image paths
2. Copy your images to the exact paths shown
3. Background images: update CSS custom properties in component CSS
4. Or replace placeholder `<div>` with `<img>` tags

## 📊 Data Export (seo-data.json)

Contains comprehensive data for all pages:
- All SEO metadata (meta, OG, Twitter)
- Image data (paths, srcset variants, dimensions)
- Background image locations
- Structured data (JSON-LD schemas, Microdata)
- Interactivity patterns detected

## 🎨 CSS Features

- **External stylesheets fetched** - All `<link rel="stylesheet"` files downloaded
- **Inline styles converted** - `style="..."` attributes converted to CSS classes
- **Background images extracted** - Converted to CSS custom properties
- **Duplicate removal** - Automatic deduplication of CSS rules
- **Organized structure** - Comments separating different style sources
- **Layout detection** - Flexbox/Grid containers identified

## ⚡ Interactivity

Event handlers from the original site are detected and documented in `.interactivity.js` files:

### Common Patterns Handled:
- ✅ Click handlers (onClick)
- ✅ Form submissions (onSubmit)
- ✅ Input changes (onChange)
- ✅ Toggle/show-hide elements
- ✅ Hover effects (onMouseOver/Out)

### To Implement:
1. Check `.interactivity.js` files in each page folder
2. Copy handler functions into the component
3. Connect to JSX - Replace comments with actual event handlers
4. Form handling - Pre-generated state management already included

## 🔧 Manual Adjustments (Optional)

Some features require manual implementation:

### JavaScript Animations
- **GSAP, anime.js** - Must be reimplemented (use Framer Motion)
- **Custom CSS animations triggered by JS** - Timing needs React state
- **SVG SMIL animations** - Not supported

### Third-Party Integrations
- **jQuery plugins** - Replace with React equivalents
- **Bootstrap JS components** - Use React-Bootstrap or custom implementation
- **Google Maps interactive APIs** - iframe works, APIs need manual setup

### Advanced Features
- **Server-Side Rendering (SSR)** - Output is client-side only (Vite, not Next.js)
- **API calls/fetch** - Not extracted from scripts
- **Dynamic imports** - All imports are static
- **Web Workers / Service Workers** - Not supported

### CSS Considerations
- **CSS-in-JS libraries** (styled-components) - Converted to regular CSS
- **CSS Modules** - Uses global CSS (no scoping)
- **@font-face fonts** - Removed (add font files to `public/` manually)
- **Critical CSS** - Not extracted separately

### State Management
- **Complex state** - Only basic `useState` generated
- **Redux/Context/useReducer** - Need manual setup
- **Cross-page state** - Each page is independent

### Other
- **Web Components / Shadow DOM** - Not supported
- **Canvas 2D / WebGL** - Not converted (elements preserved, context lost)
- **File uploads** - Basic detection, full implementation needed

## 🐛 Troubleshooting

**Images not showing?**
- Check the exact path in the placeholder matches your file location
- Ensure images are in `public/` folder (not `src/`)
- For background images, check `seo-data.json` and update CSS custom properties

**Styles look different?**
- Some CSS selectors may need adjustment for React structure
- Check browser DevTools for missing styles
- Background images need manual file placement (paths in `seo-data.json`)

**Interactivity not working?**
- Implement handlers from `.interactivity.js` files
- Ensure state variables are properly initialized

## 🔧 Requirements

- Node.js 18+
- Internet connection (for scraping)

## 📝 How It Works

1. **Scraping**: Uses axios + cheerio to fetch HTML and parse the DOM
2. **CSS Fetching**: Follows all external stylesheet links and downloads them
3. **Image Processing**: Parses srcset, sizes, loading attributes, creates placeholders
4. **SEO Extraction**: Reads meta tags, Open Graph, Twitter Cards, JSON-LD
5. **Interactivity Detection**: Finds inline event handlers and suggests React equivalents
6. **Conversion**: Transforms HTML to JSX, generates React components with hooks
7. **Routing**: Creates React Router setup with all discovered pages
8. **Output**: Writes complete Vite project structure

No LLM or AI required - pure DOM parsing and string transformation.
