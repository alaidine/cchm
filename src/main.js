"use strict";

import "./style.css";

document.querySelector("#app").innerHTML = `
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

import firebase from "firebase/compat/app";
import "firebase/compat/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID,
  measurementId: import.meta.env.VITE_MEASUREMENT_ID,
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const API_URL = import.meta.env.VITE_API_URL;

const preferredDisplaySurface = document.getElementById("displaySurface");
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
async function postReceiver(name, token) {
  try {
    const params = new URLSearchParams();
    params.append("name", name);
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

    // Refresh the receivers list
    await fetchReceivers();
  } catch (error) {
    console.error("Error posting receiver:", error);
    errorMsg("Failed to create receiver");
  }
}

// Start button now creates a RECEIVER (answerer) instead of sender
async function startReceiver() {
  const receiverName = receiverNameInput.value.trim();

  if (!receiverName) {
    errorMsg("Please enter a receiver name");
    return;
  }

  startButton.disabled = true;

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

  // Display the token for the sender to use
  tokenDisplay.value = callDoc.id;
  receiverTokenDiv.style.display = "block";

  // Post receiver to API
  await postReceiver(receiverName, callDoc.id);

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

  hangupButton.disabled = false;
}

async function handleSuccess(stream) {
  joinButton.disabled = true;
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
    joinButton.disabled = false;
    preferredDisplaySurface.disabled = false;
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
  // Join button now SENDS the screenshare (creates offer)
  const callId = receiverSelect.value;

  if (!callId) {
    errorMsg("Please select a receiver");
    return;
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

  hangupButton.disabled = false;
}

startButton.addEventListener("click", () => {
  startReceiver();
});

joinButton.addEventListener("click", async () => {
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

if (navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices) {
  startButton.disabled = false;
  joinButton.disabled = false;
} else {
  errorMsg("getDisplayMedia is not supported");
  joinButton.disabled = true;
}

// Fetch receivers on page load
fetchReceivers();
