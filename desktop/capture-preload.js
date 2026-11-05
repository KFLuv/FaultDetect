const { ipcRenderer } = require('electron')

function cleanLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80)
}

function interactiveElement(target) {
  if (!(target instanceof Element)) return null
  return target.closest('button, a, [role="button"], input[type="submit"], input[type="button"]')
}

function labelFor(element) {
  if (!element) return ''
  if (element instanceof HTMLInputElement) {
    return cleanLabel(element.getAttribute('aria-label') || element.value || element.title)
  }
  return cleanLabel(
    element.getAttribute('aria-label')
    || element.getAttribute('title')
    || element.innerText
    || element.textContent
  )
}

function reportAction(target, source) {
  const element = interactiveElement(target)
  const label = labelFor(element)
  if (!label) return
  ipcRenderer.send('capture:ui-action', {
    label,
    source,
    occurredAt: Date.now()
  })
}

window.addEventListener('click', event => reportAction(event.target, 'click'), true)
window.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') reportAction(event.target, 'keyboard')
}, true)
