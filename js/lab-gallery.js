/* ISNP Lab gallery — dependency-free lightbox with per-box albums (multiple images).
   Data: window.LAB_GALLERY = [{ images:[src,...], caption, date }] (embedded by build.js).
   Click a .gal-item -> opens that box's album; ‹ › / arrow keys cycle within the album; Esc/✕ close. */
(function () {
  var G = window.LAB_GALLERY || [];
  var album = [], ai = 0, cap = '', box;

  function ensure() {
    if (box) return box;
    box = document.createElement('div');
    box.className = 'gal-lb'; box.hidden = true;
    box.innerHTML =
      '<div class="gal-lb-bg" data-close></div>' +
      '<button type="button" class="gal-lb-x" data-close aria-label="Close">&times;</button>' +
      '<button type="button" class="gal-lb-prev" data-prev aria-label="Previous">&#8249;</button>' +
      '<img class="gal-lb-img" alt="">' +
      '<button type="button" class="gal-lb-next" data-next aria-label="Next">&#8250;</button>' +
      '<div class="gal-lb-meta"><span class="gal-lb-count"></span><span class="gal-lb-cap"></span></div>';
    document.body.appendChild(box);
    box.addEventListener('click', function (e) {
      if (e.target.hasAttribute('data-close')) close();
      else if (e.target.hasAttribute('data-prev')) step(-1);
      else if (e.target.hasAttribute('data-next')) step(1);
    });
    return box;
  }
  function render() {
    var b = ensure(), multi = album.length > 1;
    b.querySelector('.gal-lb-img').src = album[ai] || '';
    b.querySelector('.gal-lb-img').alt = cap || '';
    b.querySelector('.gal-lb-count').textContent = multi ? (ai + 1) + ' / ' + album.length : '';
    b.querySelector('.gal-lb-cap').textContent = cap || '';
    b.querySelector('.gal-lb-prev').style.display = multi ? '' : 'none';
    b.querySelector('.gal-lb-next').style.display = multi ? '' : 'none';
  }
  function open(boxIndex) {
    var g = G[boxIndex]; if (!g) return;
    album = (g.images || []).filter(Boolean); if (!album.length) return;
    ai = 0; cap = (g.caption || '') + (g.date ? '  ·  ' + g.date : '');
    var b = ensure(); render(); b.hidden = false; document.body.classList.add('gal-lb-open');
  }
  function step(d) { if (album.length) { ai = (ai + d + album.length) % album.length; render(); } }
  function close() { if (box) { box.hidden = true; document.body.classList.remove('gal-lb-open'); } }

  document.addEventListener('click', function (e) {
    var f = e.target.closest && e.target.closest('.gal-item[data-gi]');
    if (f) open(+f.getAttribute('data-gi'));
  });
  document.addEventListener('keydown', function (e) {
    if (!box || box.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });
})();
