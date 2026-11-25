const root = document.documentElement
const themeButton = document.querySelector<HTMLButtonElement>('#docs-theme')

if (themeButton) {
  themeButton.setAttribute('aria-pressed', String(root.dataset.theme === 'dark'))
  themeButton.hidden = false
  themeButton.addEventListener('click', () => {
    const theme = root.dataset.theme === 'dark' ? 'light' : 'dark'
    root.dataset.theme = theme
    themeButton.setAttribute('aria-pressed', String(theme === 'dark'))
    try {
      localStorage.setItem('palletface.docs.theme', theme)
    } catch {
      // Theme switching still works for this page.
    }
  })
}

if (document.querySelector('.docs-overview') && location.hash) {
  const legacySections = new Map([
    ['#stability', '/docs/api-reference/#stability'],
    ['#browser-with-a-bundler', '/docs/integrations/#browser-with-a-bundler'],
    ['#browser-without-a-bundler', '/docs/integrations/#browser-without-a-bundler'],
    ['#server-response', '/docs/integrations/#server-response'],
  ])
  const overviewLinks = document.querySelectorAll<HTMLAnchorElement>('.docs-overview a')
  const page = [...overviewLinks].find((link) => `#${link.id}` === location.hash)
  const destination = page?.href ?? legacySections.get(location.hash)
  if (destination) location.replace(destination)
}

const sections = [...document.querySelectorAll<HTMLAnchorElement>('.docs-outline a')].flatMap((link) => {
  const heading = document.getElementById(link.hash.slice(1))
  return heading ? [{ link, heading }] : []
}).reverse()
let activeLink: HTMLAnchorElement | undefined

function markActive(link: HTMLAnchorElement | undefined) {
  if (activeLink === link) return
  activeLink?.removeAttribute('aria-current')
  activeLink = link
  activeLink?.setAttribute('aria-current', 'location')
}

function updateSection() {
  const readingLine = Number.parseFloat(getComputedStyle(root).scrollPaddingTop) + 24
  const atBottom = window.scrollY > 0 && window.scrollY + window.innerHeight >= root.scrollHeight - 1
  const section = atBottom
    ? sections[0]
    : sections.find(({ heading }) => heading.getBoundingClientRect().top <= readingLine) ?? sections.at(-1)
  markActive(section?.link)
}

function updateFromHash() {
  const target = sections.find(({ link }) => link.hash === location.hash)
  if (target) markActive(target.link)
  else updateSection()
}

if (sections.length) {
  window.addEventListener('scroll', updateSection, { passive: true })
  window.addEventListener('resize', updateSection)
  window.addEventListener('hashchange', updateFromHash)
  updateFromHash()
}
