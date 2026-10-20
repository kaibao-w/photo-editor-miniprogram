const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function bounds(view, width, height, ratio) {
  const bx = Math.max(0, (width * view.zoom - width) / 2);
  const by = Math.max(0, (width * ratio * view.zoom - height) / 2);
  return { zoom: view.zoom, x: clamp(view.x, -bx, bx), y: clamp(view.y, -by, by) };
}
function zoomAt(view, zoom, x, y) {
  zoom = clamp(zoom, .1, 8); const r = zoom / view.zoom;
  return { zoom, x: x - (x - view.x) * r, y: y - (y - view.y) * r };
}
function exportSize(width, height, original) {
  const scale = Math.min(1, (original ? 4096 : 2048) / Math.max(width, height), Math.sqrt(12000000 / (width * height)));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), reduced: scale < 1 };
}
module.exports = { bounds, zoomAt, exportSize };
