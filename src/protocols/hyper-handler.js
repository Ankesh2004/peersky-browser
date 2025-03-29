// hyper-handler.js
import { create as createSDK } from "hyper-sdk";
import makeHyperFetch from "hypercore-fetch";
import { Readable, PassThrough } from "stream";
import fs from "fs-extra";
import HyperDHT from "hyperdht";
import Hyperswarm from "hyperswarm";
import crypto from "hypercore-crypto";
import b4a from "b4a";
import { hyperOptions, loadKeyPair, saveKeyPair } from "./config.js";

let sdk, fetch;
let swarm = null;

// Mapping: roomKey -> local personal feed for that room (our own feed)
const localRoomFeeds = {}; 
// Mapping: roomKey -> mapping of remote feed keys (hex string) to remote Hypercore feeds
const remoteRoomFeeds = {}; 
// Mapping: roomKey -> array of SSE clients (for real-time updates)
const roomSseClients = {};

let peers = [];
// Keep track of which rooms we’ve joined in the swarm (avoid double-joining)
const joinedRooms = new Set();

// Utility: Broadcast our local feed key to all connected peers
function broadcastHello(roomKey, myFeedKey) {
  const helloMsg = JSON.stringify({
    type: "hello",
    roomKey,
    feedKey: myFeedKey
  });
  sendMessageToPeers(helloMsg);
}

function createDHT() {
  const dht = new HyperDHT({ ephemeral: false });
  dht.on("error", (err) => {
    console.error("HyperDHT error:", err);
  });
  return dht;
}

// Initialize Hyper SDK (once)
async function initializeHyperSDK(options) {
  if (sdk && fetch) return fetch;

  console.log("Initializing Hyper SDK...");

  // Load or generate the swarm keypair
  let keyPair = loadKeyPair();
  if (!keyPair) {
    keyPair = crypto.keyPair();
    saveKeyPair(keyPair);
    console.log("Generated new swarm keypair");
  } else {
    console.log("Loaded existing swarm keypair");
  }

  sdk = await createSDK(options);
  fetch = makeHyperFetch({ sdk, writable: true });
  console.log("Hyper SDK initialized.");
  return fetch;
}

// Initialize Hyperswarm with the keypair from hyperOptions and a custom DHT.
async function initializeSwarm() {
  if (swarm) return;

  const keyPair = hyperOptions.keyPair;
  const dht = createDHT();

  swarm = new Hyperswarm({
    keyPair,
    dht,
    firewall: (remotePublicKey, details) => false,
  });

  swarm.on("error", (err) => {
    console.error("Hyperswarm error:", err);
  });

  // On new peer connections:
  swarm.on("connection", (connection, info) => {
    const shortID = connection.remotePublicKey
      ? b4a.toString(connection.remotePublicKey, "hex").substr(0, 6)
      : "peer";

    if (info.discoveryKey) {
      const discKey = b4a.toString(info.discoveryKey, "hex");
      console.log(`New peer [${shortID}] connected, discKey: ${discKey}`);
    } else {
      console.log(`New peer [${shortID}] connected (no discKey).`);
    }

    connection.on("error", (err) => {
      console.error(`Peer [${shortID}] connection error:`, err);
    });

    peers.push({ connection, shortID });
    console.log(`Peers connected: ${peers.length}`);
    broadcastPeerCount();

    // Replicate our own local feeds as well as all discovered remote feeds
    // (Note: store all feeds in both localRoomFeeds and remoteRoomFeeds)
    for (const roomKey of Object.keys(localRoomFeeds)) {
      const feed = localRoomFeeds[roomKey];
      feed.replicate(connection);
    }
    for (const roomKey of Object.keys(remoteRoomFeeds)) {
      for (const feedKey in remoteRoomFeeds[roomKey]) {
        remoteRoomFeeds[roomKey][feedKey].replicate(connection);
      }
    }

    // Listen for incoming data:
    connection.on("data", async (rawData) => {
      let msg;
      try {
        msg = JSON.parse(rawData.toString());
      } catch {
        msg = {
          sender: shortID,
          message: rawData.toString(),
          timestamp: Date.now(),
        };
      }
      // If message is a hello announcement with a feed key, add that remote feed
      if (msg.type === "hello" && msg.roomKey && msg.feedKey) {
        if (!remoteRoomFeeds[msg.roomKey]) remoteRoomFeeds[msg.roomKey] = {};
        if (!remoteRoomFeeds[msg.roomKey][msg.feedKey]) {
          console.log(`Peer [${shortID}] announced new feed: ${msg.feedKey} in room ${msg.roomKey}`);
          // Load the remote feed using the SDK's corestore
          const remoteFeed = sdk.corestore.get({
            key: b4a.from(msg.feedKey, "hex"),
            valueEncoding: "json",
          });
          await remoteFeed.ready();
          remoteRoomFeeds[msg.roomKey][msg.feedKey] = remoteFeed;
          // Replicate this newly discovered remote feed on this connection:
          remoteFeed.replicate(connection);
        }
      } else {
        // Otherwise, treat the message as a regular chat message
        msg.sender = shortID;
        if (!msg.timestamp) msg.timestamp = Date.now();
        console.log(`Peer [${shortID}] =>`, msg);
        // Append message to local feed if the message includes a roomKey and we have a local feed for it
        if (msg.roomKey && localRoomFeeds[msg.roomKey]) {
          try {
            await appendMessageToLocalFeed(msg.roomKey, {
              sender: msg.sender,
              message: msg.message,
              timestamp: msg.timestamp,
            });
          } catch (err) {
            console.error("Error appending peer msg to local feed:", err);
          }
        }
      }
    });

    connection.on("close", () => {
      peers = peers.filter((p) => p.connection !== connection);
      console.log(`Peer [${shortID}] disconnected. Peers: ${peers.length}`);
      broadcastPeerCount();
    });
  });
}

// Main exported function to handle the `hyper://` protocol.
export async function createHandler(options, session) {
  await initializeHyperSDK(options);
  await initializeSwarm();

  return async function protocolHandler(req, callback) {
    const { url, method, headers, uploadData } = req;
    const urlObj = new URL(url);
    const protocol = urlObj.protocol.replace(":", "");
    const pathname = urlObj.pathname;

    console.log(`Handling request: ${method} ${url}`);

    try {
      if (
        protocol === "hyper" &&
        (urlObj.hostname === "chat" || pathname.startsWith("/chat"))
      ) {
        await handleChatRequest(req, callback, session);
      } else {
        await handleHyperRequest(req, callback, session);
      }
    } catch (err) {
      console.error("Failed to handle Hyper request:", err);
      callback({
        statusCode: 500,
        headers: { "Content-Type": "text/plain" },
        data: Readable.from([`Error handling Hyper request: ${err.message}`]),
      });
    }
  };
}

// Handle all chat‐related endpoints (create room, join room, send/receive messages, etc).
async function handleChatRequest(req, callback, session) {
  const { url, method, uploadData } = req;
  const urlObj = new URL(url);
  const action = urlObj.searchParams.get("action");
  const roomKey = urlObj.searchParams.get("roomKey");

  console.log(`Chat request: ${method} ${url}`);

  try {
    if (method === "POST" && action === "create-key") {
      // Create a brand-new random roomKey
      const newRoomKey = await generateChatRoom();
      console.log("Generated new chat room key:", newRoomKey);
      callback({
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        data: Readable.from([Buffer.from(JSON.stringify({ roomKey: newRoomKey }))]),
      });
    } else if (method === "POST" && action === "join") {
      if (!roomKey) throw new Error("Missing roomKey in join request");
      console.log("Joining chat room:", roomKey);
      // Join the room by creating your personal feed if not already created.
      await joinChatRoom(roomKey);
      callback({
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        data: Readable.from([Buffer.from(JSON.stringify({ message: "Joined chat room" }))]),
      });
    } else if (method === "POST" && action === "send") {
      if (!roomKey) throw new Error("Missing roomKey in send request");
      const { sender, message } = await getJSONBody(uploadData, session);
      console.log(`Sending message [${sender}]: ${message}`);
      // Append message to our own local feed
      await appendMessageToLocalFeed(roomKey, {
        sender,
        message,
        timestamp: Date.now(),
      });
      // Broadcast a JSON message that includes the roomKey so peers know which feed to use.
      const data = JSON.stringify({
        sender,
        message,
        timestamp: Date.now(),
        roomKey,
      });
      sendMessageToPeers(data);
      callback({
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        data: Readable.from([Buffer.from(JSON.stringify({ message: "Message sent" }))]),
      });
    } else if (method === "GET" && action === "receive") {
      if (!roomKey) throw new Error("Missing roomKey in receive request");
      console.log("Setting up SSE for room:", roomKey);
      // For SSE, create a new stream and replay history from ALL feeds for the room
      const stream = new PassThrough();
      session.messageStream = stream;
      // Replay messages from our local feed
      if (localRoomFeeds[roomKey]) {
        const myFeed = localRoomFeeds[roomKey];
        for (let i = 0; i < myFeed.length; i++) {
          const msg = await myFeed.get(i);
          console.log(`Replaying local message at index ${i}:`, msg);
          stream.write(`data: ${JSON.stringify(msg)}\n\n`);
        }
      }
      // Replay messages from each remote feed
      if (remoteRoomFeeds[roomKey]) {
        for (const remoteKey in remoteRoomFeeds[roomKey]) {
          const rFeed = remoteRoomFeeds[roomKey][remoteKey];
          for (let i = 0; i < rFeed.length; i++) {
            const msg = await rFeed.get(i);
            console.log(`Replaying remote message from feed ${remoteKey} at index ${i}:`, msg);
            stream.write(`data: ${JSON.stringify(msg)}\n\n`);
          }
        }
      }
      // Keep the SSE connection alive
      const keepAlive = setInterval(() => {
        stream.write(":\n\n");
      }, 15000);
      if (!roomSseClients[roomKey]) {
        roomSseClients[roomKey] = [];
      }
      roomSseClients[roomKey].push(stream);
      stream.on("close", () => {
        clearInterval(keepAlive);
        roomSseClients[roomKey] = roomSseClients[roomKey].filter((s) => s !== stream);
      });
      callback({
        statusCode: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
        data: stream,
      });
    } else {
      callback({
        statusCode: 400,
        headers: { "Content-Type": "text/plain" },
        data: Readable.from(["Invalid chat action"]),
      });
    }
  } catch (err) {
    console.error("Error in handleChatRequest:", err);
    callback({
      statusCode: 500,
      headers: { "Content-Type": "text/plain" },
      data: Readable.from([`Error in chat request: ${err.message}`]),
    });
  }
}

// Handle general hyper:// requests not related to “chat” API routes.
async function handleHyperRequest(req, callback, session) {
  const { url, method = "GET", headers = {}, uploadData } = req;
  const fetchFn = await initializeHyperSDK();
  let body;
  if (uploadData) {
    try {
      body = readBody(uploadData, session);
    } catch (err) {
      console.error("Error reading uploadData:", err);
      callback({
        statusCode: 400,
        headers: { "Content-Type": "text/plain" },
        data: Readable.from(["Invalid upload data"]),
      });
      return;
    }
  }
  try {
    const resp = await fetchFn(url, {
      method,
      headers,
      body,
      duplex: "half",
    });
    if (resp.body) {
      const responseStream = Readable.from(resp.body);
      console.log("Response received:", resp.status);
      callback({
        statusCode: resp.status,
        headers: Object.fromEntries(resp.headers),
        data: responseStream,
      });
    } else {
      console.warn("No response body.");
      callback({
        statusCode: resp.status,
        headers: Object.fromEntries(resp.headers),
        data: Readable.from([""]),
      });
    }
  } catch (err) {
    console.error("Failed to fetch from Hyper SDK:", err);
    callback({
      statusCode: 500,
      headers: { "Content-Type": "text/plain" },
      data: Readable.from([`Error fetching data: ${err.message}`]),
    });
  }
}

// Helper: Append a message object to our local feed for a given roomKey.
async function appendMessageToLocalFeed(roomKey, { sender, message, timestamp }) {
  const feed = localRoomFeeds[roomKey];
  if (!feed) {
    throw new Error(`Local feed not initialized for room ${roomKey}`);
  }
  const obj = { sender, message, timestamp: timestamp || Date.now() };
  await feed.append(obj);
}

// Helper: Create a new chat room key.
async function generateChatRoom() {
  const buf = crypto.randomBytes(32);
  return b4a.toString(buf, "hex");
}

// Join a chat room: create your personal feed and start replication.
async function joinChatRoom(roomKey) {
  // Use a deterministic name combining roomKey and your device's ID so that the same feed is reused
  if (!localRoomFeeds[roomKey]) {
    const deviceId = b4a.toString(hyperOptions.keyPair.publicKey, "hex").substr(0, 6);
    const feed = sdk.corestore.get({
      name: `chat-${roomKey}-${deviceId}`,
      valueEncoding: "json"
    });
    await feed.ready();
    localRoomFeeds[roomKey] = feed;
    console.log(
      `Created local feed for room ${roomKey}, key: ${b4a.toString(feed.key, "hex")}`
    );
    // Set up local feed's "append" handler to forward new messages to SSE clients.
    feed.on("append", async () => {
      const idx = feed.length - 1;
      const msg = await feed.get(idx);
      const sseArray = roomSseClients[roomKey] || [];
      for (const s of sseArray) {
        s.write(`data: ${JSON.stringify(msg)}\n\n`);
      }
    });
  }

  // Join the swarm if not already joined
  if (!joinedRooms.has(roomKey)) {
    joinedRooms.add(roomKey);
    const topicBuf = b4a.from(roomKey, "hex");
    swarm.join(topicBuf, { client: true, server: true });
    await swarm.flush();
    console.log(`Joined swarm for room: ${roomKey}`);
  }
  
  // Broadcast our local feed key so that remote peers can replicate our feed
  broadcastHello(roomKey, b4a.toString(localRoomFeeds[roomKey].key, "hex"));
}


// Helper: read the upload body into a stream.
function readBody(body, session) {
  const stream = new PassThrough();
  (async () => {
    try {
      for (const data of body || []) {
        if (data.bytes) {
          stream.write(data.bytes);
        } else if (data.file) {
          const fileStream = fs.createReadStream(data.file);
          fileStream.pipe(stream, { end: false });
          await new Promise((resolve, reject) => {
            fileStream.on("end", resolve);
            fileStream.on("error", reject);
          });
        } else if (data.blobUUID) {
          const blobData = await session.getBlobData(data.blobUUID);
          stream.write(blobData);
        }
      }
      stream.end();
    } catch (err) {
      console.error("Error reading request body:", err);
      stream.emit("error", err);
    }
  })();
  return stream;
}

// Helper: Read JSON body from a request.
async function getJSONBody(uploadData, session) {
  const stream = readBody(uploadData, session);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const buf = Buffer.concat(chunks);
  console.log("Request body received (JSON):", buf.toString());
  return JSON.parse(buf.toString());
}

// Broadcast updated peer count to all SSE clients.
function broadcastPeerCount() {
  const cnt = peers.length;
  console.log(`Broadcasting peer count: ${cnt}`);
  for (const streams of Object.values(roomSseClients)) {
    for (const s of streams) {
      s.write(`event: peersCount\ndata: ${cnt}\n\n`);
    }
  }
}

// Send a raw data string to all currently connected peers.
function sendMessageToPeers(data) {
  console.log(`Broadcasting message to ${peers.length} peers`);
  for (const { connection } of peers) {
    if (!connection.destroyed) {
      connection.write(data);
    }
  }
}

export { localRoomFeeds, remoteRoomFeeds };
