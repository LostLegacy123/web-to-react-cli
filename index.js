#!/usr/bin/env node

import { Command } from 'commander';
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs-extra';
import path from 'path';
import { URL } from 'url';

const program = new Command();

class WebToReactConverter {
  constructor(baseUrl, outputDir) {
    this.baseUrl = new URL(baseUrl);
    this.outputDir = outputDir;
    this.domainName = this.baseUrl.hostname.replace(/^www\./, '');
    this.pages = new Map();
    this.globalStyles = [];
    this.imageCounter = 0;
  }

  async convert() {
    console.log(`🚀 Starting conversion of ${this.baseUrl.href}`);
    console.log(`📁 Output: ${this.outputDir}\n`);

    await this.scrapeWebsite();
    await this.generateReactProject();
    
    console.log(`\n✅ Conversion complete!`);
    console.log(`📂 Project location: ${path.resolve(this.outputDir)}`);
    console.log(`\nTo run the project:`);
    console.log(`  cd ${this.outputDir}`);
    console.log(`  npm install`);
    console.log(`  npm run dev`);
  }

  async scrapeWebsite() {
    console.log('🔍 Scraping pages...');
    const toScrape = [this.baseUrl.href];
    const scraped = new Set();

    while (toScrape.length > 0) {
      const url = toScrape.pop();
      if (scraped.has(url)) continue;
      
      try {
        const pageData = await this.scrapePage(url);
        if (pageData) {
          scraped.add(url);
          this.pages.set(pageData.route, pageData);
          
          // Find internal links
          for (const link of pageData.links) {
            if (!scraped.has(link) && this.isInternalLink(link)) {
              toScrape.push(link);
            }
          }
        }
      } catch (error) {
        console.log(`  ⚠️  Failed to scrape: ${url}`);
      }
    }

    console.log(`  ✓ Scraped ${this.pages.size} page(s)\n`);
  }

  async scrapePage(url) {
    console.log(`  📄 Fetching: ${new URL(url).pathname || '/'}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    
    // Remove script tags
    $('script').remove();
    
    // Extract CSS
    const styles = [];
    $('style').each((_, el) => {
      styles.push($(el).html());
    });
    $('link[rel="stylesheet"]').each((_, el) => {
      // Note: External CSS would need separate fetching
      styles.push(`/* External: ${$(el).attr('href')} */`);
    });

    // Find all links
    const links = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        try {
          const fullUrl = new URL(href, url).href;
          links.push(fullUrl);
        } catch {}
      }
    });

    // Process images - convert to placeholders
    $('img').each((_, el) => {
      const src = $(el).attr('src');
      const alt = $(el).attr('alt') || 'Image';
      this.imageCounter++;
      
      $(el).replaceWith(`
        <div className="image-placeholder" data-original-src="${src}" data-alt="${alt}">
          <div className="placeholder-content">
            <span>📷 Placeholder Image #{this.imageCounter}</span>
            <span>Original: ${src ? path.basename(src) : 'unknown'}</span>
            <span>Alt: ${alt}</span>
          </div>
        </div>
      `);
    });

    // Get route from URL
    const parsedUrl = new URL(url);
    let route = parsedUrl.pathname;
    if (route === '/') route = '/home';
    
    // Generate component name from route
    const componentName = this.routeToComponentName(route);

    return {
      url,
      route,
      componentName,
      title: $('title').text() || componentName,
      html: $('body').html(),
      styles: styles.join('\n'),
      links: [...new Set(links)],
      $: $
    };
  }

  isInternalLink(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname === this.baseUrl.hostname || 
             parsed.hostname === `www.${this.baseUrl.hostname}`;
    } catch {
      return false;
    }
  }

  routeToComponentName(route) {
    return route
      .split('/')
      .filter(Boolean)
      .map(part => part.replace(/[^a-zA-Z0-9]/g, '-'))
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('') || 'Home';
  }

  async generateReactProject() {
    console.log('⚛️  Generating React project...');
    
    await fs.ensureDir(this.outputDir);
    
    // Create project structure
    const srcDir = path.join(this.outputDir, 'src');
    const pagesDir = path.join(srcDir, 'pages');
    const componentsDir = path.join(srcDir, 'components');
    const publicDir = path.join(this.outputDir, 'public');
    
    await fs.ensureDir(pagesDir);
    await fs.ensureDir(componentsDir);
    await fs.ensureDir(publicDir);
    
    // Generate package.json
    await this.generatePackageJson();
    
    // Generate Vite config
    await this.generateViteConfig();
    
    // Generate index.html
    await this.generateIndexHtml();
    
    // Generate components
    for (const [route, page] of this.pages) {
      await this.generatePageComponent(page, pagesDir);
    }
    
    // Generate App.jsx with routing
    await this.generateAppJsx(srcDir);
    
    // Generate main.jsx
    await this.generateMainJsx(srcDir);
    
    // Generate global styles
    await this.generateGlobalStyles(srcDir);
    
    // Generate README
    await this.generateReadme();
    
    console.log(`  ✓ Generated ${this.pages.size} page component(s)`);
    console.log(`  ✓ Generated routing configuration`);
    console.log(`  ✓ Created ${this.imageCounter} image placeholder(s)\n`);
  }

  async generatePackageJson() {
    const pkg = {
      name: this.domainName.replace(/\./g, '-'),
      private: true,
      version: '0.0.1',
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview'
      },
      dependencies: {
        react: '^18.2.0',
        'react-dom': '^18.2.0',
        'react-router-dom': '^6.20.0'
      },
      devDependencies: {
        '@types/react': '^18.2.43',
        '@types/react-dom': '^18.2.17',
        '@vitejs/plugin-react': '^4.2.1',
        vite: '^5.0.8'
      }
    };
    
    await fs.writeJson(path.join(this.outputDir, 'package.json'), pkg, { spaces: 2 });
  }

  async generateViteConfig() {
    const config = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
`;
    await fs.writeFile(path.join(this.outputDir, 'vite.config.js'), config);
  }

  async generateIndexHtml() {
    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${this.domainName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`;
    await fs.writeFile(path.join(this.outputDir, 'index.html'), html);
  }

  async generatePageComponent(page, pagesDir) {
    // Convert HTML to JSX
    let jsxContent = this.htmlToJsx(page.html, page.$);
    
    const componentCode = `import React from 'react';
import './${page.componentName}.css';

const ${page.componentName} = () => {
  return (
    <div className="page-container ${page.componentName.toLowerCase()}-page">
${jsxContent}
    </div>
  );
};

export default ${page.componentName};
`;

    await fs.writeFile(
      path.join(pagesDir, `${page.componentName}.jsx`),
      componentCode
    );
    
    // Generate CSS for this page
    await fs.writeFile(
      path.join(pagesDir, `${page.componentName}.css`),
      this.generatePageCss(page)
    );
  }

  htmlToJsx(html, $) {
    // Process HTML to JSX conversion
    // This is a simplified version - would need more robust handling
    let processed = html
      .replace(/class=/g, 'className=')
      .replace(/for=/g, 'htmlFor=')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\n\s*\n/g, '\n')
      .split('\n')
      .map(line => '      ' + line)
      .join('\n');
    
    return processed;
  }

  generatePageCss(page) {
    return `/* Styles for ${page.componentName} */
/* Extracted from: ${page.url} */

.page-container {
  min-height: 100vh;
  width: 100%;
}

${page.styles}

/* Image Placeholder Styles */
.image-placeholder {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  border: 2px dashed #6c757d;
  border-radius: 8px;
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 1rem 0;
}

.placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  color: #6c757d;
  font-size: 0.875rem;
  text-align: center;
  padding: 1rem;
}

.placeholder-content span:first-child {
  font-size: 1.25rem;
  font-weight: 600;
}
`;
  }

  async generateAppJsx(srcDir) {
    const imports = [];
    const routes = [];
    
    for (const [route, page] of this.pages) {
      imports.push(`import ${page.componentName} from './pages/${page.componentName}';`);
      
      const path = route === '/home' ? '/' : route;
      routes.push(`        <Route path="${path}" element={<${page.componentName} />} />`);
    }

    const appCode = `import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
${imports.join('\n')}
import './App.css';

function App() {
  return (
    <Router>
      <div className="app">
        <nav className="generated-nav">
          <div className="nav-brand">
            <Link to="/">${this.domainName}</Link>
          </div>
          <ul className="nav-links">
${this.generateNavLinks()}
          </ul>
        </nav>
        
        <main>
          <Routes>
${routes.join('\n')}
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
`;

    await fs.writeFile(path.join(srcDir, 'App.jsx'), appCode);
    
    // Generate App.css
    const appCss = `.app {
  min-height: 100vh;
}

.generated-nav {
  background: #1a1a1a;
  color: white;
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.nav-brand a {
  color: white;
  text-decoration: none;
  font-size: 1.25rem;
  font-weight: bold;
}

.nav-links {
  display: flex;
  list-style: none;
  gap: 1.5rem;
  margin: 0;
  padding: 0;
}

.nav-links a {
  color: #ccc;
  text-decoration: none;
  transition: color 0.2s;
}

.nav-links a:hover {
  color: white;
}

main {
  min-height: calc(100vh - 64px);
}
`;
    await fs.writeFile(path.join(srcDir, 'App.css'), appCss);
  }

  generateNavLinks() {
    const links = [];
    for (const [route, page] of this.pages) {
      const path = route === '/home' ? '/' : route;
      const label = page.componentName.replace(/([A-Z])/g, ' $1').trim();
      links.push(`            <li><Link to="${path}">${label}</Link></li>`);
    }
    return links.join('\n');
  }

  async generateMainJsx(srcDir) {
    const mainCode = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`;
    await fs.writeFile(path.join(srcDir, 'main.jsx'), mainCode);
  }

  async generateGlobalStyles(srcDir) {
    const indexCss = `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  line-height: 1.5;
}

code {
  font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
    monospace;
}

a {
  color: inherit;
  text-decoration: none;
}

button {
  cursor: pointer;
  border: none;
  background: none;
}

img {
  max-width: 100%;
  height: auto;
}
`;
    await fs.writeFile(path.join(srcDir, 'index.css'), indexCss);
  }

  async generateReadme() {
    const readme = `# ${this.domainName}

Generated from: ${this.baseUrl.href}

## 🚀 Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

## 📁 Project Structure

- \`src/pages/\` - Page components (one per route)
- \`src/components/\` - Reusable components
- \`src/App.jsx\` - Main app with routing

## 🖼️ Images

Images have been converted to placeholders. To add real images:

1. Place your images in the \`public/\` folder
2. Update the \`src\` attributes in the page components
3. Or replace the placeholder divs with actual \`<img>\` tags

## 📝 Notes

- Extracted from: ${this.baseUrl.href}
- Pages found: ${this.pages.size}
- Image placeholders: ${this.imageCounter}
- Routing: React Router v6

## ⚠️ Manual Steps Required

1. Replace image placeholders with actual images
2. Review and adjust styles as needed
3. Add any missing interactivity
4. Test all navigation links
`;
    await fs.writeFile(path.join(this.outputDir, 'README.md'), readme);
  }
}

// CLI Setup
program
  .name('web2react')
  .description('Scrape websites and convert to React projects')
  .version('1.0.0')
  .argument('<url>', 'Website URL to scrape')
  .option('-o, --output <dir>', 'Output directory', 'generated-site')
  .action(async (url, options) => {
    try {
      const converter = new WebToReactConverter(url, options.output);
      await converter.convert();
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

program.parse();
