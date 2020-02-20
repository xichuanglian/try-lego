const path = require('path');
const express = require('express')

const PoweredUP = require("node-poweredup");
const poweredUP = new PoweredUP.PoweredUP();

class Gamepad {
    constructor(id, buttonNum, triggerNum, stickNum) {
        this.id = id

        this.buttons = []
        for (var i = 0; i < buttonNum; ++i) {
            this.buttons.push({
                pressed: false,
            })
        }

        this.triggers = []
        for (var i = 0; i < triggerNum; ++i) {
            this.triggers.push({
                pressed: false,
                value: 0,
            })
        }

        this.sticks = []
        for (var i = 0; i < stickNum; ++i) {
            this.sticks.push({
                x: 0,
                y: 0,
            })
        }
    }

    buttonDown(buttonId) {
        this.buttons[buttonId].pressed = true
        var handlers = this._buttonDownHandlers[buttonId]
        if (handlers) {
            handlers.forEach((f) => {
                f(this.buttons[buttonId])
            })
        }
    }

    buttonUp(buttonId) {
        this.buttons[buttonId].pressed = false
        var handlers = this._buttonUpHandlers[buttonId]
        if (handlers) {
            handlers.forEach((f) => {
                f(this.buttons[buttonId])
            })
        }
    }

    pressTrigger(triggerId, value) {
        if (value > 0) {
            this.triggers[triggerId].pressed = true 
            this.triggers[triggerId].value = value
        } else {
            this.triggers[triggerId].pressed = false
            this.triggers[triggerId].value = 0
        }
        var handlers = this._pressTriggerHandlers[triggerId]
        if (handlers) {
            handlers.forEach((f) => {
                f(this.triggers[triggerId])
            })
        }
    }

    moveStick(stickId, x, y) {
        this.sticks[stickId].x = x
        this.sticks[stickId].y = y
        var handlers = this._stickMoveHandlers[stickId]
        if (handlers) {
            handlers.forEach((f) => {
                f(this.sticks[stickId])
            })
        }
    }

    _buttonDownHandlers = {}
    _buttonUpHandlers = {}
    _pressTriggerHandlers = {}
    _stickMoveHandlers = {}

    onButtonDown(id, func) {
        var handlers = this._buttonDownHandlers[id]
        if (!handlers) {
            handlers = []
            this._buttonDownHandlers[id] = handlers
        }
        handlers.push(func)
    }

    onButtonUp(id, func) {
        var handlers = this._buttonUpHandlers[id]
        if (!handlers) {
            handlers = []
            this._buttonUpHandlers[id] = handlers
        }
        handlers.push(func)
    }

    onPressTrigger(id, func) {
        var handlers = this._pressTriggerHandlers[id]
        if (!handlers) {
            handlers = []
            this._pressTriggerHandlers[id] = handlers
        }
        handlers.push(func)
    }

    onStickMove(id, func) {
        var handlers = this._stickMoveHandlers[id]
        if (!handlers) {
            handlers = []
            this._stickMoveHandlers[id] = handlers
        }
        handlers.push(func)
    }
}

var gamepad = null

poweredUP.on("discover", async (hub) => { // Wait to discover a Hub
    console.log(`Discovered ${hub.name}!`)
    await hub.connect() // Connect to the Hub
    const motorA = await hub.waitForDeviceAtPort("A") // Make sure a motor is plugged into port A
    const motorB = await hub.waitForDeviceAtPort("B") // Make sure a motor is plugged into port B
    const motorD = await hub.waitForDeviceAtPort("D")
    console.log(`${hub.name} is ready! Battery ${hub.batteryLevel}%`)

    async function setup() {
        var motorDegree = 0
        motorD.on('rotate', (e) => {
            motorDegree = e.degrees
        })

        motorD.rotateByDegrees(180, -20)
        await hub.sleep(3000)
        motorD.rotateByDegrees(20, 20)
        await hub.sleep(200)

        gamepad.onButtonDown(0, (b) => {
            motorD.rotateByDegrees(20, 10)
        })
        gamepad.onButtonDown(3, (b) => {
            motorD.rotateByDegrees(20, -10)
        })

        gamepad.onStickMove(0, (s) => {
            var r = 0.7071068
            var x2 = Math.sign(s.x) * Math.pow(Math.abs(s.x), 1.5) * r
            if (Math.abs(x2) < 0.2) x2 = 0
            var y2 = s.y * r * 2
            var pA = x2 * r - y2 * r
            var pB = - x2 * r - y2 * r
            if (Math.abs(pA) < 0.05) {
                motorA.brake()   
            } else {
                motorA.setPower(Math.sign(pA) * (Math.abs(pA) * 70 + 30))
            }
            if (Math.abs(pB) < 0.05) {
                motorB.brake()   
            } else {
                motorB.setPower(Math.sign(pB) * (Math.abs(pB) * 70 + 30))
            }
        })

        var forkDegreeBase = motorDegree
        gamepad.onPressTrigger(1, (t) => {
            var forkDegree = motorDegree - forkDegreeBase
            var rotate = Math.round(t.value * 10) * 18 - forkDegree
            if (Math.abs(rotate) > 30) {
                motorD.rotateByDegrees(Math.abs(rotate), Math.sign(rotate) * 30)
            }
        })
    }

    if (gamepad) {
        setup()
    } else {
        var intervalId = setInterval(() => {
            if (gamepad) {
                setup()
                clearInterval(intervalId)
            }
        }, 200)
    }
});

poweredUP.scan();

const app = express()
const port = 8000

require('express-ws')(app)

app.use('/static', express.static('dist'))
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')))

app.ws('/api/ws', (ws, req) => {
    ws.on('open', () => {
        console.log('Websocket connected!')
    })
    ws.on('message', (msg) => {
        var events = JSON.parse(msg)
        events.forEach((e) => {
            switch (e.type) {
                case 'GamepadConnect':
                    gamepad = new Gamepad(e.id, e.buttonNum, e.triggerNum, e.stickNum)
                    break
                case 'ButtonDown':
                    gamepad.buttonDown(e.button)
                    break
                case 'ButtonUp':
                    gamepad.buttonUp(e.button)
                    break
                case 'TriggerPressing':
                    gamepad.pressTrigger(e.trigger, e.value)
                    break
                case 'StickMoving':
                    gamepad.moveStick(e.stick, e.x, e.y)
                    break
            }
        })
    })
})

app.listen(port, () => console.log(`Example app listening on port ${port}!`))

process.on('SIGINT', () => {
    poweredUP.stop()
    poweredUP.getHubs().forEach((hub) => {
        console.log(`Disconnect ${hub.name}`)
        hub.disconnect()
    })
    process.exit(0)
})
