// utils/draggable.js

function makeDraggable(panel, handleSelector) {
  const handle = handleSelector 
    ? panel.querySelector(handleSelector) 
    : panel;

  if (!handle) return;

  handle.style.cursor = 'grab';

  let isDragging = false;
  let startX, startY, initLeft, initTop;

  function onMouseDown(e) {
    if (e.target.tagName === 'BUTTON') return;

    isDragging = true;
    handle.style.cursor = 'grabbing';

    const rect = panel.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    initLeft = rect.left;
    initTop = rect.top;

    panel.style.position = 'fixed';
    panel.style.margin = '0';
    panel.style.left = `${initLeft}px`;
    panel.style.top = `${initTop}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';

    e.preventDefault();
  }

  function onMouseMove(e) {
    if (!isDragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let newLeft = initLeft + dx;
    let newTop = initTop + dy;

    const panelW = panel.offsetWidth;
    const panelH = panel.offsetHeight;
    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - panelW));
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - panelH));

    panel.style.left = `${newLeft}px`;
    panel.style.top = `${newTop}px`;
  }

  function onMouseUp() {
    if (isDragging) {
      isDragging = false;
      handle.style.cursor = 'grab';
    }
  }

  handle.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);

  // Auto-cleanup: when the panel is removed from the DOM, remove its
  // document-level listeners too, so they don't accumulate over a long session.
  const cleanupObserver = new MutationObserver(() => {
    if (!document.body.contains(panel)) {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      cleanupObserver.disconnect();
    }
  });
  cleanupObserver.observe(document.body, { childList: true, subtree: true });
}