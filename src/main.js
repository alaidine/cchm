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
      <h2>Start a screenshare</h2>
      <button id="startButton">Start screenshare</button>
      <div id="join">
        <h2>Join a Call</h2>
        <p>Answer the call from a different browser window or device</p>
        <input id="joinInput" />
        <button id="joinButton">Join screenshare</button>
      </div>
      <h2>Hangup</h2>
      <button id="hangupButton" disabled>Hangup</button>
    </div>
    <div id="errorMsg"></div>
  </div>
`;

// Import the functions you need from the SDKs you need
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

console.log(firebaseConfig);

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const preferredDisplaySurface = document.getElementById("displaySurface");
const startButton = document.getElementById("startButton");
const joinButton = document.getElementById("joinButton");
const joinInput = document.getElementById("joinInput");
const hangupButton = document.getElementById("hangupButton");

const servers = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 10,
};

const pc = new RTCPeerConnection(servers);

async function handleSuccess(stream) {
  startButton.disabled = true;
  preferredDisplaySurface.disabled = true;
  const video = document.querySelector("video");
  video.srcObject = stream;

  // Push tracks from local stream to peer connection
  stream.getTracks().forEach((track) => {
    pc.addTrack(track, stream);
  });

  createCall().catch((e) => console.log(e));

  joinButton.disabled = true;

  // demonstrates how to detect that the user has stopped
  // sharing the screen via the browser UI.
  stream.getVideoTracks()[0].addEventListener("ended", () => {
    errorMsg("The user has ended sharing the screen");
    startButton.disabled = false;
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

async function createCall() {
  // Reference Firestore collections for signaling
  const callDoc = db.collection("calls").doc();
  const offerCandidates = callDoc.collection("offerCandidates");
  const answerCandidates = callDoc.collection("answerCandidates");

  joinInput.value = callDoc.id;

  // Get candidates for caller, save to db
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

  // Listen for remote answer
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // Listen for remote ICE candidates
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

joinButton.addEventListener("click", async () => {
  console.log("clicked the join button");
  startButton.disabled = true;

  let remoteStream = new MediaStream();

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  const video = document.querySelector("video");
  video.srcObject = remoteStream;

  const callId = joinInput.value;
  const callDoc = db.collection("calls").doc(callId);
  const offerCandidates = callDoc.collection("offerCandidates");
  const answerCandidates = callDoc.collection("answerCandidates");

  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  // Fetch data, then set the offer & answer

  const callData = (await callDoc.get()).data();

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await callDoc.update({ answer });

  // Listen to offer candidates

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === "added") {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
});

if (navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices) {
  startButton.disabled = false;
} else {
  errorMsg("getDisplayMedia is not supported");
}
