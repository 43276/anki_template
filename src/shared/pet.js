function setupPet(context, config, obstacleSelector) {
  if (!config.enabled) return
  const files = config.pets.filter(pet => pet.enabled).flatMap(pet => pet.files)
  if (!files.length) return
  let pet = null
  let cancelMove = null
  context.onCleanup(() => {
    if (cancelMove) cancelMove()
    if (pet) pet.remove()
  })

  function create() {
    pet = document.createElement('div')
    pet.className = 'pet'
    const img = document.createElement('img')
    img.src = files[Math.floor(Math.random() * files.length)]
    img.alt = ''
    img.draggable = false
    pet.appendChild(img)
    document.body.appendChild(pet)
    return parseFloat(getComputedStyle(pet).getPropertyValue('--pet-size')) || 130
  }
  function position(x, y, flip) {
    return `translate(${x}px, ${y}px)${flip === -1 ? ' scaleX(-1)' : ''}`
  }
  function move(x, y, easing, flip) {
    const from = getComputedStyle(pet).transform
    if (cancelMove) cancelMove()
    const to = position(x, y, flip)
    const key = `petMove${Date.now()}${Math.floor(Math.random() * 9999)}`
    const style = document.createElement('style')
    style.textContent = `@keyframes ${key} { from { transform: ${from}; } to { transform: ${to}; } }`
    document.head.appendChild(style)
    const element = pet
    const finish = () => {
      element.style.transform = to
      element.style.animation = ''
      element.removeEventListener('animationend', finish)
      style.remove()
      cancelMove = null
    }
    cancelMove = () => {
      element.removeEventListener('animationend', finish)
      element.style.animation = ''
      style.remove()
    }
    element.addEventListener('animationend', finish, { once: true })
    // CSS keyframes retain the original workaround for off-screen Android pets.
    element.style.animation = `${key} ${config.duration}s ${easing} forwards`
  }
  function edge(size, side = Math.floor(Math.random() * 4)) {
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (side === 0) return { x: Math.random() * vw, y: -size, side }
    if (side === 1) return { x: vw + size, y: Math.random() * vh, side }
    if (side === 2) return { x: Math.random() * vw, y: vh + size, side }
    return { x: -size, y: Math.random() * vh, side }
  }
  function blankSpot(size) {
    const pad = 8
    const maxX = Math.max(pad, window.innerWidth - size - pad)
    const maxY = Math.max(pad, window.innerHeight - size - pad)
    const rects = [...document.querySelectorAll(obstacleSelector)]
      .filter(el => el.getClientRects().length)
      .map(el => el.getBoundingClientRect())
    if (pet) rects.push(pet.getBoundingClientRect())
    for (let i = 0; i < 40; i++) {
      const x = pad + Math.random() * (maxX - pad)
      const y = pad + Math.random() * (maxY - pad)
      if (!rects.some(r => r.right > x && r.left < x + size && r.bottom > y && r.top < y + size)) return { x, y }
    }
    return { x: maxX, y: maxY }
  }
  function appear(settle) {
    if (pet) return
    const size = create()
    const start = edge(size)
    const end = settle ? blankSpot(size) : edge(size, (start.side + 2) % 4)
    const flip = end.x < start.x ? -1 : 1
    pet.style.transform = position(start.x, start.y, flip)
    move(end.x, end.y, settle ? 'cubic-bezier(0.22, 1, 0.36, 1)' : 'linear', flip)
    if (settle) {
      context.listen(pet, 'mousedown', e => e.preventDefault())
      context.listen(pet, 'click', e => {
        e.preventDefault()
        const next = blankSpot(size)
        move(next.x, next.y, 'cubic-bezier(0.22, 1, 0.36, 1)', next.x < pet.getBoundingClientRect().left ? -1 : 1)
      })
    } else {
      context.timeout(() => {
        if (cancelMove) cancelMove()
        cancelMove = null
        pet.remove()
        pet = null
      }, (config.duration + 0.1) * 1000)
    }
  }
  if (context.isBack && Math.random() < config.flyChance) appear(false)
  context.timeout(() => appear(true), config.idleMs)
}
