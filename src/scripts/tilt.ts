// Pointer tilt for [data-tilt] cards, after Swiftify's MediaCard tilt.
// The pointer writes two custom properties; CSS owns the motion with the sampled
// Qt pointerTilt spring (spring 4, damping .3). Fine pointers only, never under
// reduced motion, and nothing runs while the pointer is elsewhere.
const fine = matchMedia('(hover: hover) and (pointer: fine)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

export function bindTilt(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-tilt]').forEach((card) => {
    let frame = 0;
    let x = 0;
    let y = 0;
    const write = () => {
      frame = 0;
      card.style.setProperty('--tilt-x', x.toFixed(3));
      card.style.setProperty('--tilt-y', y.toFixed(3));
    };
    card.addEventListener('pointermove', (event) => {
      if (!fine.matches || reduced.matches || event.pointerType !== 'mouse') return;
      const rect = card.getBoundingClientRect();
      x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      if (!frame) frame = requestAnimationFrame(write);
    });
    card.addEventListener('pointerleave', () => {
      if (frame) cancelAnimationFrame(frame);
      x = 0;
      y = 0;
      write();
    });
  });
}
