const canvas = document.getElementById('canvas')
const context = canvas.getContext('2d')
let score = 0
var map = new Image();
map.src= 'map.jpg'
setInterval(function() { //1초마다 실행
    const newObstacle = new GameObject('enermy.png', 70, 40)
    objectArray.push(newObstacle)
    newObstacle.isObstacle = true

    newObstacle.dir = parseInt(Math.random()*4)
    console.log(newObstacle.dir)
    switch(newObstacle.dir){
        case 0:
        newObstacle.x = Math.random()*(canvas.height-newObstacle.height)
        newObstacle.y = -newObstacle.height
        break
        case 1:
        newObstacle.x = -newObstacle.width
        newObstacle.y = Math.random()*(canvas.height-newObstacle.height)
        break;

        case 2:
        newObstacle.x = canvas.width
        newObstacle.y = Math.random()*(canvas.height-newObstacle.height)
        break;

        case 3:
        newObstacle.x = Math.random()*(canvas.height-newObstacle.height)
        newObstacle.y = canvas.height
        break
    }
    score++
}, 300)
const downKeys = {}

function GameObject(src, width, height) {
    this.x = 400
    this.y = 400
    this.image = new Image()
    this.image.src = src
    this.width = width
    this.height = height
    this.alpha = 1;
    this.isObstacle = false
    this.dir
}

const player = new GameObject('kirby.png', 30, 30)
const objectArray = []

objectArray.push(player)

window.addEventListener("keydown", onKeyDown)
window.addEventListener("keyup", onKeyUp)

function onKeyDown(event) {
    downKeys[event.code] = true;
}

function onKeyUp(event) {
    downKeys[event.code] = false;
}

window.requestAnimationFrame(run);

let gameOver = false
let colorChange = 0
let color
function run() {
    if (gameOver) return
    // if (colorChange >= 50) {
    //     color = parseInt(Math.random() * 999999)
    //     if (color < 10) color += "00000"
    //     else if (color < 100) color += "0000"
    //     else if (color < 1000) color += "000"
    //     else if (color < 10000) color += "00"
    //     else if (color < 100000) color += "0"
    //     colorChange = 0
    // }
    // colorChange++;
    // context.fillStyle = "#" + color //화면 비우기
    // context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(map, 0,0, 700,700)
    context.textBaseline = "top"
    context.strokeStyle="black"
    context.textSize = "600px"
    context.fillText("SCORE : "+score,10,10)
    for (let obj of objectArray) {
        context.globalAlpha = obj.alpha
        context.drawImage(obj.image, obj.x, obj.y, obj.width, obj.height)
        if (obj === player) 
            continue
        if (obj.isObstacle) {
            switch(obj.dir){
            case 0:
            obj.y += parseInt(score/3)
            break;
            case 1:
            obj.x += parseInt(score/3)
            break;
            case 2:
            obj.x -= parseInt(score/3)
            break;
            case 3:
            obj.y -= parseInt(score/3)
            break;
            }

        }
        if (checkCollision(obj)) {
            gameOver = true
            obj.alpha = player.alpha = 0.5
        }

    }
    if (downKeys['ArrowLeft'])
        if (player.x > 0)
            player.x -= 10
    if (downKeys['ArrowRight'])
        if (player.x < canvas.width - player.width)
            player.x += 10
    if (downKeys['ArrowUp'] && player.y > 0)
        player.y -= 10
    if (downKeys['ArrowDown'] && player.y < canvas.height - player.height)
        player.y += 10

    window.requestAnimationFrame(run)
}

function checkCollision(obj) {
    //if(obj.y<player.y&&obj.y+obj.height>player.y&&obj.x<player.x&&obj.x+obj.width>player.x)
    if (player.x < obj.x + obj.width && player.x + player.width > obj.x && player.y < obj.y + obj.height && player.y + player.height > obj.y)
        return true
    return false
}
