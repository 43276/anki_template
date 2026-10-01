// Each generated script is enclosed in an IIFE; Anki may reuse the same WebView.
function createContext() {
  const back = document.getElementById('BackSide')
  const root = back || document.getElementById('FrontSide')
  if (!root) return null
  const previous = window.__ankiTemplateContext
  if (previous && previous.root === root) return null
  if (previous) previous.dispose()

  const disposers = new Set()
  let disposed = false
  const context = {
    root,
    isBack: !!back,
    get active() { return !disposed && root.isConnected },
    onCleanup(fn) { disposers.add(fn); return fn },
    timeout(fn, delay) {
      const cleanup = () => clearTimeout(id)
      const id = setTimeout(() => {
        disposers.delete(cleanup)
        if (context.active) fn()
      }, delay)
      disposers.add(cleanup)
      return id
    },
    listen(target, event, fn, options) {
      target.addEventListener(event, fn, options)
      disposers.add(() => target.removeEventListener(event, fn, options))
    },
    dispose() {
      if (disposed) return
      disposed = true
      disposers.forEach(fn => fn())
      disposers.clear()
      if (window.__ankiTemplateContext === context) delete window.__ankiTemplateContext
    },
  }
  const observer = new MutationObserver(() => {
    if (!root.isConnected) context.dispose()
  })
  observer.observe(document.body, { childList: true, subtree: true })
  context.onCleanup(() => observer.disconnect())
  window.__ankiTemplateContext = context
  return context
}

// Edit text nodes only: keep ruby structure, audio nodes and their listeners.
function stripSpaces(element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) walker.currentNode.nodeValue = walker.currentNode.nodeValue.replace(/\s+/g, '')
}
