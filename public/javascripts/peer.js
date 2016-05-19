"use strict";

(function() {
  const WS_HOST = 'ws://127.0.0.1:3131';
  let signalingServer = new WebSocket(WS_HOST);

  let signalingServerConnectPromise = new Promise(function(resolve, reject) {
    signalingServer.onopen = resolve.bind(null, signalingServer);
  });

  signalingServerConnectPromise
    .then(function(signalingServer) {
      signalingServer.send(JSON.stringify({
        match: true
      }))
    });

  let peerConnectionIdSeq = 0;
  let peerConnections = range(5, function() {
    return createOfferConnection(signalingServerConnectPromise, peerConnectionIdSeq++);
  });

  function createOfferConnection(signalingServerConnectPromise, id) {
    console.log('creating offer connection');
    let peerConnection = new RTCPeerConnection({'iceServers': [{'url': 'stun:stun.services.mozilla.com'}, {'url': 'stun:stun.l.google.com:19302'}]});
    let offerPromise = peerConnection.createOffer();

    Promise.all([offerPromise, signalingServerConnectPromise])
      .then(function (values) {
        values[1].send(JSON.stringify({
          offer: {
            description: values[0]
          },
          localConnectionId: id
        }));
      });

    offerPromise
      .then(function(description) {
        return peerConnection.setLocalDescription(description);
      });

    signalingServerConnectPromise
      .then(function(signalingServer) {
        peerConnection.onIceCandidate = function(candidate) {
          signalingServer.send(JSON.stringify({

          }))
        }
      });

    return {
      id: id,
      peerConnection: peerConnection
    };
  }

  signalingServerConnectPromise
    .then(function(signalingServer) {
      signalingServer.onmessage = serverMessageController;
    });

  function serverMessageController(event) {
    let message = safelyParseJSON(event.data);
    console.log(message);

    if (message.offer && message.offer.description) {
      // connection and answer need to be created;
      peerConnections.push(createAnswerConnection(message.offer.description, message.remoteId, peerConnectionIdSeq++));
    }

    else if (message.answer && message.answer.description) {
      console.log('got remote answer');
      let peerConnection = peerConnections.find(function(peerConnection) {
        return peerConnection.id === message.localConnectionId;
      });

      peerConnection.peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer.description));
    }

  }

  function createAnswerConnection(remoteDescription, remoteId, id) {
    console.log('creating ');
    let peerConnection = new RTCPeerConnection({'iceServers': [{'url': 'stun:stun.services.mozilla.com'}, {'url': 'stun:stun.l.google.com:19302'}]});
    let answerPromise = peerConnection.setRemoteDescription(remoteDescription)
      .then(function() {
        return peerConnection.createAnswer();
      });

    answerPromise
      .then(function(description) {
        peerConnection.setLocalDescription(description);
      });

    Promise.all([answerPromise, signalingServerConnectPromise])
      .then(function(values) {
        console.log('answer created');
        values[1].send(JSON.stringify({
          answer: {
            description: values[0]
          },
          targetId: remoteId,
          localConnectionId: id
        }));
      });

    return {
      id: id,
      peerConnection: peerConnection
    };
  }

  function safelyParseJSON(string) {
    try {
      return JSON.parse(string);
    }
    catch (e) {
      throw 'Invalid JSON: ' + string;
    }
  }

  function error(error) {
    console.log(error);
  }

  function range(length, valueFunction) {
    return Array.apply(null, Array(length)).map(function () { return valueFunction(); });
  }

})();





