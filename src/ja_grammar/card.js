document.querySelectorAll('.grammar-card [lang="ja"]').forEach(stripSpaces)
if (context.isBack) {
  const front = document.getElementById('FrontSide')
  if (front) front.hidden = true
}
