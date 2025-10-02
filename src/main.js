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
      <button id="startButton">Start screenshare</button>
      <button id="joinButton">Join screenshare</button>
    </div>
    <div id="errorMsg"></div>
  </div>
`;

const preferredDisplaySurface = document.getElementById("displaySurface");
const startButton = document.getElementById("startButton");
const joinButton = document.getElementById("joinButton");

function handleSuccess(stream) {
  startButton.disabled = true;
  preferredDisplaySurface.disabled = true;
  const video = document.querySelector("video");
  video.srcObject = stream;

  // demonstrates how to detect that the user has stopped
  // sharing the screen via the browser UI.
  stream.getVideoTracks()[0].addEventListener("ended", () => {
    errorMsg("The user has ended sharing the screen");
    startButton.disabled = false;
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

joinButton.addEventListener("clik", () => {
  console.log("clicked the join button");
});

if (navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices) {
  startButton.disabled = false;
} else {
  errorMsg("getDisplayMedia is not supported");
}
