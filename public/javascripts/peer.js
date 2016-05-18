"use strict";

(function() {
  const WS_HOST = 'ws://127.0.0.1:3131';
  var signalingServer = new WebSocket(WS_HOST);

  var signalingServerConnectPromise = new Promise(function(resolve, reject) {
    signalingServer.onopen = resolve.bind(null, signalingServer);
  });

  signalingServerConnectPromise
    .then(function(signalingServer) {
      signalingServer.send(JSON.stringify({
        match: true
      }))
    });

  var peerConnectionIdSeq = 0;
  var peerConnections = range(5, function() {
    return createOfferConnection(signalingServerConnectPromise, peerConnectionIdSeq++);
  });

  function createOfferConnection(signalingServerConnectPromise, id) {
    console.log('creating offer connection');
    var peerConnection = new RTCPeerConnection({'iceServers': [{'url': 'stun:stun.services.mozilla.com'}, {'url': 'stun:stun.l.google.com:19302'}]});
    var offerPromise = peerConnection.createOffer();

    Promise.all([offerPromise, signalingServerConnectPromise])
      .then(function (values) {
        values[1].send(JSON.stringify({
          offer: {
            description: values[0]
          },
          localConnectionId: id
        }));
      });

    var localDescriptionPromise = offerPromise
      .then(function(description) {
        return peerConnection.setLocalDescription(description);
      });

    return {
      id: id,
      peerConnection: peerConnection
    };
  }


  let messagePromise = signalingServerConnectPromise
    .then(function onMessage() {
      return new Promise(function(resolve, reject) {
        signalingServer.onmessage = resolve;
      });
    });


  messagePromise
    .then(function wsController(event) {
      var message = safelyParseJSON(event.data);
      console.log(message);
      if (message) {
        if (message.offer && message.offer.description) {
          // connection and answer need to be created
          peerConnections.push(createAnswerConnection(message.offer.description, message.targetId, peerConnectionIdSeq++));
        }

        else if (message.answer && message.answer.description) {
          let peerConnection = peerConnections.find(function(peerConnection) {
            return peerConnection.id === message.targetId;
          });

          peerConnection.peerConnection.setRemoteDescription(message.answer.description);
        }

      }
    });

  function createAnswerConnection(remoteDescription, remoteId, id) {
    console.log('creating ');
    var peerConnection = new RTCPeerConnection({'iceServers': [{'url': 'stun:stun.services.mozilla.com'}, {'url': 'stun:stun.l.google.com:19302'}]});
    var answerPromise = peerConnection.setRemoteDescription(remoteDescription)
      .then(function() {
        return peerConnection.createAnswer();
      });

    answerPromise
      .then(function(description) {
        peerConnection.setLocalDescription(description);
      });

    Promise.all([answerPromise, signalingServerConnectPromise])
      .then(function(values) {
        values[1].send(JSON.stringify({
          answer: {
            description: values[0]
          },
          targetId: remoteId
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





