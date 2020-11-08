"use strict";

var connection = new signalR.HubConnectionBuilder().withUrl("/WebRTCHub").build();

/****************************************************************************
* Initial setup
****************************************************************************/

const configuration = {
   'iceServers': [{
     'urls': 'stun:stun.l.google.com:19302'
   }]
 };
const peerConn = new RTCPeerConnection(configuration);

const connectionStatusMessage = document.getElementById('connectionStatusMessage');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

let localStream;
let remoteStream;
let isInitiator = false;



//setup my video here.
grabWebCamVideo();

/****************************************************************************
* Signaling server
****************************************************************************/

// Connect to the signaling server
connection.start().then(function () {

    connection.on('error', function (message) {
        alert(message);
    });

    //This means Signal R is alive and ready to send/recieve stuff to other client
    //Or maybe it means nothing...
    connection.on('ready', function () {
        console.log('Socket is ready');
        connectionStatusMessage.innerText = 'Connecting...';
        createPeerConnection(isInitiator, configuration);
    });

    connection.on('message', function (message) {
        console.log('Client received message:', message);

        //This is important
        //This is where message from other clients gets processed
        signalingMessageCallback(message);
    });

    connection.on('bye', function () {
        console.log(`Peer leaving room.`);
        // If peer did not create the room, re-enter to be creator.
        connectionStatusMessage.innerText = `Other peer left room ${myRoomId}.`;
    });


    //Close browser
    window.addEventListener('unload', function () {
        if (hasRoomJoined) {
            console.log(`Unloading window. Notifying peers in ${myRoomId}.`);
            connection.invoke("LeaveRoom", myRoomId).catch(function (err) {
                return console.error(err.toString());
            });
        }
    });


}).catch(function (err) {
    return console.error(err.toString());
});

/**
* Send message to signaling server
*/
function sendMessage(message) {
    console.log('Client sending message: ', message);
    connection.invoke("SendMessage", message).catch(function (err) {
        return console.error(err.toString());
    });
    connection.invoke("Test");
}



/****************************************************************************
* User media (webcam)
****************************************************************************/

function grabWebCamVideo() {
    console.log('Getting user media (video) ...');
    navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true
    })
        .then(gotStream)
        .catch(function (e) {
            alert('getUserMedia() error: ' + e.name);
        });
}

function gotStream(stream) {
    console.log('getUserMedia video stream URL:', stream);
    localStream = stream;
    peerConn.addStream(localStream);
    localVideo.srcObject = stream;
    createPeerConnection(true, configuration);

}

/****************************************************************************
* WebRTC peer connection and data channel
****************************************************************************/

var dataChannel;

function signalingMessageCallback(message) {
    if (message.type === 'offer' || message.type === 'Offer') {
        console.log('Got offer. Sending answer to peer.');
        peerConn.setRemoteDescription(new RTCSessionDescription(message), function () { },
            logError);
        peerConn.createAnswer(onLocalSessionCreated, logError);

    } else if (message.type === 'answer' || message.type === 'Answer') {
        console.log('Got answer.');
        peerConn.setRemoteDescription(new RTCSessionDescription(message), function () { },
            logError);

    } else if (message.type === 'candidate' || message.type === 'Candidate') {
        peerConn.addIceCandidate(message.candidate);
    }
}

//This is called once SignalR starts
//It's about to start negotiations to send video
//We don't really care about web sending video
    //But some of this may be needed for receiving
function createPeerConnection(isInitiator, config) {
    console.log('Creating Peer connection as initiator?', isInitiator, 'config:',
        config);

    // send any ice candidates to the other peer
    peerConn.onicecandidate = function (event) {
        console.log('icecandidate event:', event);
        if (event.candidate) {
            // Trickle ICE
            //sendMessage({
            //    type: 'candidate',
            //    label: event.candidate.sdpMLineIndex,
            //    id: event.candidate.sdpMid,
            //    candidate: event.candidate.candidate
            //});
            console.log("Ice candidate event has a candidate");
        } else {
            console.log("Ice candidate event has NO candidate");
            console.log('End of candidates.');
            // Vanilla ICE
            sendMessage(peerConn.localDescription);
        }
    };

    peerConn.ontrack = function (event) {
        console.log('icecandidate ontrack event:', event);
        remoteVideo.srcObject = event.streams[0];
    };

    if (isInitiator) {
        console.log('Creating Data Channel');
        dataChannel = peerConn.createDataChannel('sendDataChannel');
        onDataChannelCreated(dataChannel);

        console.log('Creating an offer');
        peerConn.createOffer(onLocalSessionCreated, logError);
    } else {
        peerConn.ondatachannel = function (event) {
            console.log('ondatachannel:', event.channel);
            dataChannel = event.channel;
            onDataChannelCreated(dataChannel);
        };
    }
}

function onLocalSessionCreated(desc) {
    console.log('local session created:', desc);
    peerConn.setLocalDescription(desc, function () {
        // Trickle ICE
    }, logError).then(function () {
        console.log('sending local desc:', peerConn.localDescription);

        //local sessions created so send an offer out
        sendMessage(peerConn.localDescription);
    })
}

function onDataChannelCreated(channel) {
    console.log('onDataChannelCreated:', channel);

    channel.onopen = function () {
        console.log('Channel opened!!!');
        connectionStatusMessage.innerText = 'Channel opened!!';
        fileInput.disabled = false;
    };

    channel.onclose = function () {
        console.log('Channel closed.');
        connectionStatusMessage.innerText = 'Channel closed.';
    }

    channel.onmessage = onReceiveMessageCallback();
}

//Incoming message from Mobile
//Might be text of might be a file stream
//The file bytes here are for sharing files, not video stream
function onReceiveMessageCallback() {
    let count;
    let fileSize, fileName;
    let receiveBuffer = [];

    return function onmessage(event) {
        if (typeof event.data === 'string') {
            const fileMetaInfo = event.data.split(',');
            fileSize = parseInt(fileMetaInfo[0]);
            fileName = fileMetaInfo[1];
            count = 0;
            return;
        }

        receiveBuffer.push(event.data);
        count += event.data.byteLength;

        if (fileSize === count) {
            // all data chunks have been received
            const received = new Blob(receiveBuffer);
            receiveBuffer = [];

            $(fileTable).children('tbody').append('<tr><td><a></a></td></tr>');
            const downloadAnchor = $(fileTable).find('a:last');
            downloadAnchor.attr('href', URL.createObjectURL(received));
            downloadAnchor.attr('download', fileName);
            downloadAnchor.text(`${fileName} (${fileSize} bytes)`);
        }
    };
}

function sendFile() {
    const file = fileInput.files[0];
    console.log(`File is ${[file.name, file.size, file.type, file.lastModified].join(' ')}`);

    if (file.size === 0) {
        alert('File is empty, please select a non-empty file.');
        return;
    }

    //send file size and file name as comma separated value.
    dataChannel.send(file.size + ',' + file.name);

    const chunkSize = 16384;
    fileReader = new FileReader();
    let offset = 0;
    fileReader.addEventListener('error', error => console.error('Error reading file:', error));
    fileReader.addEventListener('abort', event => console.log('File reading aborted:', event));
    fileReader.addEventListener('load', e => {
        console.log('FileRead.onload ', e);
        dataChannel.send(e.target.result);
        offset += e.target.result.byteLength;
        if (offset < file.size) {
            readSlice(offset);
        } else {
            alert(`${file.name} has been sent successfully.`);
            sendFileBtn.disabled = false;
        }
    });
    const readSlice = o => {
        console.log('readSlice ', o);
        const slice = file.slice(offset, o + chunkSize);
        fileReader.readAsArrayBuffer(slice);
    };
    readSlice(0);
}

/****************************************************************************
* Auxiliary functions
****************************************************************************/

function logError(err) {
    if (!err) return;
    if (typeof err === 'string') {
        console.warn(err);
    } else {
        console.warn(err.toString(), err);
    }
}