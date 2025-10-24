"use strict";

import "./style.css";

const API_URL = "https://cchm-server.onrender.com";

import firebase from "firebase/compat/app";
import "firebase/compat/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBJHMgWYQ6PnU3Smoi5E4N2neMQ9av9C8Y",
  authDomain: "chromecasthomemade.firebaseapp.com",
  projectId: "chromecasthomemade",
  storageBucket: "chromecasthomemade.firebasestorage.app",
  messagingSenderId: "189639619017",
  appId: "1:189639619017:web:4e9b2ad70a6b5cdf74f818",
  measurementId: "G-CRFW1ZTE07",
};

let cchm_app = `
  <div id="container">
    <h1>ChromeCast Home-Made</h1>
    <div>
      <video id="video" autoplay playsinline muted></video>
        <fieldset id="options" style="display:none">
        <legend>Advanced options</legend>
        <select id="displaySurface">
          <option value="default" selected>Show default sharing options</option>
          <option value="browser">Prefer to share a browser tab</option>
          <option value="window">Prefer to share a window</option>
          <option value="monitor">Prefer to share an entire screen</option>
        </select>
      </fieldset>
    </div>
    <div>
      <h2>Start Receiving</h2>
      <p>Create a receiver to accept a screenshare</p>
      <input id="receiverNameInput" placeholder="Enter receiver name" />
      <button id="startButton">Start Receiver</button>
      <div id="receiverToken" style="display:none">
        <p>Share this token with the sender:</p>
        <input id="tokenDisplay" readonly />
      </div>
      <div id="join">
        <h2>Send Your Screenshare</h2>
        <p>Select a receiver and share your screen</p>
        <select name="receivers" id="receiver-select">
          <option value="">Loading receivers...</option>
        </select>
        <button id="joinButton">Send Screenshare</button>
      </div>
      <h2>Hangup</h2>
      <button id="hangupButton" disabled>Hangup</button>
    </div>
    <div id="errorMsg"></div>
  </div>
`;

let homeContainer = `
  <div id="homeContainer">
    <button id="receive">Receiver</button>
    <button id="send">Sender</button>
    <button id="howItWorks">How it works</button>
    <div id="errorMsg"></div>
  </div>
`;

document.querySelector("#app").innerHTML = homeContainer;

const receive = document.getElementById("receive");
const send = document.getElementById("send");

let receiver = `
  <div id="receiverContainer">
    <div id="receiverName"></div>
    <video id="video" autoplay playsinline muted></video>
    <div id="errorMsg"></div>
  </div>
`;

let sender = `
  <div id="senderContainer">
    <fieldset id="options" style="display:none">
      <legend>Advanced options</legend>
      <select id="displaySurface">
        <option value="default" selected>Show default sharing options</option>
        <option value="browser">Prefer to share a browser tab</option>
        <option value="window">Prefer to share a window</option>
        <option value="monitor">Prefer to share an entire screen</option>
      </select>
    </fieldset>
    <video id="senderVideo" autoplay playsinline muted></video>
    <input id="receiveInput" placeholder="Enter receiver name" />
    <button id="sendButton">Send Screenshare</button>
    <div id="errorMsg"></div>
  </div>
`;

receive.addEventListener("click", async () => {
  document.querySelector("#app").innerHTML = receiver;
  startReceiver();
});

send.addEventListener("click", () => {
  document.querySelector("#app").innerHTML = sender;

  document.getElementById("sendButton").addEventListener("click", () => {
    const preferredDisplaySurface = document.getElementById("displaySurface");

    async function handleSuccess(stream) {
      preferredDisplaySurface.disabled = true;
      const video = document.querySelector("video");
      video.srcObject = stream;

      // Push tracks from local stream to peer connection
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      sendScreenshare().catch((e) => console.log(e));

      // demonstrates how to detect that the user has stopped
      // sharing the screen via the browser UI.
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        errorMsg("The user has ended sharing the screen");
        preferredDisplaySurface.disabled = false;
      });
    }

    const options = { audio: true, video: true };
    const displaySurface =
      preferredDisplaySurface.options[preferredDisplaySurface.selectedIndex]
        .value;
    if (displaySurface !== "default") {
      options.video = { displaySurface };
    }

    navigator.mediaDevices
      .getDisplayMedia(options)
      .then(handleSuccess, handleError);
  });
});

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const startButton = document.getElementById("startButton");
const joinButton = document.getElementById("joinButton");
const receiverSelect = document.getElementById("receiver-select");
const receiverNameInput = document.getElementById("receiverNameInput");
const hangupButton = document.getElementById("hangupButton");
const tokenDisplay = document.getElementById("tokenDisplay");
const receiverTokenDiv = document.getElementById("receiverToken");

const servers = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 10,
};

const pc = new RTCPeerConnection(servers);

// Fetch available receivers from API
async function fetchReceivers() {
  try {
    const response = await fetch(`${API_URL}/receiver`, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch receivers");
    }

    const receivers = await response.json();

    // Populate the select dropdown
    receiverSelect.innerHTML = '<option value="">Select a receiver</option>';
    receivers.forEach((receiver) => {
      const option = document.createElement("option");
      option.value = receiver.token || receiver.id;
      option.textContent = receiver.name;
      receiverSelect.appendChild(option);
    });
  } catch (error) {
    console.error("Error fetching receivers:", error);
    errorMsg("Failed to load receivers");
    receiverSelect.innerHTML =
      '<option value="">Error loading receivers</option>';
  }
}

// Post new receiver to API
async function postReceiver(token) {
  try {
    const params = new URLSearchParams();
    params.append("token", token);

    const response = await fetch(`${API_URL}/receiver`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error("Failed to create receiver");
    }

    let name = await response.text();

    document.getElementById("receiverName").innerHTML = name;
    console.log(name);
  } catch (error) {
    console.error("Error posting receiver:", error);
    errorMsg("Failed to create receiver");
  }
}

// Start button now creates a RECEIVER (answerer) instead of sender
async function startReceiver() {
  let remoteStream = new MediaStream();

  // Set up to receive tracks from the sender
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  const video = document.querySelector("video");
  video.srcObject = remoteStream;

  // Create a receiver session in Firestore
  const callDoc = db.collection("calls").doc();
  const offerCandidates = callDoc.collection("offerCandidates");
  const answerCandidates = callDoc.collection("answerCandidates");

  // Post receiver to API
  await postReceiver(callDoc.id);

  // Collect ICE candidates for the receiver
  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  // Listen for the sender's offer
  callDoc.onSnapshot(async (snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.offer) {
      const offerDescription = new RTCSessionDescription(data.offer);
      await pc.setRemoteDescription(offerDescription);

      // Create answer
      const answerDescription = await pc.createAnswer();
      await pc.setLocalDescription(answerDescription);

      const answer = {
        type: answerDescription.type,
        sdp: answerDescription.sdp,
      };

      await callDoc.update({ answer });
    }
  });

  // Listen for sender's ICE candidates
  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });
}

function handleError(error) {
  errorMsg(`getDisplayMedia error: ${error.name}`, error);
}

function errorMsg(msg, error) {
  const errorElement = document.querySelector("#errorMsg");
  errorElement.innerHTML += `<p>${msg}</p>`;
  if (typeof error !== "undefined") {
    console.error(error);
  }
}

async function sendScreenshare() {
  const input = document.getElementById("receiveInput").value;

  let callId;

  try {
    const response = await fetch(`${API_URL}/receiver/${input}`);
    const body = await response.text();
    const jsonBody = JSON.parse(body);
    console.log(jsonBody);
    console.log(jsonBody[0].token);

    callId = jsonBody[0].token;
  } catch (error) {
    console.log(error);
  }

  const callDoc = db.collection("calls").doc(callId);
  const offerCandidates = callDoc.collection("offerCandidates");
  const answerCandidates = callDoc.collection("answerCandidates");

  // Get candidates for sender, save to db
  pc.onicecandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await callDoc.set({ offer });

  // Listen for receiver's answer
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // Listen for receiver's ICE candidates
  answerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });
}

// startButton.addEventListener("click", () => {
//   startReceiver();
// });

// joinButton.addEventListener("click", async () => {
//   const options = { audio: true, video: true };
//   const displaySurface =
//     preferredDisplaySurface.options[preferredDisplaySurface.selectedIndex]
//       .value;
//   if (displaySurface !== "default") {
//     options.video = { displaySurface };
//   }

//   navigator.mediaDevices
//     .getDisplayMedia(options)
//     .then(handleSuccess, handleError);
// });

// if (navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices) {
//   startButton.disabled = false;
//   joinButton.disabled = false;
// } else {
//   errorMsg("getDisplayMedia is not supported");
//   joinButton.disabled = true;
// }

document.addEventListener("click", (e) => {
  if (e.target.id == "howItWorks") showHowItWorks();
});

function showHowItWorks() {
  const overlay = document.createElement("div");
  overlay.classList.add("modal-overlay");

  overlay.innerHTML = `
    <div id="modal">
      <h2>How it works</h2>
      <p>
        ChromeCast Home-Made lets you share your screen easily between devices.
      </p>
      <ul style="margin-left: 1.2rem; line-height:1.6;">
        <li><b>Receiver</b>: Create a receiver to get a share token.</li>
        <li><b>Sender</b>: Enter that token and start your screen share.</li>
        <li>Everything runs peer-to-peer using WebRTC.</li>
      </ul>
      <button id="closeModal">Got it!</button>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById("closeModal").addEventListener("click", () => {
    overlay.remove();
  });
}
