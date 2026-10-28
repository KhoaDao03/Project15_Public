// Shared by the existing page pair and their one-contract counterparts.
const normalizedView = document.body.dataset.resultsMode === 'normalized';
function resultsURL(path) {
  if (!normalizedView) return path;
  const url = new URL(path, location.origin);
  url.searchParams.set('normalized', 'true');
  return url.pathname + url.search;
}
for (const link of document.querySelectorAll('.public-nav a')) {
  link.removeAttribute('aria-current');
  if (link.getAttribute('href') === location.pathname) link.setAttribute('aria-current', 'page');
}
if (normalizedView) {
  document.querySelector('.brand').href = '/normalized';
  const source = document.getElementById('data-source');
  if (source) {
    source.querySelector('[value="example"]').remove();
    source.querySelector('[value="recorded"]').textContent = '1-contract normalized';
    document.getElementById('edit-example').hidden = true;
  }
}
