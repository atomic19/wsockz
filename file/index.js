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

    function fromId() {
        return document.getElementById("rndID").value
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
            appendLog(`Disconnected code: ${ev.code}, reason: ${ev.reason}`, true)
            document.getElementById("connect").disabled = false
            document.getElementById("name").disabled = false
        })
        conn.addEventListener("open", ev => {
            console.info("websocket connected")
            appendLog("connected")
            getList()
        })

        // This is where we handle messages received.
        conn.addEventListener("message", ev => {
            debugger;
            if (typeof ev.data !== "string") {
                console.error("unexpected message type", typeof ev.data)
                return
            }

            data = JSON.parse(ev.data)
            if (data.type == "offer") {
                // show and answer call ?
            }
            else if (data.type == "icecand") {
                signals.connections[data.id].onIceCandidate(data)
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

        try {
            const resp = await fetch("/send", {
                headers: { "Content-Type": "application/json; charset=utf-8" },
                method: 'POST',
                body: JSON.stringify({
                    RndID: id,
                    Message: 'test-msg',
                })
            })

            if (resp.status !== 202) {
                throw new Error(`Unexpected HTTP Status ${resp.status} ${resp.statusText}`)
            }
        } catch (err) {
            appendLog(`Publish failed: ${err.message}`, true)
        }

    }

    sendToId = async (id, data) => {
        await fetch("/send", {
            headers: { "Content-Type": "application/json; charset=utf-8" },
            method: 'POST',
            body: JSON.stringify({
                RndID: id,
                from: fromId(),
                Message: JSON.stringify(data),
            })
        })
    }

    getCurrent = (id, conn) => {
        return {
            id: id,
            name: name,
            localConn: conn,
            sendChannel: null,
            recieveCallback: null,
            connCallbacks: {
                onicecandidate: (id, event) => {
                    if (event.candidate) {
                        sendToId(id, {
                            type: "new-ice-candidate",
                            candidate: event.candidate,
                        })
                    }
                },
                ontrack: (id, event) => {
                    document.getElementById("received_video").srcObject = event.streams[0];
                    document.getElementById("hangup-button").disabled = false;
                },
                onnegotiationneeded: (toId, event, localConn) => {
                    localConn.createOffer().then(function (offer) {
                        return localConn.setLocalDescription(offer);
                    }).then(function () {
                        sendToId(id, { type: 'offer', offer: localConn.localDescription })
                    }).catch(reportError);
                },
                onremovetrack: (id, event) => {
                    var stream = document.getElementById("received_video").srcObject;
                    var trackList = stream.getTracks();

                    if (trackList.length == 0) {
                        closeVideoCall();
                    }
                },
                oniceconnectionstatechange: (id, event) => {
                    switch (myPeerConnection.iceConnectionState) {
                        case "closed":
                        case "failed":
                            closeVideoCall();
                            break;
                    }
                },
                onicegatheringstatechange: (id, event) => {
                    console.log(onicegatheringstatechange, id, event)
                },
                onsignalingstatechange: (id, event) => {
                    switch (myPeerConnection.signalingState) {
                        case "closed":
                            closeVideoCall();
                            break;
                    }
                }
            }
        }
    }

    setConnCallbacks = (id, current, localConn) => {
        localConn.onicecandidate = (event) => current.connCallbacks.onicecandidate(id, event);
        localConn.ontrack = (event) => current.connCallbacks.ontrack(id, event);
        localConn.onnegotiationneeded = (event) => current.connCallbacks.onnegotiationneeded(id, event, localConn);
        localConn.onremovetrack = (event) => current.connCallbacks.onremovetrack(id, event);
        localConn.oniceconnectionstatechange = (event) => current.connCallbacks.oniceconnectionstatechange(id, event);
        localConn.onicegatheringstatechange = (event) => current.connCallbacks.onicegatheringstatechange(id, event);
        localConn.onsignalingstatechange = (event) => current.connCallbacks.onsignalingstatechange(id, event);
    }

    createAndSetDataChannelCallbacks = (id, current, localConn) => {
        current.sendChannel = current.localConn.createDataChannel('sendDataChannel');

        sendChannel.onopen = onSendChannelStateChange;
        sendChannel.onclose = onSendChannelStateChange;


        localConn.ondatachannel = receiveChannelCallback;

        function receiveChannelCallback(event) {
            console.log('Receive Channel Callback');
            receiveChannel = event.channel;
            receiveChannel.onmessage = onReceiveMessageCallback;
            receiveChannel.onopen = onReceiveChannelStateChange;
            receiveChannel.onclose = onReceiveChannelStateChange;
        }

        function onReceiveMessageCallback(event) {
            console.log('Received Message');
            dataChannelReceive.value = event.data;
        }

        function onSendChannelStateChange() {
            const readyState = sendChannel.readyState;
            console.log('Send channel state is: ' + readyState);
            if (readyState === 'open') {
                dataChannelSend.disabled = false;
                dataChannelSend.focus();
                sendButton.disabled = false;
                closeButton.disabled = false;
            } else {
                dataChannelSend.disabled = true;
                sendButton.disabled = true;
                closeButton.disabled = true;
            }
        }

        function onReceiveChannelStateChange() {
            const readyState = receiveChannel.readyState;
            console.log(`Receive channel state is: ${readyState}`);
        }

    }

    createRTCPeer = () => {
        const servers = null //{ 'iceServers': [{ 'urls': 'turn:127.0.0.1:3478', 'username': 'username', 'credential': 'password' }] }; // null; { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] }
        const localConn = new RTCPeerConnection(servers);
        return localConn
    }

    signals = {
        each: {},
        call: (id, name) => {
            if (signals.each[id] != null) {
                return;
            }

            localConn = createRTCPeer()

            signals.each[id] = getCurrent(id, localConn);
            setConnCallbacks(id, current, localConn);

            createAndSetDataChannelCallbacks(id, current, localConn)
        },

        setAnswer: (id, offer) => {
            document.getElementById("answerCall").onclick = (evt) => { signals.answerCall(id, offer) }
        },

        answerCall: (id, offer) => {
            if (signals.each[id] != null) {
                console.log("not answering, already answerered ??? ")
                return;
            }

            localConn = createRTCPeer()
            signals.each[id] = getCurrent(id, localConn)

            var desc = new RTCSessionDescription(offer);
            localConn.setRemoteDescription(desc).then(function () {
                return navigator.mediaDevices.getUserMedia(mediaConstraints);
            }).then(() => {
                createAndSetDataChannelCallbacks(id, current, localConn)
                return localConn.createAnswer();
            }).then(() => {
                return localConn.setLocalDescription(answer);
            }).then(() => {
                var msg = {
                    type: "answer",
                    sdp: localConn.localDescription
                };
                sendToId(id, msg);
            })
        },

        answeredCall: (id, answer) => {
            signals.each[id].localConn.setRemoteDescription(new RTCSessionDescription(answer));
        }

    }



})()
