// Shared by the existing page pair and their one-contract counterparts.
const normalizedView = document.body.dataset.resultsMode === 'normalized';
function resultsURL(path) {
  if (!normalizedView) return path;
  const url = new URL(path, location.origin);
  url.searchParams.set('normalized', 'true');
  return url.pathname + url.search;
}
for (const link of document.querySelectorAll('.public-nav a')) {
  if (!normalizedView) {
    link.setAttribute('href', link.getAttribute('href') === '/' ? '/real' : '/real/performance');
    link.textContent = link.textContent.replace('Paper Trading', 'Real');
  }
  link.removeAttribute('aria-current');
  if (link.getAttribute('href') === (location.pathname === '/normalized' ? '/' : location.pathname === '/normalized/performance' ? '/performance' : location.pathname)) link.setAttribute('aria-current', 'page');
}
document.querySelector('.brand').href = normalizedView ? '/' : '/real';
if (normalizedView) {
  const source = document.getElementById('data-source');
  if (source) {
    source.querySelector('[value="example"]').remove();
    source.querySelector('[value="recorded"]').textContent = 'Paper Trading with 1 contract';
    document.getElementById('edit-example').hidden = true;
  }
}
