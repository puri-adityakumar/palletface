(() => {
  'use strict'

  const failureMessage = 'The interactive playground could not start. Its script may be blocked, unavailable, or have failed while loading. The controls stay unavailable; the rest of this page and its documentation remain readable after a reload with scripts working.'

  function showFailure() {
    if (document.documentElement.dataset.appReady === 'true') return
    const status = document.getElementById('status')
    if (!status || status.dataset.state === 'failed') return
    status.dataset.state = 'failed'
    status.textContent = failureMessage
  }

  // Capture resource load errors (including the module script) without
  // inline handlers, then react to runtime boot errors. No timers are used,
  // so a slow network never turns into a false failure.
  window.addEventListener('error', (event) => {
    const target = event.target
    if (target && target.tagName === 'SCRIPT') {
      showFailure()
      return
    }
    showFailure()
  }, true)
  window.addEventListener('unhandledrejection', showFailure)
})()
