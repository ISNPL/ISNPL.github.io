/* ISNP Lab — homepage Projects horizontal carousel.
   Markup from build.js: <div class="proj-carousel"><div class="project-row">…cards…</div></div>
   This script adds ‹ › arrow buttons and end/overflow state. No-JS: the row is still
   swipeable/scrollable (native overflow-x), just without arrow buttons. Fully responsive. */
(function () {
  function setup(c) {
    var row = c.querySelector('.project-row');
    if (!row || c.dataset.carousel) return;
    c.dataset.carousel = '1';

    var prev = document.createElement('button');
    prev.type = 'button'; prev.className = 'proj-arrow proj-prev'; prev.setAttribute('aria-label', 'Previous'); prev.innerHTML = '&#8249;';
    var next = document.createElement('button');
    next.type = 'button'; next.className = 'proj-arrow proj-next'; next.setAttribute('aria-label', 'Next'); next.innerHTML = '&#8250;';
    c.appendChild(prev); c.appendChild(next);

    function step() {
      var card = row.querySelector('.project-card');
      return card ? card.getBoundingClientRect().width + 16 : row.clientWidth * 0.8;
    }
    prev.addEventListener('click', function () { row.scrollBy({ left: -step(), behavior: 'smooth' }); });
    next.addEventListener('click', function () { row.scrollBy({ left: step(), behavior: 'smooth' }); });

    function update() {
      var overflow = row.scrollWidth - row.clientWidth > 4;
      c.classList.toggle('no-scroll', !overflow);
      prev.disabled = row.scrollLeft <= 2;
      next.disabled = row.scrollLeft >= row.scrollWidth - row.clientWidth - 2;
    }
    row.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }
  function init() { document.querySelectorAll('.proj-carousel').forEach(setup); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
