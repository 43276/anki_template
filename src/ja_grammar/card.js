document.querySelectorAll('.grammar-card [lang="ja"]').forEach(stripSpaces)
if (context.isBack) {
  const front = document.getElementById('FrontSide')
  if (front) front.hidden = true
}
setupPet(context, petConfig, '.grammar-card .word, .grammar-card .content, .grammar-card .footer, .grammar-card .right-side')
