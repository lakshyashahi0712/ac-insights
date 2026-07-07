// utils/draggable.js

function makeDraggable(panel, handleSelector) {
  const handle = handleSelector 
    ? panel.querySelector(handleSelector) 
    : panel;

  if (!handle) return;

  handle.style.cursor = 'grab';

  let isDragging = false;
  let startX, startY, initLeft, initTop;

  handle.addEventListener('mousedown', (e) => {
    // Buttons pe click karo toh drag mat shuru karo
    if (e.target.tagName === 'BUTTON') return;

    isDragging = true;
    handle.style.cursor = 'grabbing';

    const rect = panel.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    initLeft = rect.left;
    initTop = rect.top;

    // Position fixed set karo agar nahi hai
    panel.style.position = 'fixed';
    panel.style.margin = '0';
    panel.style.left = `${initLeft}px`;
    panel.style.top = `${initTop}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';

    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let newLeft = initLeft + dx;
    let newTop = initTop + dy;

    // Screen ke bahar mat jaane do
    const panelW = panel.offsetWidth;
    const panelH = panel.offsetHeight;
    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - panelW));
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - panelH));

    panel.style.left = `${newLeft}px`;
    panel.style.top = `${newTop}px`;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      handle.style.cursor = 'grab';
    }
  });
}