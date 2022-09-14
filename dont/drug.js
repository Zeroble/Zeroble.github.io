const canvas = document.getElementById('canvas')
const context = canvas.getContext('2d')

const downKeys = {}

function GameObject(src, width, height) {
    this.x = 0
    this.y = 0
    this.image = new Image()
    this.image.src = src
    this.width = width
    this.height = height
    this.alpha = 1
}

const player = new GameObject('kirby.png', 50, 50)
const obstacle = new GameObject('kirby.png', 40, 40)
const objectArray = []

objectArray.push(player)
objectArray.push(obstacle)

obstacle.x = Math.random() * 700
obstacle.y = Math.random() * 700

window.addEventListener('keydown', onKeyDown)
window.addEventListener('keyup', onKeyUp)

function onKeyDown(event) {
    downKeys[event.code] = true
}
function onKeyUp(event) {
    downKeys[event.code] = false
}

window.requestAnimationFrame(run)

function run() {
    color = parseInt(Math.random() * 999999)
    if (color < 10) color += '00000'
    else if (color < 100) color += '0000'
    else if (color < 1000) color += '000'
    else if (color < 10000) color += '00'
    else if (color < 100000) color += '0'

    //context.fillStyle = "#"+color//화면 비우기
    document.body.style.backgroundColor = '#' + color
    console.log(color)
    //context.fillRect(0,0,canvas.width,canvas.height)

    for (let obj of objectArray) {
        for (let otherObj of objectArray) {
            if (obj === otherObj) continue
            if (checkCollision(obj, otherObj)) obj.alpha = otherObj.alpha = 0.5
        }
        context.globalAlpha = obj.alpha
        context.drawImage(
            obj.image,
            0,
            0,
            747,
            795,
            obj.x,
            obj.y,
            obj.width,
            obj.height
        )
    }
    if (downKeys['ArrowLeft']) if (player.x > 0) player.x -= 10
    if (downKeys['ArrowRight'])
        if (player.x < canvas.width - player.width) player.x += 10
    if (downKeys['ArrowUp'] && player.y > 0) player.y -= 10
    if (downKeys['ArrowDown'] && player.y < canvas.height - player.height)
        player.y += 10

    window.requestAnimationFrame(run)
}

function checkCollision(obj, otherObj) {
    if (
        obj.y < otherObj.y &&
        obj.y + obj.height > otherObj.y &&
        obj.x < otherObj.x &&
        obj.x + obj.width > otherObj.x
    )
        return true
    return false
}
