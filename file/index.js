; (() => {
    // expectingMessage is set to true
    // if the user has just submitted a message
    // and so we should scroll the next message into view when received.
    let expectingMessage = false

    function uuidv4() {
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }

    function dial() {
        namele = document.getElementById("name")
        rndidele = document.getElementById("rndID")

        if (namele.value == null || namele.value.length == 0) {
            appendLog("enter name to connect", true)
            return;
        }

        document.getElementById("rndID").value = uuidv4().toString()
        document.getElementById("connect").disabled = true
        namele.disabled = true

        const conn = new WebSocket(`ws://${location.host}/register?rndID=${rndidele.value}&info=&name=${namele.value}`)

        conn.addEventListener("close", ev => {
            appendLog(`WebSocket Disconnected code: ${ev.code}, reason: ${ev.reason}`, true)
            document.getElementById("connect").disabled = false
            document.getElementById("name").disabled = false
        })
        conn.addEventListener("open", ev => {
            console.info("websocket connected")
            appendLog("websocket connected")
            getList()
        })

        // This is where we handle messages received.
        conn.addEventListener("message", ev => {
            if (typeof ev.data !== "string") {
                console.error("unexpected message type", typeof ev.data)
                return
            }
            const p = appendLog(ev.data)
            if (expectingMessage) {
                p.scrollIntoView()
                expectingMessage = false
            }
        })
    }
    document.getElementById("connect").onclick = dial

    const messageLog = document.getElementById("message-log")
    const messageInput = document.getElementById("message-input")

    // appendLog appends the passed text to messageLog.
    function appendLog(text, error) {
        const p = document.createElement("p")
        p.style = "float: left; width: 100%"
        // Adding a timestamp to each message makes the log easier to read.
        p.innerText = `${new Date().toLocaleTimeString()}: ${text}`
        if (error) {
            p.style.color = "red"
            p.style.fontStyle = "bold"
        }
        messageLog.append(p)
        return p
    }
    appendLog("type name and click connect")

    function createElementFromHTML(htmlString) {
        var div = document.createElement('div');
        div.innerHTML = htmlString.trim();

        // Change this to div.childNodes to support multiple top-level nodes
        return div.firstChild;
    }

    orig_refresh_timer = 30
    refresh_timer = orig_refresh_timer * 1000
    const getList = async () => {
        try {
            const resp = await fetch("/list", { method: "GET" })
            if (resp.status != 200) {
                throw new Error(`failed to get response ${resp.status} ${resp.message}`)
            }
            const online = await resp.json()
            all_online = online
            htmlDivs = []

            Object.keys(online).forEach(function (item) {
                const e1 = `<div style="float:left; width: 100px">
                <label style="float: left;">${online[item].Name}</label>
                <button style="float: right" id="callAudBtn" value="${item}">call</button>
                </div>`;
                htmlDivs.push(e1)
            });


            document.getElementById("online-users").innerHTML = htmlDivs.join()

            refresh_timer = orig_refresh_timer
            setTimeout(getList, refresh_timer * 1000)
            // debugger;
        }
        catch (err) {
            appendLog(`failed to get online list wait for ${refresh_timer} seconds to retry or reload page  error: ${err}`, true)
            setTimeout(getList, refresh_timer * 1000)
            refresh_timer += refresh_timer
        }
    }

    all_online = {}
    const wrapper = document.getElementById('online-users');

    wrapper.addEventListener('click', (event) => {
        const isButton = event.target.nodeName === 'BUTTON';
        if (!isButton) {
            return;
        }

        console.dir(event.target.value);
        callAudFn(event.target.value)
    })

    // onsubmit publishes the message from the user when the form is submitted.
    callAudFn = async id => {
        appendLog(`calling user ${all_online[id].Name}`)

        //   const msg = messageInput.value
        //   if (msg === "") {
        //     return
        //   }
        //   messageInput.value = ""

        //   expectingMessage = true
        //   try {
        //     const resp = await fetch("/publish", {
        //       method: "POST",
        //       body: msg,
        //     })
        //     if (resp.status !== 202) {
        //       throw new Error(`Unexpected HTTP Status ${resp.status} ${resp.statusText}`)
        //     }
        //   } catch (err) {
        //     appendLog(`Publish failed: ${err.message}`, true)
        //   }

    }
})()
