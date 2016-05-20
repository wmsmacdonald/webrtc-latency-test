"use strict";
var peerConnections;

var log = {
  debug: function(obj) {
    this.debugLogs.push(obj);
  },
  debugLogs: [],
  warning: function(obj) {
    console.log(obj);
  },
  error: function(error) {
    throw error;
  }
};

function testLatency() {
  let channel = peerConnections[0].channel;
  let start = new Date();
  channel.onmessage = function(event) {
    log.warning(new Date() - start);
  };
  channel.send('test');

}

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
  peerConnections = range(5, function() {
    return createOfferConnection(signalingServerConnectPromise, peerConnectionIdSeq++);
  });

  function createOfferConnection(signalingServerConnectPromise, id) {
    log.debug('creating offer connection');
    let peerConnection = new RTCPeerConnection({'iceServers': [{'url': 'stun:stun.services.mozilla.com'}, {'url': 'stun:stun.l.google.com:19302'}]});
    var channel = peerConnection.createDataChannel('datachannel');


    /*channel.onmessage = function(message) {
      log.warning(new Date() - start);
    };

    channel.onopen = function() {
      start = new Date();
      channel.send('afsdfs');
    };*/


    let offerPromise = peerConnection.createOffer();

    Promise.all([offerPromise, signalingServerConnectPromise])
      .then(function (values) {
        log.debug('got local description');
        wsSendObject(values[1], {
          offer: {
            description: values[0]
          },
          localPeerConnectionId: id
        });
        peerConnection.onicecandidate = function(event) {
          if (event.candidate) {
            log.debug('got local candidate');
            wsSendObject(values[1], {
              candidate: event.candidate,
              localPeerConnectionId: id
            });
          }
        };
      });

    offerPromise
      .then(function(description) {
        return peerConnection.setLocalDescription(description);
      })
      .then(function() {
        log.debug('offer local description set');
      });

    return {
      id: id,
      peerConnection: peerConnection,
      channel: channel
    };
  }

  signalingServerConnectPromise
    .then(function(signalingServer) {
      signalingServer.onmessage = serverMessageController;
    });

  function serverMessageController(event) {
    let message = safelyParseJSON(event.data);
    log.debug(message);

    if (message.offer && message.offer.description) {
      // connection and answer need to be created;
      var answerConnection = createAnswerConnection(message.offer.description, message.remoteId, peerConnectionIdSeq++);
      peerConnections.push(answerConnection);
      while (message.offer.candidates.length > 0) {
        answerConnection.peerConnection.addIceCandidate(message.offer.candidates.shift());
        log.debug('added remote candidate');
      }
    }

    else if (message.peerConnection && message.message.answer) {
      log.debug('got remote answer');
      let peerConnection = peerConnections.find(function(peerConnection) {
        return peerConnection.id === message.localPeerConnectionId;
      });

      peerConnection.peerConnection.setRemoteDescription(new RTCSessionDescription(message.message.answer.description));
    }
    else if (message.peerConnection && message.message.candidate) {
      let peerConnection = peerConnections.find(function(peerConnection) {
        return peerConnection.id === message.localPeerConnectionId;
      });

      peerConnection.peerConnection.addIceCandidate(message.message.candidate);
      log.debug('added remote candidate');
    }
    else if (message.requestOffer) {

    }
    else {
      log.error('unrecognized message: ' + JSON.stringify(message));
    }

  }

  function createAnswerConnection(remoteDescription, remoteId, id) {
    log.debug('creating ');
    let peerConnection = new RTCPeerConnection({'iceServers': [{'url': 'stun:stun.services.mozilla.com'}, {'url': 'stun:stun.l.google.com:19302'}]});
    let answerPromise = peerConnection.setRemoteDescription(remoteDescription)
      .then(function() {
        return peerConnection.createAnswer();
      });

    answerPromise
      .then(function(description) {
        return peerConnection.setLocalDescription(description);
      })
      .then(function() {
        log.debug('set answer local description');
      });

    Promise.all([answerPromise, signalingServerConnectPromise])
      .then(function(values) {
        log.debug('answer created');
        wsSendObject(values[1],{
          answer: {
            description: values[0]
          },
          targetId: remoteId,
          localPeerConnectionId: id
        });
      });

    peerConnection.onicecandidate = function(event) {
      if (event.candidate) {
        log.debug('got local candidate');
        wsSendObject(signalingServer, {
         candidate: event.candidate,
         localPeerConnectionId: id,
         targetId: remoteId
        });
      }
    };

    let peerInfo = {
      id: id,
      peerConnection: peerConnection
    };

    peerConnection.ondatachannel = function(event) {
      log.debug('got data channel');
      peerInfo.channel = event.channel;

      event.channel.onmessage = function(message) {
        log.warning(message.data);
        event.channel.send(message.data);
      };
    };

    return peerInfo;
  }

  function safelyParseJSON(string) {
    try {
      return JSON.parse(string);
    }
    catch (e) {
      log.error('Invalid JSON: ' + string);
    }
  }

  function error(error) {
    console.log(error);
  }

  function range(length, valueFunction) {
    return Array.apply(null, Array(length)).map(function () { return valueFunction(); });
  }

  function wsSendObject(ws, obj, errorCallback) {
    ws.send(JSON.stringify(obj), errorCallback);
  }

})();
