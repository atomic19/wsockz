; (() => {

    let localStorage = {}

    if (typeof (Storage) !== "undefined") {
        if (window.localStorage != undefined) {
            // localStorage = window.localStorage
            localStorage = window.sessionStorage
        }
    }

    let expectingMessage = false

    function uuidv4() {
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }

    function fromId() {
        return document.getElementById("rndID").value
    }

    function connect_ws() {
        namele = document.getElementById("name")
        rndidele = document.getElementById("rndID")

        if (namele.value == null || namele.value.length == 0) {
            appendLog("enter name to connect", true)
            return;
        }

        document.getElementById("rndID").value = uuidv4().toString()
        document.getElementById("connect").disabled = true
        document.getElementById("disconnect").hidden = false
        document.getElementById("disconnect").disabled = false
        namele.disabled = true
        set_name_to_local(namele.value)

        ws_prot = location.protocol == "https:" ? "wss" : "ws"

        const conn = new WebSocket(`${ws_prot}://${location.host}/register?rndID=${rndidele.value}&info=&name=${namele.value}`)

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
            if (typeof ev.data !== "string") {
                console.error("unexpected message type", typeof ev.data)
                return
            }

            if (ev.data == "refresh") {
                getListNoTimer()
                return;
            }

            data = JSON.parse(ev.data)
            appendLog(`recieved-${data.type} from ${getNameFromId(data.from)}`)
            // console.log("Recieved DATA FROM ", data.from, "WITH DATA", data)
            if (data.type == "offer") {
                // show and answer call ?
                signals.setAnswer(data.from, data.offer)

            }
            else if (data.type == "answer") {
                signals.setReturnAnswer(data.from, data.answer)
            }
            else if (data.type == "new-ice-candidate") {
                console.log('new-ice-candidate', data)
                signals.handleNewICECandidateMsg(data.from, data, null);
            }
            else if (data.type == "answer-set-done-by-caller") {
                // debugger;
                signals.clearICECandidateBack(data.from)
            }

            // const p = appendLog(ev.data)
            //if (expectingMessage) {
            //   p.scrollIntoView()
            //   expectingMessage = false
            // }
        })
    }

    document.getElementById("connect").onclick = connect_ws
    document.getElementById("disconnect").onclick = disconnect

    document.getElementById("name")
        .addEventListener("keyup", function (event) {
            if (event.keyCode === 13) {
                event.preventDefault();
                document.getElementById("connect").click();
            }
        });

    function disconnect() {
        try {
            localStorage.removeItem("name")
        }
        catch {
        }
        location.reload();
    }

    function try_conn_if_local_is_set() {
        try {
            if (localStorage != null && localStorage['name'] != null) {
                // debugger;
                document.getElementById("name").value = localStorage["name"];
                document.getElementById("connect").click();
            }
        }
        catch {
            disconnect()
        }
    }

    function set_name_to_local(name) {
        if (localStorage != null) {
            localStorage["name"] = name
        }
    }

    // boot init connect
    try_conn_if_local_is_set();

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
    appendLog("Put headphones before clicking load camera", true)

    function createElementFromHTML(htmlString) {
        var div = document.createElement('div');
        div.innerHTML = htmlString.trim();

        // Change this to div.childNodes to support multiple top-level nodes
        return div.firstChild;
    }

    orig_refresh_timer = 30
    refresh_timer = orig_refresh_timer * 1000

    const getListNoTimer = async () => {
        const resp = await fetch("/list", { method: "GET" })
        if (resp.status != 200) {
            throw new Error(`failed to get response ${resp.status} ${resp.message}`)
        }
        const online = await resp.json()
        all_online = online
        htmlDivs = []

        Object.keys(online).forEach(function (item) {
            const e1 = `<div class="col-sm-3 online-each-user">
            <label class="form-label">${online[item].Name}</label>
            <button class="btn btn-outline-warning" style="float: right" id="callAudBtn" value="${item}">call</button>
            </div>`;
            htmlDivs.push(e1)
        });


        document.getElementById("online-users").innerHTML = htmlDivs.join("")
    }

    const getList = async () => {
        try {
            await getListNoTimer();
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
        if (event.target.value == fromId()) {
            appendLog("Cannot call yourself", true);
        }
        else {
            callAudFn(event.target.value)
        }
    })

    callAudFn = async id => {
        appendLog(`calling peer - ${getNameFromId(id)}`)

        try {
            signals.call(id, all_online[id].Name)
        } catch (err) {
            appendLog(`Publish failed: ${err.message}`, true)
            throw err
        }

    }

    sendToId = async (id, data, callback = null) => {
        data.from = fromId()
        console.log("sending to id ", id, data.type)
        await fetch("/send", {
            headers: { "Content-Type": "application/json; charset=utf-8" },
            method: 'POST',
            body: JSON.stringify({
                RndID: id,
                from: fromId(),
                Message: JSON.stringify(data),
            })
        })
        if (callback != null) {
            // debugger;
            console.log("calling callback")
            callback()
        }
    }

    reportError = (error) => {
        console.log("ERROR FROM states", error)
    }

    renderConnectedUsersList = () => {
        htmlDivs = []
        for (id in signals.each) {
            if (signals.each[id].sendFunc != null) {
                const e1 = `<div style="float:left; width: 100px; padding: 10px; margin: 10px; border: 1px solid black;">
                <label style="float: left;">${signals.each[id].name}</label>
                <button style="float: right" id="callAudBtn" value="${id}">Chat</button>
                </div>`;
                htmlDivs.push(e1)
            }
        }
        document.getElementById("connected-users").innerHTML = htmlDivs.join("")
    }

    wrapper_for_chat = document.getElementById("connected-users")
    wrapper_for_chat.addEventListener('click', (event) => {
        const isButton = event.target.nodeName === 'BUTTON';
        if (!isButton) {
            return;
        }

        console.dir(event.target.value);
        if (event.target.value == fromId()) {
            appendLog("Cannot call yourself", true);
        }
        else {
            // callAudFn(event.target.value)
            signals.active = event.target.value;
            setCurrentActiveChat();
        }
    })

    getCurrent = (id, conn, name) => {
        return {
            id: id,
            name: name,
            localConn: conn,
            sendChannel: null,
            recieveCallback: null,
            sendFunc: null,
            msgs: [],
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
                    // debugger;
                    console.log("ontrack")
                    document.getElementById("remoteVideo").srcObject = event.streams[0];
                    //document.getElementById("hangup-button").disabled = false;

                    function foo() {
                        // check and play vid if paused
                        vd = document.getElementById("remoteVideo")
                        if (vd != undefined && vd.srcObject != undefined) {
                            if (vd.paused) {
                                vd.play()
                            }
                            setTimeout(foo, 3000);
                        }
                    }
                    foo();
                },
                onnegotiationneeded: (toId, event, localConn) => {
                    // debugger;
                    console.log("onnegotiationneeded")
                    localConn.createOffer().then(function (offer) {
                        return localConn.setLocalDescription(offer);
                    }).then(function () {
                        // debugger;
                        sendToId(toId, { type: 'offer', offer: localConn.localDescription })
                    }).catch(reportError);
                },
                onremovetrack: (id, event) => {
                    // debugger;
                    console.log('remove track')
                    var stream = document.getElementById("remoteVideo").srcObject;
                    var trackList = stream.getTracks();
                    // debugger;

                    if (trackList.length == 0) {
                        //closeVideoCall();
                    }
                },
                oniceconnectionstatechange: (id, event, localConn) => {
                    // debugger;
                    console.log('oniceconnectionstatechange', localConn.iceConnectionState)
                    switch (localConn.iceConnectionState) {
                        case "disconnected":
                            location.reload();
                        case "closed":
                            location.reload();
                        case "failed":
                            //console.log("oniceconnectionstatechange - failed")
                            //closeVideoCall();
                            break;
                    }
                },
                onicegatheringstatechange: (id, event) => {
                    console.log('onicegatheringstatechange', id, event)
                },
                onsignalingstatechange: (id, event, localConn) => {
                    console.log("onsignalingstatechange", localConn.signalingState)
                    switch (localConn.signalingState) {
                        case "closed":
                            //closeVideoCall();
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
        localConn.oniceconnectionstatechange = (event) => current.connCallbacks.oniceconnectionstatechange(id, event, localConn);
        localConn.onicegatheringstatechange = (event) => current.connCallbacks.onicegatheringstatechange(id, event);
        localConn.onsignalingstatechange = (event) => current.connCallbacks.onsignalingstatechange(id, event, localConn);
    }


    createAndSetDataChannelCallbacks = (id, current, localConn) => {
        return;

        sendChannel = current.sendChannel = current.localConn.createDataChannel('sendDataChannel');

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
            console.log('Received Message', event.data);
            // dataChannelReceive.value = event.data;
            if (current.recieveCallback != null) {
                current.recieveCallback(event);
            }
            current.msgs.push({ id: id, value: event.data })
            if (signals.active == id) {
                setCurrentActiveChat();
            }
        }

        function onSendChannelStateChange() {
            // debugger;
            const readyState = sendChannel.readyState;
            console.log('Send channel state is: ' + readyState);
            if (readyState === 'open') {
                appendLog(`peer - ${getNameFromId(id)} - connected`, true)
                current.sendFunc = (msg) => { current.sendChannel.send(msg); }
                renderConnectedUsersList();
                signals.active = id;
                setCurrentActiveChat()
            } else {
                appendLog(`peer - ${getNameFromId(id)} - disconnected`, true)
                current.sendFunc = null;
                renderConnectedUsersList();
                signals.active = null;
                setCurrentActiveChat()
            }
        }

        function onReceiveChannelStateChange() {
            const readyState = receiveChannel.readyState;
            console.log(`Receive channel state is: ${readyState}`);
        }
    }

    createRTCPeer = () => {
        const servers = { 'iceServers': [{ 'urls': 'turn:gg.f64.dev:3478', 'username': 'username', 'credential': 'password' }] }; // null; { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] }
        const localConn = new RTCPeerConnection(servers);
        return localConn
    }

    getNameFromId = (id) => {
        return all_online[id].Name
    }

    setCurrentActiveChat = () => {
        wrapper_for_chat = document.getElementById("wrapper-for-chat")
        if (signals.active == null) {
            wrapper_for_chat.innerHTML = null;
        }
        else {
            msgsHtmls = []
            self_id = fromId()
            to_id = signals.active
            document.getElementById("chat-with").innerText = `chat with ${getNameFromId(to_id)}`
            for (var msg of signals.each[signals.active].msgs) {
                if (msg.id == self_id) {
                    msgsHtmls.push(`
                    <div style="float: left; width: 100%; text-align: right;">
                        <label>${msg.value}</label>
                    </div>
                    `)
                }
                else {
                    msgsHtmls.push(`
                    <div style="float: left; width: 100%; text-align: left;">
                        <label>${msg.value}</label>
                    </div>
                    `)
                }
            }
            all_chats = msgsHtmls.join('')
            mainWrapper = `
            <div style="float: right; height: 500px; overflow: scroll; width: 350px">
                <div style="float: left; width: 100%; text-align: left;">
                    <label>other user messages appear here</label>
                </div>
                <div style="float: left; width: 100%; text-align: right;">
                    <label>your messages appear here</label>
                </div>
                ${all_chats}
            </div>
            <div style="float: right; width: 350px">
                <input id="send-text-to-peer" style="width: 100%" placeholder="type and press return key to send"/>
            </div>
            `
            wrapper_for_chat.innerHTML = mainWrapper
            //document.getElementById("send-text-to-peer").focus()

            document.getElementById("send-text-to-peer").addEventListener("keyup", function (event) {
                if (event.keyCode === 13) {
                    event.preventDefault();
                    if (signals.each[to_id].sendFunc != null) {
                        msg = event.target.value
                        signals.each[to_id].msgs.push({ id: fromId(), value: msg })
                        signals.each[to_id].sendFunc(msg)
                        event.target.value = "";
                        setCurrentActiveChat();
                    }
                }
            });
        }
    }

    signals = {
        active: null,
        backup_ice_can: {},
        each: {},
        chat: false,
        call: (id, name, chat) => {
            if (chat == null) {
                chat = false;
            }
            signals.chat = chat;
            // debugger;
            if (signals.each[id] != null) {
                return;
            }

            var listElement = document.getElementById("availableCameras");
            if(listElement.selectedOptions.length == 0){
                appendLog("No Camera is selected or available", true);
                return;
            }

            localConn = createRTCPeer()

            var option = listElement.selectedOptions[0];
            var cameraId = option.value;
            if (cameraId != "DEFAULT") {
                devices.openCamera(cameraId, 480, 480).then(localStream => {
                    localStream.getTracks().forEach(track => localConn.addTrack(track, localStream));
                    console.log("local camera track set")
                });
            }

            current = signals.each[id] = getCurrent(id, localConn, getNameFromId(id));

            setConnCallbacks(id, current, localConn);

            createAndSetDataChannelCallbacks(id, current, localConn)

            console.log("set streams done,call done")
        },

        setAnswer: (id, offer) => {
            // debugger;
            console.log(`setAnswer ${id} `)
            appendLog(`click answer call to answer for ${getNameFromId(id)}`, true)
            document.getElementById("call_from_label").hidden = false;
            document.getElementById("call_from_label").textContent = `click answer call to answer from ${getNameFromId(id)}`
            document.getElementById("answerCall").disabled = false;
            document.getElementById("answerCall").onclick = (evt) => { signals.answerCall(id, offer) }
        },

        answerCall: (id, offer) => {
            // debugger;
            console.log(`answer ${id}`)
            document.getElementById("answerCall").disabled = true
            if (signals.each[id] != null) {
                console.log("not answering, already answerered ??? ")
                return;
            }

            localConn = createRTCPeer()
            current = getCurrent(id, localConn, getNameFromId(id))
            signals.each[id] = current;
            setConnCallbacks(id, current, localConn);

            var desc = new RTCSessionDescription(offer);
            localConn.setRemoteDescription(desc).then(function () {

                var listElement = document.getElementById("availableCameras");
                var option = listElement.selectedOptions[0];
                var cameraId = option.value;
                if (cameraId != "DEFAULT") {
                    return devices.openCamera(cameraId, 480, 480);
                }

                //return navigator.mediaDevices.getUserMedia(mediaConstraints);
            }).then((localStream) => {
                // debugger;
                localStream.getTracks().forEach(track => localConn.addTrack(track, localStream))
                // debugger;
                console.log(`after Set Remote Desc`)
                signals.clearICECandidateBack(id);
                createAndSetDataChannelCallbacks(id, current, localConn)
                return localConn.createAnswer();
            }).then((answer) => {
                // debugger;
                console.log(`after  set remote desc and create answer`)
                return localConn.setLocalDescription(answer);
            }).then(() => {
                console.log(`after set remote desc, create answer and set local desc`)
                var msg = {
                    type: "answer",
                    answer: localConn.localDescription
                };
                sendToId(id, msg);
            })
        },

        handleNewICECandidateMsg: (id, msg, handle_failed) => {
            console.log(`handleNewICECandidateMsg from ${getNameFromId(id)}`)
            if (signals.each[id] == null
                || signals.each[id].localConn == null
                || signals.each[id].localConn.remoteDescription == null
                || !signals.each[id].localConn.remoteDescription.type) {
                console.log("pushing ice candidate to backup for ice candidate")
                backup_ice_can = signals.backup_ice_can
                if (backup_ice_can[id] == null) {
                    backup_ice_can[id] = []
                }
                backup_ice_can[id].push(msg)
            }
            else {
                if (handle_failed == null) {
                    handle_failed = (failed_msg) => {
                        if (signals.backup_ice_can[id] == null) {
                            signals.backup_ice_can[id] = []
                        }
                        signals.backup_ice_can[id].push(failed_msg)
                    }
                }
                console.log("calling setNewICECandidateMsg from handleNewICECandidateMsg")
                signals.setNewICECandidateMsg(id, msg, (failed_msg) => { handle_failed(failed_msg) });
            }
        },

        setReturnAnswer: (id, answer) => {
            console.log("call answered by ", id, "with answer", answer)
            var desc = new RTCSessionDescription(answer);
            signals.each[id].localConn.setRemoteDescription(desc).then(function () {
                sendToId(id, { type: "answer-set-done-by-caller" })
                // var listElement = document.getElementById("availableCameras");
                // var option = listElement.selectedOptions[0];
                // var cameraId = option.value;
                // if (cameraId != "DEFAULT") {
                //     devices.openCamera(cameraId, 480, 480).then(localStream => {
                //         localStream.getTracks().forEach(track => localConn.addTrack(track, localStream));
                //     });
                // }
                signals.clearICECandidateBack(id)
            });
        },

        clearICECandidateBack: (id) => {
            console.log("clearICECandidateBack", signals.backup_ice_can[id])
            if (signals.backup_ice_can[id] != null) {
                failed = []
                for (var value of signals.backup_ice_can[id]) {
                    console.log("calling from backup for ice candidate")
                    signals.handleNewICECandidateMsg(id, value, (failed_msg) => { failed.push(failed_msg) });
                }
                signals.backup_ice_can[id] = null;
                if (failed.length > 0) {
                    console.log("clearICECandidateBack Failed > 0", failed);
                    signals.backup_ice_can[id] = failed;
                }
            }
        },

        setNewICECandidateMsg: (id, msg, handle_failed) => {
            console.log('setNewICECandidateMsg', id)
            localConn = signals.each[id].localConn
            var candidate = new RTCIceCandidate(msg.candidate);
            // debugger;
            localConn.addIceCandidate(candidate)
                .catch((error, e2) => {
                    // debugger; 
                    console.log(id, msg, candidate);
                    console.log("failed to add ice candidate", error, e2);
                    handle_failed(msg)
                });
        },

        answeredCall: (id, answer) => {
            signals.each[id].localConn.setRemoteDescription(new RTCSessionDescription(answer));
            signals.clearICECandidateBack(id);
        }

    }

    window.userSettings = {};
    devices = {
        // Updates the select element with the provided set of cameras
        updateCameraList: function (cameras) {
            // cameras.reverse(); // why when using virtual cams give them pref
            function createListOption(label, value) {
                cameraOption = document.createElement('option');
                cameraOption.label = label;
                cameraOption.value = value;
                cameraOption.text = label
                return cameraOption;
            }

            const listElement = document.querySelector('select#availableCameras');
            listElement.innerHTML = '';
            cameras.map(camera => {
                return createListOption(camera.label, camera.deviceId);
            }).forEach(cameraOption => {
                listElement.add(cameraOption);
            });
            listElement.add(createListOption("Select", "DEFAULT"));
        },

        // Fetch an array of devices of a certain type
        getConnectedDevices: async function (type) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
                stream.getTracks().forEach(function (track) {
                    track.stop();
                });
                const devices = await navigator.mediaDevices.enumerateDevices();
                return devices.filter(device => device.kind === type)
            }
            catch (error) {

            }
        },

        init: async function () {
            // Get the initial set of cameras connected
            const videoCameras = devices.getConnectedDevices('videoinput');
            if (videoCameras != null && videoCameras != undefined) {
                videoCameras.then(cameras => {
                    if (cameras != null && cameras != undefined) {
                        devices.updateCameraList(cameras);
                    } else {
                        errorElement = document.querySelector("#error")
                        if (errorElement != null) {
                            errorElement.hidden = false;
                        }
                    }
                });
                //updateCameraList(videoCameras);
            }


            // Listen for changes to media devices and update the list accordingly
            navigator.mediaDevices.addEventListener('devicechange', event => {
                const newCameraList = devices.getConnectedDevices('video');
                devices.updateCameraList(newCameraList);
            });

            document.getElementById("loadcamera").onclick = function () {
                var listElement = document.getElementById("availableCameras");
                var option = listElement.selectedOptions[0];
                var cameraId = option.value;
                if (cameraId != "DEFAULT") {
                    devices.openCamera(cameraId, 480, 480);
                }
            }

            document.getElementById("stopcamera").onclick = function () {
                if (window.userSettings.openStream != null && window.userSettings.openStream.active) {
                    window.userSettings.openStream.getTracks().forEach(function (track) {
                        track.stop();
                    });
                }

                const videoElement = document.querySelector('video#localVideo');
                if (videoElement.srcObject != null) {
                    videoElement.srcObject.getTracks().forEach(function (track) {
                        track.stop();
                    });
                }
            }
        },

        openCamera: async function (cameraId, minWidth, minHeight) {
            const constraints = {
                'audio': { 'echoCancellation': true },
                'video': {
                    'deviceId': cameraId,
                    'width': { 'min': minWidth },
                    'height': { 'min': minHeight }
                }
            }

            window.userSettings.openStream = await navigator.mediaDevices.getUserMedia(constraints);
            const videoElement = document.querySelector('video#localVideo');
            videoElement.srcObject = window.userSettings.openStream;
            return window.userSettings.openStream;
        }

    }



    devices.init();




})()
