// websocket server
var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({port: 3131});
/*
 client:
 {
 id:
 ws:
 connectedPeers: []
 pendingPeers: []
 availableOffers: []
 }
 */
var clients = [];

wss.on('connection', function(ws) {
  console.log('new ws connection');
  let clientId = clients.length;
  let client = {
    id: clientId,
    ws: ws,
    peerConnections: [],
    availableOffers: []
  };
  clients.push(client);
  ws.on('message', onMessage.bind(null, client));
  ws.on('close', onClose.bind(null, client));
});

function onMessage(client, message) {

  message = safelyParseJSON(message);

  if (message.match) {
    let peer = matchPeer(clients, client);

    if (peer) {
      client.peerConnections.push({
        peer: peer
      });
      peer.peerConnections.push({
        peer: client
      });
      sendNextOffer(peer, client);
    }
    else {
      console.log('no peer available');
    }
  }

  else if (message.offer) {
    console.log('Adding offer');
    addOffer(client, message.offer, message.localPeerConnectionId);
  }

  else if (message.answer) {
    console.log('received answer');

    let answererPeerConnection = client.peerConnections.find(testPeerConnectionId.bind(null, message.targetId));
    // save the connection id of the answerer so that it can be sent along with future messages to the answerer
    // so that the answerer knows what connection the message is bound to
    answererPeerConnection.localPeerConnectionId = message.localPeerConnectionId;

    let offerer = answererPeerConnection.peer;
    let offererPeerConnection = offerer.peerConnections.find(testPeerConnectionId.bind(null, client.id));

    // if the answerer peer connection is not found, targetId must be wrong
    if (answererPeerConnection !== undefined) {

      sendToPeerConnection(offerer, {
        answer: {
          description: message.answer.description
        }
      }, offererPeerConnection.localPeerConnectionId);
    }
    else {
      console.log('remote id incorrect');
    }
  }

  else if (message.candidate) {
    console.log('received candidate');
    addCandidate(client, message.candidate, message.localPeerConnectionId, message.targetId);
  }

  else {
    console.log('Unknown message: ' + JSON.stringify(message));
  }
}

function onClose(client) {
  clients[client.id] = undefined;
  console.log('closed');
}

function matchPeer(clients, client) {

  let peerId = 0;

  // gets the first valid match
  while (peerId < clients.length && (
    // skips possible match if it...
    // is itself
  peerId === client.id
    // is already a peer
  || client.peerConnections.find(function(peer) {
    return peer.id === peerId
  }) !== undefined
    // has been deleted
  || clients[peerId] === undefined
    // already has too many peers
  || clients[peerId].peerConnections.length > 30)) {

    peerId++;
  }

  return peerId >= clients.length ? false : clients[peerId];
}

function sendToPeerConnection(recipientClient, messageObj, localPeerConnectionId) {
  wsSendObject(recipientClient.ws, {
    peerConnection: true,
    message: messageObj,
    localPeerConnectionId: localPeerConnectionId
  });
}

function sendNextOffer(senderClient, recipientClient) {
  let offer = senderClient.availableOffers.shift();
  let peerConnection = senderClient.peerConnections.find(function(peerConnection) {
    return peerConnection.peer.id === recipientClient.id;
  });

  peerConnection.localPeerConnectionId = offer.localPeerConnectionId;
  wsSendObject(recipientClient.ws, {
    offer: {
      description: offer.description,
      candidates: offer.candidates
    },
    remoteId: senderClient.id
  });
  requestOffer(senderClient);
}

function requestOffer(client) {
  wsSendObject(client.ws, {
    requestOffer: true
  });
}

function addOffer(offerer, offer, localPeerConnectionId) {
  offerer.availableOffers.push({
    localPeerConnectionId: localPeerConnectionId,
    description: offer.description,
    candidates: [],
    candidatesDone: false
  });
}

function addCandidate(client, candidate, localPeerConnectionId, targetId) {
  // peer connection is pending
  let pendingOffer = client.availableOffers.find(function(offer) {
    return offer.localPeerConnectionId === localPeerConnectionId;
  });

  if (pendingOffer !== undefined) {
    pendingOffer.candidates.push(candidate);
  }
  else {
    // peer connection is ready
    let senderConnection = client.peerConnections.find(testPeerConnectionId.bind(null, targetId));

    let recipient = senderConnection.peer;

    let recipientConnection = recipient.peerConnections.find(testPeerConnectionId.bind(null, client.id));

    sendToPeerConnection(recipient, {
      candidate: candidate
    }, recipientConnection.localPeerConnectionId);
  }
}

function testPeerConnectionId(id, peerConnection) {
  return peerConnection.peer.id === id;
}

function safelyParseJSON(string) {
  try {
    return JSON.parse(string);
  }
  catch (e) {
    console.log('Invalid JSON: ' + message);
    return false;
  }
}

function wsSendObject(ws, obj, errorCallback) {
  ws.send(JSON.stringify(obj), errorCallback);
}