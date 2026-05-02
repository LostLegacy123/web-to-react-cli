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
    this.fetchedCss = new Map();
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
    
    // Extract inline scripts before removing them
    const interactivity = this.extractInteractivity($, url);
    
    // Remove script tags but keep their interactivity info
    $('script').remove();
    
    // Extract and fetch all CSS (inline + external)
    const styles = await this.extractAllStyles($, url);
    
    // Extract SEO and meta data
    const seoData = this.extractSEOMetadata($, url);
    
    // Extract structured data
    const structuredData = this.extractStructuredData($);

    // Find all links
    const links = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        try {
          const fullUrl = new URL(href, url).href;
          links.push(fullUrl);
        } catch {}
      }
    });

    // Process images with responsive support (srcset, sizes, lazy loading)
    const imageData = [];
    $('img').each((_, el) => {
      const $img = $(el);
      const src = $img.attr('src');
      const srcset = $img.attr('srcset');
      const sizes = $img.attr('sizes');
      const alt = $img.attr('alt') || 'Image';
      const loading = $img.attr('loading');
      const width = $img.attr('width');
      const height = $img.attr('height');
      
      this.imageCounter++;
      
      // Store comprehensive image data
      const originalPath = src ? new URL(src, url).pathname : '/images/placeholder.jpg';
      imageData.push({
        id: this.imageCounter,
        originalPath,
        srcset: srcset ? this.parseSrcset(srcset, url) : null,
        sizes,
        alt,
        loading,
        width,
        height
      });
      
      // Create enhanced placeholder with responsive data
      const srcsetInfo = srcset ? `<small>Responsive: ${srcset.split(',').length} variants</small>` : '';
      const lazyHint = loading === 'lazy' ? '<small>💡 Use React.lazy() or Intersection Observer</small>' : '';
      
      $img.replaceWith(`
        <div className="image-placeholder image-${this.imageCounter}" data-original-path="${originalPath}" data-alt="${alt}"${srcset ? ' data-responsive="true"' : ''}>
          <div className="placeholder-content">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span>Image #${this.imageCounter}${width && height ? ` (${width}x${height})` : ''}</span>
            <code className="path-hint">/public${originalPath}</code>
            ${srcsetInfo}
            ${lazyHint}
          </div>
        </div>
      `);
    });
    
    // Extract background images from inline styles
    const bgImages = [];
    $('*[style*="background"]').each((_, el) => {
      const style = $(el).attr('style') || '';
      const bgMatch = style.match(/background(?:-image)?\s*:\s*url\(['"]?([^'")]+)['"]?\)/);
      if (bgMatch) {
        const bgPath = new URL(bgMatch[1], url).pathname;
        bgImages.push({
          element: $(el).attr('class')?.split(' ')[0] || $(el).attr('id') || el.tagName.toLowerCase(),
          path: bgPath,
          originalUrl: bgMatch[1]
        });
        
        // Replace with CSS custom property for easy updating
        const newStyle = style.replace(
          /background(?:-image)?\s*:\s*url\(['"]?[^'"]+['"]?\)/,
          `background: var(--bg-image-${bgImages.length}, linear-gradient(135deg, #667eea 0%, #764ba2 100%))`
        );
        $(el).attr('style', newStyle);
      }
    });

    // Detect layout structures (flex/grid)
    const layoutInfo = this.detectLayoutStructures($);

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
      styles: styles,
      links: [...new Set(links)],
      interactivity,
      layoutInfo,
      seoData,
      imageData,
      bgImages,
      structuredData,
      $: $
    };
  }

  extractSEOMetadata($, pageUrl) {
    const metadata = {
      title: $('title').text(),
      description: $('meta[name="description"]').attr('content'),
      keywords: $('meta[name="keywords"]').attr('content'),
      author: $('meta[name="author"]').attr('content'),
      viewport: $('meta[name="viewport"]').attr('content'),
      charset: $('meta[charset]').attr('charset'),
      canonical: $('link[rel="canonical"]').attr('href'),
      
      // Open Graph
      og: {},
      // Twitter Cards
      twitter: {},
      // Other important meta
      other: {}
    };
    
    // Extract Open Graph tags
    $('meta[property^="og:"]').each((_, el) => {
      const property = $(el).attr('property').replace('og:', '');
      metadata.og[property] = $(el).attr('content');
    });
    
    // Extract Twitter Card tags
    $('meta[name^="twitter:"]').each((_, el) => {
      const name = $(el).attr('name').replace('twitter:', '');
      metadata.twitter[name] = $(el).attr('content');
    });
    
    // Extract other important meta
    const importantNames = ['theme-color', 'robots', 'googlebot', 'language', 'generator'];
    $('meta[name]').each((_, el) => {
      const name = $(el).attr('name');
      if (importantNames.includes(name)) {
        metadata.other[name] = $(el).attr('content');
      }
    });
    
    // Extract favicon
    const favicon = $('link[rel="icon"], link[rel="shortcut icon"]').attr('href');
    if (favicon) {
      metadata.favicon = new URL(favicon, pageUrl).pathname;
    }
    
    return metadata;
  }

  extractStructuredData($) {
    const schemas = [];
    
    // JSON-LD structured data
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).html());
        schemas.push({
          type: 'JSON-LD',
          data: json,
          '@type': json['@type'] || 'Unknown'
        });
      } catch (e) {
        schemas.push({
          type: 'JSON-LD',
          data: $(el).html(),
          error: 'Failed to parse'
        });
      }
    });
    
    // Microdata (itemscope/itemtype)
    const microdata = [];
    $('[itemscope]').each((_, el) => {
      const $el = $(el);
      const itemtype = $el.attr('itemtype');
      const props = {};
      
      $el.find('[itemprop]').each((_, prop) => {
        const $prop = $(prop);
        const propName = $prop.attr('itemprop');
        const propValue = $prop.attr('content') || $prop.text() || $prop.attr('href') || $prop.attr('src');
        props[propName] = propValue;
      });
      
      microdata.push({
        type: 'Microdata',
        itemtype,
        props
      });
    });
    
    return { schemas, microdata };
  }

  parseSrcset(srcset, baseUrl) {
    return srcset.split(',').map(entry => {
      const [url, descriptor] = entry.trim().split(/\s+/);
      return {
        url: new URL(url, baseUrl).pathname,
        descriptor: descriptor || '1x'
      };
    });
  }

  extractInteractivity($, pageUrl) {
    const events = [];
    const stateVars = new Set();
    
    // Extract inline event handlers
    const eventAttributes = ['onclick', 'onchange', 'onsubmit', 'onfocus', 'onblur', 'onmouseover', 'onmouseout', 'onkeydown', 'onkeyup'];
    
    $('*').each((_, el) => {
      const $el = $(el);
      const tagName = el.tagName?.toLowerCase();
      
      eventAttributes.forEach(attr => {
        const handler = $el.attr(attr);
        if (handler) {
          const reactEvent = attr.replace(/^on/, '').toLowerCase();
          const componentId = $el.attr('id') || $el.attr('class')?.split(' ')[0] || tagName;
          
          events.push({
            element: componentId,
            originalEvent: attr,
            reactEvent: `on${reactEvent.charAt(0).toUpperCase() + reactEvent.slice(1)}`,
            handler: handler,
            tagName: tagName
          });
          
          // Detect state variables from common patterns
          const statePatterns = [
            /document\.getElementById\(['"](\w+)['"]\)/g,
            /\$\(['"]#(\w+)['"]\)/g,
            /is(\w+)/g,
            /show(\w+)/g,
            /toggle(\w+)/g,
            /active(\w+)/g
          ];
          
          statePatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(handler)) !== null) {
              stateVars.add(match[1]);
            }
          });
        }
      });
      
      // Detect forms and their fields
      if (tagName === 'form') {
        const formId = $el.attr('id') || $el.attr('name') || 'form';
        const fields = [];
        $el.find('input, select, textarea').each((_, field) => {
          const $field = $(field);
          fields.push({
            name: $field.attr('name') || $field.attr('id'),
            type: $field.attr('type') || field.tagName.toLowerCase(),
            required: $field.attr('required') !== undefined
          });
        });
        
        if (fields.length > 0) {
          events.push({
            element: formId,
            type: 'form',
            fields: fields
          });
        }
      }
    });
    
    // Extract toggle/visibility patterns
    $('*[style*="display"], *[class*="hidden"], *[class*="visible"], *[class*="show"], *[class*="hide"]').each((_, el) => {
      const $el = $(el);
      const style = $el.attr('style') || '';
      const classes = $el.attr('class') || '';
      
      if (style.includes('display:none') || classes.includes('hidden') || classes.includes('hide')) {
        events.push({
          element: $el.attr('id') || classes.split(' ')[0],
          type: 'toggleable',
          initialState: 'hidden',
          selector: $el.attr('id') ? `#${$el.attr('id')}` : `.${classes.split(' ')[0]}`
        });
      }
    });
    
    return {
      events,
      stateVars: [...stateVars],
      hasInteractivity: events.length > 0 || stateVars.size > 0
    };
  }

  async extractAllStyles($, pageUrl) {
    const allStyles = [];
    
    // Extract inline styles
    $('style').each((_, el) => {
      allStyles.push({
        type: 'inline',
        content: $(el).html()
      });
    });
    
    // Fetch external stylesheets
    const cssLinks = [];
    $('link[rel="stylesheet"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        cssLinks.push(href);
      }
    });
    
    // Fetch each external CSS file
    for (const cssUrl of cssLinks) {
      try {
        const fullUrl = new URL(cssUrl, pageUrl).href;
        
        // Skip if already fetched
        if (this.fetchedCss.has(fullUrl)) {
          allStyles.push({
            type: 'external',
            url: cssUrl,
            content: this.fetchedCss.get(fullUrl)
          });
          continue;
        }
        
        console.log(`    🎨 Fetching CSS: ${cssUrl}`);
        const cssResponse = await axios.get(fullUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 10000
        });
        
        const cssContent = cssResponse.data;
        this.fetchedCss.set(fullUrl, cssContent);
        
        allStyles.push({
          type: 'external',
          url: cssUrl,
          content: cssContent
        });
      } catch (error) {
        console.log(`    ⚠️  Failed to fetch CSS: ${cssUrl}`);
        allStyles.push({
          type: 'external',
          url: cssUrl,
          content: `/* Failed to fetch: ${cssUrl} */`,
          error: true
        });
      }
    }
    
    // Extract inline styles from elements and convert to CSS classes
    const inlineStyles = [];
    $('*[style]').each((_, el) => {
      const $el = $(el);
      const style = $el.attr('style');
      const className = $el.attr('class')?.split(' ')[0] || $el.attr('id') || el.tagName.toLowerCase();
      
      if (style && !inlineStyles.some(s => s.className === className)) {
        inlineStyles.push({
          className: `inline-${className}`,
          style: style
        });
        
        // Replace inline style with class
        $el.removeAttr('style');
        $el.addClass(`inline-${className}`);
      }
    });
    
    // Merge all styles with better organization
    let mergedCss = this.mergeAndCleanCss(allStyles, inlineStyles);
    
    return {
      raw: allStyles,
      merged: mergedCss,
      inlineClasses: inlineStyles
    };
  }

  mergeAndCleanCss(allStyles, inlineStyles) {
    // Start with CSS reset and base styles
    let merged = `/* === BASE STYLES === */\n`;
    
    // Add all external and inline styles
    allStyles.forEach((style, index) => {
      if (style.type === 'external') {
        merged += `\n/* === EXTERNAL: ${style.url} === */\n`;
        merged += this.cleanCssContent(style.content);
      } else {
        merged += `\n/* === INLINE STYLES #${index + 1} === */\n`;
        merged += this.cleanCssContent(style.content);
      }
    });
    
    // Add converted inline styles as classes
    if (inlineStyles.length > 0) {
      merged += `\n/* === CONVERTED INLINE STYLES === */\n`;
      inlineStyles.forEach(({ className, style }) => {
        merged += `.${className} { ${style} }\n`;
      });
    }
    
    // Remove duplicates and optimize
    merged = this.removeDuplicateRules(merged);
    
    return merged;
  }

  cleanCssContent(css) {
    // Remove @import rules (we already fetched them)
    css = css.replace(/@import\s+url\([^)]+\);?/g, '');
    
    // Remove @font-face (fonts won't work without files)
    css = css.replace(/@font-face\s*{[^}]+}/g, '');
    
    // Clean up whitespace
    css = css.replace(/\n\s*\n/g, '\n');
    
    return css;
  }

  removeDuplicateRules(css) {
    const seen = new Set();
    const lines = css.split('\n');
    const result = [];
    
    lines.forEach(line => {
      const normalized = line.trim().replace(/\s+/g, ' ');
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      result.push(line);
    });
    
    return result.join('\n');
  }

  detectLayoutStructures($) {
    const layouts = [];
    
    // Detect flexbox containers
    $('*').each((_, el) => {
      const $el = $(el);
      const style = $el.attr('style') || '';
      const classes = $el.attr('class') || '';
      
      // Check for flexbox
      if (style.includes('display: flex') || style.includes('display:flex')) {
        layouts.push({
          type: 'flex',
          element: $el.attr('id') || classes.split(' ')[0] || el.tagName.toLowerCase(),
          selector: $el.attr('id') ? `#${$el.attr('id')}` : `.${classes.split(' ')[0]}`
        });
      }
      
      // Check for grid
      if (style.includes('display: grid') || style.includes('display:grid')) {
        layouts.push({
          type: 'grid',
          element: $el.attr('id') || classes.split(' ')[0] || el.tagName.toLowerCase(),
          selector: $el.attr('id') ? `#${$el.attr('id')}` : `.${classes.split(' ')[0]}`
        });
      }
      
      // Detect common layout patterns
      if (classes.includes('container') || classes.includes('wrapper') || classes.includes('main')) {
        layouts.push({
          type: 'container',
          element: classes.split(' ')[0],
          selector: `.${classes.split(' ')[0]}`
        });
      }
    });
    
    return layouts;
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
    
    // Generate simple README
    await this.generateSimpleReadme();
    
    console.log(`  ✓ Generated ${this.pages.size} page component(s)`);
    console.log(`  ✓ Generated routing configuration`);
    console.log(`  ✓ Fetched ${this.fetchedCss.size} external CSS file(s)`);
    console.log(`  ✓ Created ${this.imageCounter} image placeholder(s)`);
    console.log(`  ✓ Extracted interactivity patterns`);
    console.log(`  ✓ Extracted SEO metadata (Open Graph, Twitter Cards)`);
    console.log(`  ✓ Parsed responsive images (srcset) and background images\n`);
    
    // Generate SEO data export
    await this.generateSEOExport();
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
    // Get SEO data from the home page or first page
    const firstPage = [...this.pages.values()][0];
    const seo = firstPage?.seoData || {};
    
    let metaTags = '';
    
    // Basic meta
    if (seo.charset) {
      metaTags += `    <meta charset="${seo.charset}" />\n`;
    }
    
    if (seo.viewport) {
      metaTags += `    <meta name="viewport" content="${seo.viewport}" />\n`;
    } else {
      metaTags += `    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n`;
    }
    
    if (seo.description) {
      metaTags += `    <meta name="description" content="${seo.description}" />\n`;
    }
    
    if (seo.keywords) {
      metaTags += `    <meta name="keywords" content="${seo.keywords}" />\n`;
    }
    
    if (seo.author) {
      metaTags += `    <meta name="author" content="${seo.author}" />\n`;
    }
    
    // Open Graph
    if (seo.og && Object.keys(seo.og).length > 0) {
      metaTags += `\n    <!-- Open Graph -->\n`;
      Object.entries(seo.og).forEach(([key, value]) => {
        metaTags += `    <meta property="og:${key}" content="${value}" />\n`;
      });
    }
    
    // Twitter Cards
    if (seo.twitter && Object.keys(seo.twitter).length > 0) {
      metaTags += `\n    <!-- Twitter Cards -->\n`;
      Object.entries(seo.twitter).forEach(([key, value]) => {
        metaTags += `    <meta name="twitter:${key}" content="${value}" />\n`;
      });
    }
    
    // Favicon
    let favicon = '/vite.svg';
    if (seo.favicon) {
      favicon = `/public${seo.favicon}`;
    }
    
    const title = seo.title || this.domainName;
    
    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
${metaTags}    <link rel="icon" type="image/svg+xml" href="${favicon}" />
    <title>${title}</title>
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
    const componentCode = this.generateReactComponent(page);

    await fs.writeFile(
      path.join(pagesDir, `${page.componentName}.jsx`),
      componentCode
    );
    
    // Generate CSS for this page with the merged styles
    await fs.writeFile(
      path.join(pagesDir, `${page.componentName}.css`),
      this.generatePageCss(page)
    );
    
    // Generate interactivity helper if needed
    if (page.interactivity?.hasInteractivity) {
      await fs.writeFile(
        path.join(pagesDir, `${page.componentName}.interactivity.js`),
        this.generateInteractivityHelper(page)
      );
    }
  }

  generateReactComponent(page) {
    const { interactivity, componentName } = page;
    const hasInteractivity = interactivity?.hasInteractivity;
    
    let imports = "import React";
    let hooks = '';
    
    if (hasInteractivity) {
      const neededHooks = [];
      if (interactivity.stateVars?.length > 0) neededHooks.push('useState');
      if (interactivity.events?.some(e => e.type === 'form')) neededHooks.push('useState');
      
      imports = `import React, { ${neededHooks.join(', ')} }`;
      hooks = this.generateStateHooks(interactivity);
    }
    
    // Convert HTML to JSX with interactivity
    let jsxContent = this.htmlToJsx(page.html, page.$, interactivity);
    
    // Add event handlers if interactivity detected
    if (hasInteractivity) {
      jsxContent = this.addEventHandlers(jsxContent, interactivity);
    }
    
    return `${imports} from 'react';
import './${componentName}.css';
${hasInteractivity ? `// Interactivity guide: see ${componentName}.interactivity.js` : ''}

const ${componentName} = () => {
${hooks}
  return (
    <div className="page-container ${componentName.toLowerCase()}-page">
${jsxContent}
    </div>
  );
};

export default ${componentName};
`;
  }

  generateStateHooks(interactivity) {
    let hooks = '';
    
    // Generate useState for detected state variables
    interactivity.stateVars?.forEach(varName => {
      hooks += `  const [${varName}, set${varName.charAt(0).toUpperCase() + varName.slice(1)}] = useState(false);\n`;
    });
    
    // Generate state for forms
    interactivity.events?.forEach(event => {
      if (event.type === 'form') {
        const formState = event.element.replace(/[^a-zA-Z]/g, '');
        hooks += `  const [${formState}Data, set${formState.charAt(0).toUpperCase() + formState.slice(1)}Data] = useState({\n`;
        event.fields.forEach((field, i) => {
          if (field.name) {
            hooks += `    ${field.name}: ''${i < event.fields.length - 1 ? ',' : ''}\n`;
          }
        });
        hooks += `  });\n`;
        hooks += `  const [${formState}Errors, set${formState.charAt(0).toUpperCase() + formState.slice(1)}Errors] = useState({});\n\n`;
        hooks += `  const handle${formState.charAt(0).toUpperCase() + formState.slice(1)}Change = (e) => {\n`;
        hooks += `    const { name, value } = e.target;\n`;
        hooks += `    set${formState.charAt(0).toUpperCase() + formState.slice(1)}Data(prev => ({ ...prev, [name]: value }));\n`;
        hooks += `  };\n\n`;
        hooks += `  const handle${formState.charAt(0).toUpperCase() + formState.slice(1)}Submit = (e) => {\n`;
        hooks += `    e.preventDefault();\n`;
        hooks += `    console.log('Form submitted:', ${formState}Data);\n`;
        hooks += `    // Add your form submission logic here\n`;
        hooks += `  };\n`;
      }
    });
    
    // Generate toggle handlers
    interactivity.events?.forEach(event => {
      if (event.type === 'toggleable') {
        const toggleName = `is${event.element.charAt(0).toUpperCase() + event.element.slice(1)}Visible`;
        hooks += `  const [${toggleName}, set${toggleName.charAt(0).toUpperCase() + toggleName.slice(1)}] = useState(${event.initialState !== 'hidden'});\n`;
      }
    });
    
    return hooks ? hooks + '\n' : '';
  }

  htmlToJsx(html, $, interactivity) {
    let processed = html;
    
    // Convert class to className
    processed = processed.replace(/\sclass="([^"]*)"/g, ' className="$1"');
    processed = processed.replace(/\sclass='([^']*)'/g, " className='$1'");
    
    // Convert for to htmlFor
    processed = processed.replace(/\sfor="([^"]*)"/g, ' htmlFor="$1"');
    
    // Remove comments
    processed = processed.replace(/<!--[\s\S]*?-->/g, '');
    
    // Convert input event handlers for forms
    if (interactivity?.events?.some(e => e.type === 'form')) {
      processed = processed.replace(
        /<input([^>]*)>/g,
        (match, attrs) => `<input${attrs} onChange={handleFormChange}>`
      );
    }
    
    // Convert some common inline events
    if (interactivity?.events) {
      interactivity.events.forEach(event => {
        if (event.originalEvent === 'onclick' && event.type !== 'form' && event.type !== 'toggleable') {
          const handlerName = `handle${event.element.charAt(0).toUpperCase() + event.element.slice(1)}Click`;
          processed = processed.replace(
            new RegExp(`${event.originalEvent}="[^"]*"`, 'g'),
            `onClick={${handlerName}}`
          );
        }
      });
    }
    
    // Clean up and indent
    processed = processed
      .replace(/\n\s*\n/g, '\n')
      .split('\n')
      .filter(line => line.trim())
      .map(line => '      ' + line.trim())
      .join('\n');
    
    return processed;
  }

  addEventHandlers(jsxContent, interactivity) {
    // Add event handler functions as comments for manual implementation
    let handlers = '\n      {/*\n';
    handlers += '       * INTERACTIVITY TODO:\n';
    
    interactivity.events.forEach(event => {
      if (event.originalEvent && event.type !== 'form' && event.type !== 'toggleable') {
        const handlerName = `handle${event.element.charAt(0).toUpperCase() + event.element.slice(1)}${event.reactEvent.replace(/^on/, '')}`;
        handlers += `       * - Implement ${handlerName}: ${event.originalEvent} was "${event.handler.substring(0, 50)}..."\n`;
      }
    });
    
    handlers += '       */}\n';
    
    return handlers + jsxContent;
  }

  generateInteractivityHelper(page) {
    const { interactivity, componentName } = page;
    
    let helper = `/*\n * INTERACTIVITY HELPER for ${componentName}\n * Original handlers detected from ${page.url}\n *\n * Implement these functions in ${componentName}.jsx:\n */\n\n`;
    
    // Add handler stubs
    interactivity.events?.forEach(event => {
      if (event.originalEvent && event.type !== 'form' && event.type !== 'toggleable') {
        const handlerName = `handle${event.element.charAt(0).toUpperCase() + event.element.slice(1)}${event.reactEvent.replace(/^on/, '')}`;
        helper += `// ${event.originalEvent} on <${event.tagName}>\n`;
        helper += `// Original: ${event.handler}\n`;
        helper += `const ${handlerName} = () => {\n`;
        helper += `  // TODO: Convert this handler to React\n`;
        helper += `  console.log('${handlerName} triggered');\n`;
        helper += `};\n\n`;
      }
    });
    
    // Add toggle handler stubs
    interactivity.events?.forEach(event => {
      if (event.type === 'toggleable') {
        const toggleName = `toggle${event.element.charAt(0).toUpperCase() + event.element.slice(1)}`;
        helper += `// Toggle visibility for ${event.selector}\n`;
        helper += `const ${toggleName} = () => {\n`;
        helper += `  setIs${event.element.charAt(0).toUpperCase() + event.element.slice(1)}Visible(prev => !prev);\n`;
        helper += `};\n\n`;
      }
    });
    
    helper += `\n/*\n * SUGGESTED IMPLEMENTATION:\n`;
    helper += ` * 1. Copy needed handlers above into ${componentName}.jsx\n`;
    helper += ` * 2. Add them inside the component function\n`;
    helper += ` * 3. Replace the inline event handlers with the new function names\n`;
    helper += ` * 4. Test each interaction\n`;
    helper += ` */\n`;
    
    return helper;
  }

  generatePageCss(page) {
    let css = `/* ============================================\n`;
    css += ` * STYLES for ${page.componentName}\n`;
    css += ` * Extracted from: ${page.url}\n`;
    css += ` * Layouts detected: ${page.layoutInfo?.map(l => l.type).join(', ') || 'none'}\n`;
    css += ` * ============================================ */\n\n`;
    
    // Add page container
    css += `.page-container {\n`;
    css += `  min-height: 100vh;\n`;
    css += `  width: 100%;\n`;
    css += `}\n\n`;
    
    // Add the merged CSS content
    if (page.styles?.merged) {
      css += page.styles.merged;
      css += '\n\n';
    }
    
    // Add layout-specific helpers
    if (page.layoutInfo?.length > 0) {
      css += `/* ============================================\n`;
      css += ` * LAYOUT HELPERS\n`;
      css += ` * ============================================ */\n`;
      
      page.layoutInfo.forEach(layout => {
        if (layout.type === 'flex') {
          css += `\n/* Flexbox layout detected for ${layout.selector} */\n`;
          css += `${layout.selector} {\n`;
          css += `  /* display: flex; */ /* Already in extracted styles */\n`;
          css += `}\n`;
        } else if (layout.type === 'grid') {
          css += `\n/* Grid layout detected for ${layout.selector} */\n`;
          css += `${layout.selector} {\n`;
          css += `  /* display: grid; */ /* Already in extracted styles */\n`;
          css += `}\n`;
        }
      });
      
      css += '\n';
    }
    
    // Enhanced image placeholder styles
    css += `/* ============================================\n`;
    css += ` * IMAGE PLACEHOLDERS\n`;
    css += ` * ============================================ */\n\n`;
    css += `.image-placeholder {\n`;
    css += `  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n`;
    css += `  border: 2px dashed rgba(255, 255, 255, 0.5);\n`;
    css += `  border-radius: 12px;\n`;
    css += `  min-height: 200px;\n`;
    css += `  display: flex;\n`;
    css += `  align-items: center;\n`;
    css += `  justify-content: center;\n`;
    css += `  margin: 1rem 0;\n`;
    css += `  position: relative;\n`;
    css += `  overflow: hidden;\n`;
    css += `}\n\n`;
    css += `.image-placeholder::before {\n`;
    css += `  content: '';\n`;
    css += `  position: absolute;\n`;
    css += `  inset: 0;\n`;
    css += `  background: repeating-linear-gradient(\n`;
    css += `    45deg,\n`;
    css += `    transparent,\n`;
    css += `    transparent 10px,\n`;
    css += `    rgba(255, 255, 255, 0.05) 10px,\n`;
    css += `    rgba(255, 255, 255, 0.05) 20px\n`;
    css += `  );\n`;
    css += `}\n\n`;
    css += `.placeholder-content {\n`;
    css += `  display: flex;\n`;
    css += `  flex-direction: column;\n`;
    css += `  align-items: center;\n`;
    css += `  gap: 0.75rem;\n`;
    css += `  color: white;\n`;
    css += `  font-size: 0.875rem;\n`;
    css += `  text-align: center;\n`;
    css += `  padding: 1.5rem;\n`;
    css += `  position: relative;\n`;
    css += `  z-index: 1;\n`;
    css += `}\n\n`;
    css += `.placeholder-content svg {\n`;
    css += `  opacity: 0.8;\n`;
    css += `}\n\n`;
    css += `.placeholder-content span {\n`;
    css += `  font-weight: 600;\n`;
    css += `  font-size: 1rem;\n`;
    css += `}\n\n`;
    css += `.path-hint {\n`;
    css += `  background: rgba(0, 0, 0, 0.3);\n`;
    css += `  padding: 0.25rem 0.5rem;\n`;
    css += `  border-radius: 4px;\n`;
    css += `  font-family: monospace;\n`;
    css += `  font-size: 0.75rem;\n`;
    css += `}\n\n`;
    css += `.placeholder-content small {\n`;
    css += `  opacity: 0.8;\n`;
    css += `}\n`;
    
    return css;
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

  async generateSEOExport() {
    const seoExport = {
      exportedAt: new Date().toISOString(),
      source: this.baseUrl.href,
      pages: []
    };
    
    for (const [route, page] of this.pages) {
      seoExport.pages.push({
        route,
        title: page.title,
        seoData: page.seoData,
        structuredData: page.structuredData,
        imageData: page.imageData,
        bgImages: page.bgImages
      });
    }
    
    await fs.writeJson(
      path.join(this.outputDir, 'seo-data.json'),
      seoExport,
      { spaces: 2 }
    );
  }

  async generateSimpleReadme() {
    const readme = `# ${this.domainName}

Generated from: ${this.baseUrl.href}

## 🚀 Quick Start

\`\`\`bash
npm install
npm run dev
\`\`\`

Then open http://localhost:5173

## 📁 Key Files

- \`seo-data.json\` - All SEO, image paths, and structured data
- \`src/pages/*.interactivity.js\` - Event handler helpers (if detected)
- \`src/pages/*.css\` - Page-specific styles with extracted CSS

## 🖼️ Images

1. Check \`seo-data.json\` for all image paths and srcset variants
2. Copy images to \`public/\` at the exact paths shown
3. For background images, update CSS custom properties in component CSS

## 📖 Full Documentation

See the web-to-react-cli repository README for complete documentation:
https://github.com/LostLegacy123/web-to-react-cli

---

*Generated by web-to-react-cli* 🚀
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
