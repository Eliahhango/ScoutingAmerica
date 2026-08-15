import { useState, useEffect } from 'react'

const SITE_BASE = './site/www.scouting.org'

function sourceForPath(pathname) {
  const clean = pathname.replace(/\/+$/, '') || '/'
  
  // Root
  if (clean === '/') return `${SITE_BASE}/index.html`
  
  // Try exact match as directory index
  const dirTry = `${SITE_BASE}${clean}/index.html`
  
  // Try as .html file  
  const htmlTry = `${SITE_BASE}${clean}.html`
  
  // Try as directory
  const cleanDir = `${SITE_BASE}${clean}`
  
  return dirTry
}

function normalizeRoute(value) {
  if (!value || value.startsWith('#') || value.startsWith('mailto:') || value.startsWith('tel:') || value.startsWith('javascript:')) return value
  
  let target
  try { target = new URL(value, window.location.href) } catch { return value }
  
  // Only handle scouting.org internal
  if (target.hostname !== window.location.hostname && !/scouting\.org$/i.test(target.hostname)) return value
  
  let path = target.pathname
  
  // Strip /site/www.scouting.org prefix if present (from mirrored links)
  path = path.replace(/^\/site\/www\.scouting\.org/i, '/')
  
  // Normalize trailing slash
  if (!path.endsWith('/') && !path.split('/').pop().includes('.')) {
    path += '/'
  }
  
  return path + target.search
}

function setTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (m) document.title = m[1].trim()
}

export default function App() {
  const [pathname, setPathname] = useState(window.location.pathname)
  const [pendingHtml, setPendingHtml] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    
    async function loadPage() {
      setLoading(true)
      setError(false)
      setPendingHtml(null)
      
      const url = sourceForPath(pathname)
      
      try {
        const resp = await fetch(url)
        if (!resp.ok) throw new Error(`${resp.status}`)
        let markup = await resp.text()
        
        if (cancelled) return
        
        // Trim after first </html>
        const closingHtml = markup.search(/<\/html>/i)
        if (closingHtml !== -1) markup = markup.slice(0, closingHtml + 7)
        
        const document = new DOMParser().parseFromString(markup, 'text/html')
        setTitle(document.title || 'Scouting America')
        
        // Remove scripts
        document.querySelectorAll('script').forEach((node) => node.remove())
        
        // Normalize internal links
        document.body.querySelectorAll('a[href]').forEach((node) => {
          const original = node.getAttribute('href')
          const normalized = normalizeRoute(original)
          if (normalized !== original) node.setAttribute('href', normalized)
        })
        
        // Rewrite asset paths to absolute
        document.body.querySelectorAll('img[src],source[src],video[src],audio[src],iframe[src]').forEach((node) => {
          const attr = node.hasAttribute('src') ? 'src' : node.hasAttribute('data-src') ? 'data-src' : null
          if (!attr) return
          const val = node.getAttribute(attr)
          if (!val || val.startsWith('data:') || val.startsWith('http') || val.startsWith('//')) return
          // Resolve relative to site root
          if (val.startsWith('/')) {
            node.setAttribute(attr, `${SITE_BASE}${val}`)
          } else {
            // relative to current page dir
            node.setAttribute(attr, `${SITE_BASE}/${val}`)
          }
        })
        
        // Rewrite CSS links
        document.querySelectorAll('link[rel="stylesheet"]').forEach((node) => {
          const href = node.getAttribute('href')
          if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('data:')) return
          if (href.startsWith('/')) {
            node.setAttribute('href', `${SITE_BASE}${href}`)
          } else {
            node.setAttribute('href', `${SITE_BASE}/${href}`)
          }
        })
        
        // Also handle inline style url() references - rewrite style tags
        document.querySelectorAll('style').forEach((node) => {
          let css = node.textContent
          css = css.replace(/url\(["']?\/(?!\/)([^"')]+)["']?\)/g, `url(${SITE_BASE}/$1)`)
          node.textContent = css
        })
        
        // Get head content to inject styles
        const headHtml = document.head.innerHTML
        
        setPendingHtml({ head: headHtml, body: document.body.innerHTML })
      } catch (e) {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    
    loadPage()
    return () => { cancelled = true }
  }, [pathname])

  // Intercept link clicks
  useEffect(() => {
    function handleClick(e) {
      const a = e.target.closest('a')
      if (!a) return
      const href = a.getAttribute('href')
      if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#') || href.startsWith('javascript:')) return
      
      e.preventDefault()
      const target = normalizeRoute(href)
      if (target === pathname) return
      history.pushState({}, '', target)
      setPathname(target)
      window.scrollTo(0, 0)
    }
    
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [pathname])

  // Handle back/forward
  useEffect(() => {
    function handlePop() {
      setPathname(window.location.pathname)
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [])

  if (loading) {
    return <div className="loading-screen">Loading...</div>
  }

  if (error) {
    return (
      <div className="error-page">
        <h2>Page not found</h2>
        <p>The page you're looking for doesn't exist in our mirror.</p>
        <a href="/" onClick={(e) => { e.preventDefault(); history.pushState({}, '', '/'); setPathname('/') }}>Go Home</a>
      </div>
    )
  }

  return (
    <>
      {pendingHtml?.head && (
        <div 
          className="preload-style"
          dangerouslySetInnerHTML={{ __html: pendingHtml.head }}
        />
      )}
      <div 
        className="mirrored-page"
        dangerouslySetInnerHTML={{ __html: pendingHtml?.body || '' }}
      />
    </>
  )
}
