const imageInput = document.getElementById("imageInput");
const imagePreview = document.getElementById("imagePreview");
const previewEmpty = document.getElementById("previewEmpty");
const durationInput = document.getElementById("durationInput");
const fpsInput = document.getElementById("fpsInput");
const motionSelect = document.getElementById("motionSelect");
const generateButton = document.getElementById("generateButton");
const resetButton = document.getElementById("resetButton");
const videoOutput = document.getElementById("videoOutput");
const outputEmpty = document.getElementById("outputEmpty");
const downloadLink = document.getElementById("downloadLink");
const statusEl = document.getElementById("status");

const state = {
  image: null,
  isRendering: false,
  animationFrame: null,
  mediaRecorder: null,
  chunks: [],
  downloadUrl: "",
};

const canvas = document.createElement("canvas");
const context = canvas.getContext("2d");

function setStatus(message) {
  statusEl.textContent = message;
}

function setPreviewVisibility(showImage) {
  imagePreview.style.display = showImage ? "block" : "none";
  previewEmpty.style.display = showImage ? "none" : "block";
}

function setOutputVisibility(showVideo) {
  videoOutput.style.display = showVideo ? "block" : "none";
  outputEmpty.style.display = showVideo ? "none" : "grid";
}

function clearDownload() {
  if (state.downloadUrl) {
    URL.revokeObjectURL(state.downloadUrl);
  }
  downloadLink.removeAttribute("href");
  state.downloadUrl = "";
}

function resetOutput() {
  setOutputVisibility(false);
  clearDownload();
  videoOutput.removeAttribute("src");
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Image failed to load"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("File could not be read"));
    reader.readAsDataURL(file);
  });
}

function updateCanvasSize(image) {
  const maxWidth = 1280;
  const maxHeight = 720;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
}

function drawFrame(image, progress, style) {
  const { width, height } = canvas;
  const zoomRange = 0.08;
  const panRange = 0.08;

  context.clearRect(0, 0, width, height);

  if (style === "zoom") {
    const zoom = 1 + zoomRange * progress;
    const drawWidth = width * zoom;
    const drawHeight = height * zoom;
    const dx = (width - drawWidth) / 2;
    const dy = (height - drawHeight) / 2;
    context.drawImage(image, dx, dy, drawWidth, drawHeight);
    return;
  }

  if (style === "pan") {
    const offsetX = panRange * width * Math.sin(progress * Math.PI);
    const offsetY = panRange * height * Math.cos(progress * Math.PI);
    context.drawImage(image, -offsetX, -offsetY, width + offsetX * 2, height + offsetY * 2);
    return;
  }

  const angle = progress * Math.PI * 2;
  const orbitX = Math.cos(angle) * panRange * width;
  const orbitY = Math.sin(angle) * panRange * height;
  const zoom = 1 + zoomRange * Math.sin(progress * Math.PI);
  const drawWidth = width * zoom;
  const drawHeight = height * zoom;
  const dx = (width - drawWidth) / 2 + orbitX;
  const dy = (height - drawHeight) / 2 + orbitY;
  context.drawImage(image, dx, dy, drawWidth, drawHeight);
}

async function renderVideo() {
  if (!state.image || state.isRendering) {
    return;
  }

  const duration = Math.min(Math.max(Number(durationInput.value), 2), 10);
  const fps = Math.min(Math.max(Number(fpsInput.value), 12), 60);
  const totalFrames = duration * fps;
  const style = motionSelect.value;

  state.isRendering = true;
  generateButton.disabled = true;
  setStatus("Rendering video...");
  resetOutput();

  updateCanvasSize(state.image);

  const stream = canvas.captureStream(fps);
  const mimeTypeOptions = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];

  const chosenType = mimeTypeOptions.find((type) => MediaRecorder.isTypeSupported(type));
  state.chunks = [];
  state.mediaRecorder = new MediaRecorder(stream, chosenType ? { mimeType: chosenType } : {});

  const stopPromise = new Promise((resolve) => {
    state.mediaRecorder.addEventListener("stop", () => resolve());
  });

  state.mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      state.chunks.push(event.data);
    }
  });

  state.mediaRecorder.start();

  let frame = 0;
  const startTime = performance.now();

  const renderFrame = (now) => {
    const elapsed = now - startTime;
    frame = Math.min(Math.floor((elapsed / 1000) * fps), totalFrames);
    const progress = frame / totalFrames;
    drawFrame(state.image, progress, style);

    if (frame < totalFrames) {
      state.animationFrame = requestAnimationFrame(renderFrame);
    } else {
      state.mediaRecorder.stop();
    }
  };

  state.animationFrame = requestAnimationFrame(renderFrame);

  await stopPromise;

  const blob = new Blob(state.chunks, { type: state.mediaRecorder.mimeType || "video/webm" });
  state.downloadUrl = URL.createObjectURL(blob);
  videoOutput.src = state.downloadUrl;
  downloadLink.href = state.downloadUrl;

  setOutputVisibility(true);
  setStatus("Video ready to download.");
  generateButton.disabled = false;
  state.isRendering = false;
}

imageInput.addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }

  try {
    state.image = await loadImage(file);
    imagePreview.src = state.image.src;
    setPreviewVisibility(true);
    setStatus("Image loaded. Ready to generate.");
  } catch (error) {
    setStatus("Could not load that image. Try another file.");
  }
});

generateButton.addEventListener("click", () => {
  if (!state.image) {
    setStatus("Upload an image first.");
    return;
  }

  renderVideo();
});

resetButton.addEventListener("click", () => {
  if (state.animationFrame) {
    cancelAnimationFrame(state.animationFrame);
  }

  if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
    state.mediaRecorder.stop();
  }

  state.image = null;
  imageInput.value = "";
  imagePreview.removeAttribute("src");
  setPreviewVisibility(false);
  resetOutput();
  setStatus("Ready to create.");
});

setPreviewVisibility(false);
setOutputVisibility(false);
