import $ from 'jquery'

function gamepadConnectEvent(id, buttonNum, triggerNum, stickNum) {
    return {
        type: 'GamepadConnect',
        id: id,
        buttonNum: buttonNum,
        triggerNum: triggerNum,
        stickNum: stickNum,
    }
}

function buttonUpEvent(buttonId) {
    return {
        type: 'ButtonUp',
        button: buttonId,
    }
}

function buttonDownEvent(buttonId) {
    return {
        type: 'ButtonDown',
        button: buttonId,
    }
}

function triggerPressingEvent(triggerId, value) {
    return {
        type: 'TriggerPressing',
        trigger: triggerId,
        value: value,
    }
}

function stickMovingEvent(stickId, x, y) {
    return {
        type: 'StickMoving',
        stick: stickId,
        x: x,
        y: y,
    }
}

function setupGamepad(gamepad, ws) {
    // initialize buttons
    const triggerIds = [6, 7]
    var buttons = []
    var buttonIdMap = {}
    var triggerIdMap = {}
    var buttonCnt = 0
    var triggerCnt = 0
    var sticks = []
    for (var i = 0; i < gamepad.buttons.length; ++i) {
        var isTrigger = false
        if (triggerIds.includes(i)) {
            isTrigger = true
        }
        buttons.push({
            isTrigger: isTrigger,
            pressed: false,
            value: 0,
        })
        if (isTrigger) {
            triggerIdMap[i] = triggerCnt
            triggerCnt += 1
        } else {
            buttonIdMap[i] = buttonCnt
            buttonCnt += 1
        }
    }
    for (var i = 0; i < gamepad.axes.length; i += 2) {
        sticks.push({
            x: 0,
            y: 0,
        })
    }

    ws.send(JSON.stringify([
        gamepadConnectEvent(
            gamepad.id,
            gamepad.buttons.length - triggerIds.length,
            triggerIds.length,
            gamepad.axes.length / 2,
        )]))

    // start button-check loop
    const gpIndex = gamepad.index;
    const intervalId = setInterval(() => {
        if (navigator.webkitGetGamepads) {
            var gp = navigator.webkitGetGamepads()[gpIndex];
        } else {
            var gp = navigator.getGamepads()[gpIndex];
        }
        // check if gamepad is still connected
        if (!gp.connected) {
            console.log('Gamepad disconnected: %s', gp.id)
            clearInterval(intervalId)
        }

        var events = []

        // check button status
        for (var i = 0; i < gp.buttons.length; ++i) {
            if (buttons[i].isTrigger) {
                if (buttons[i].value != gp.buttons[i].value) {
                    buttons[i].pressed = gp.buttons[i].pressed
                    buttons[i].value = gp.buttons[i].value
                    events.push(triggerPressingEvent(triggerIdMap[i], buttons[i].value))
                }
            } else {
                if (gp.buttons[i].pressed != buttons[i].pressed) {
                    buttons[i].pressed = !buttons[i].pressed
                    if (buttons[i].pressed) {
                        events.push(buttonDownEvent(buttonIdMap[i]))
                    } else {
                        events.push(buttonUpEvent(buttonIdMap[i]))
                    }
                }
            }
        }

        // check sticks
        for (var i = 0; i < gp.axes.length / 2; ++i) {
            var gpX = Math.round(gp.axes[i * 2] * 100) / 100.0
            var gpY = Math.round(gp.axes[i * 2 + 1] * 100) / 100.0
            if (Math.abs(gpX) < 0.05) gpX = 0 
            if (Math.abs(gpY) < 0.05) gpY = 0
            if (sticks[i].x != gpX || sticks[i].y != gpY) {
                sticks[i].x = gpX
                sticks[i].y = gpY
                events.push(stickMovingEvent(i, sticks[i].x, sticks[i]. y))
            }
        }

        if (events.length > 0) {
            ws.send(JSON.stringify(events))
        }
    }, 100)
}

$(document).ready(() => {
    var gamepad = null;

    $(window).one('gamepadconnected', (e) => {
        gamepad = e.originalEvent.gamepad;
        console.log('Gamepad connected: %s', gamepad.id);
    });

    const ws = new WebSocket('ws://' + window.location.host + '/api/ws')
    ws.onopen = () => {
        console.log('Websocket connected!')

        if (gamepad) {
            setupGamepad(gamepad, ws)
        } else {
            const intervalId = setInterval(() => {
                if (gamepad) {
                    setupGamepad(gamepad, ws)
                    clearInterval(intervalId)
                }
            }, 200)
        }
    }
})
