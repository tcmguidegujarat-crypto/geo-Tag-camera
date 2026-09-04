let videoStream = null;
let useFrontCamera = false;
let geoPosition = null;
let readableAddress = "Fetching location...";
let activeZoom = 1;
let maxZoomSupported = 5;
let baseImageBlob = null;
let initialTouchDist = 0;

const videoEl = document.getElementById("video");
const canvasEl = document.getElementById("canvas");
const zoomSlider = document.getElementById("zoom-slider");
const zoomValueDisplay = document.getElementById("zoom-value");
const toastEl = document.getElementById("toast");
const dlBtn = document.getElementById("dl-btn");
const shutterBtn = document.getElementById("shutter-btn");
const viewWrapper = document.getElementById("view-wrapper");

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.style.display = "block";
  setTimeout(() => {
    toastEl.style.display = "none";
  }, 3000);
}

async function killCameraTracks() {
  if (videoStream) {
    videoStream.getTracks().forEach((track) => track.stop());
    videoStream = null;
    videoEl.srcObject = null;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function startCameraSystem() {
  await killCameraTracks();
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: useFrontCamera ? "user" : "environment",
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });
    videoEl.srcObject = videoStream;

    const tracks = videoStream.getVideoTracks();
    const capabilities = tracks[0].getCapabilities ? tracks[0].getCapabilities() : {};

    if (capabilities.zoom) {
      zoomSlider.min = capabilities.zoom.min || 1;
      zoomSlider.max = capabilities.zoom.max || 5;
      zoomSlider.step = capabilities.zoom.step || 0.1;
      maxZoomSupported = capabilities.zoom.max;
    }
    triggerLocationPoll();
  } catch (err) {
    showToast("Camera Access Error");
  }
}

function toggleCamera() {
  useFrontCamera = !useFrontCamera;
  activeZoom = 1;
  applyZoomSetting(1);
  startCameraSystem();
}

function applyZoomSetting(value) {
  activeZoom = parseFloat(value);
  zoomSlider.value = activeZoom;
  zoomValueDisplay.textContent = activeZoom.toFixed(1) + "x";

  if (videoStream) {
    const tracks = videoStream.getVideoTracks();
    if (tracks[0].getCapabilities?.().zoom) {
      tracks[0].applyConstraints({
        advanced: [{ zoom: activeZoom }]
      }).catch(() => {});
      videoEl.style.transform = "scale(1)";
      return;
    }
  }
  videoEl.style.transform = `scale(${activeZoom})`;
}

zoomSlider.addEventListener("input", (e) => applyZoomSetting(e.target.value));

function triggerLocationPoll() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        geoPosition = pos.coords;
        document.getElementById("lbl-lat").textContent = geoPosition.latitude.toFixed(6);
        document.getElementById("lbl-lon").textContent = geoPosition.longitude.toFixed(6);
        readableAddress = await reverseGeocode(geoPosition.latitude, geoPosition.longitude);
        document.getElementById("lbl-address").textContent = readableAddress;
      },
      () => {
        document.getElementById("lbl-address").textContent = "GPS Error";
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  } else {
    readableAddress = "No GPS Support";
    document.getElementById("lbl-address").textContent = readableAddress;
  }
}

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    const addr = data.address || {};
    const locality = addr.village || addr.hamlet || addr.suburb || addr.locality || addr.town || addr.city || "Area Detected";
    return `${locality}, ${addr.state || ""}, ${addr.country || ""}`.replace(/^,\s|,\s*$/g, "");
  } catch (err) {
    return "Location Verified";
  }
}

viewWrapper.addEventListener("touchstart", (e) => {
  if (e.touches.length === 2) {
    initialTouchDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
  }
}, { passive: true });

viewWrapper.addEventListener("touchmove", (e) => {
  if (e.touches.length === 2 && initialTouchDist > 0) {
    const newDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    const diff = newDist - initialTouchDist;
    let newZoom = activeZoom + diff * 0.01;
    newZoom = Math.min(Math.max(newZoom, 1), maxZoomSupported);
    applyZoomSetting(newZoom);
    initialTouchDist = newDist;
  }
}, { passive: true });

viewWrapper.addEventListener("touchend", () => {
  initialTouchDist = 0;
});

setInterval(() => {
  const now = new Date();
  document.getElementById("lbl-time").textContent =
    now.toLocaleDateString("en-GB") + " " + now.toLocaleTimeString("en-US", { hour12: false });
}, 1000);

// ફોટો કૅપ્ચર કરવા માટેનું ફંક્શન
async function performCapture() {
  if (!videoStream) return;
  shutterBtn.classList.add("disabled");

  const track = videoStream.getVideoTracks()[0];
  const settings = track.getSettings();
  const width = settings.width || videoEl.videoWidth;
  const height = settings.height || videoEl.videoHeight;

  canvasEl.width = width;
  canvasEl.height = height;
  const ctx = canvasEl.getContext("2d");

  if (!track.getCapabilities?.().zoom && activeZoom > 1) {
    const sw = width / activeZoom;
    const sh = height / activeZoom;
    const sx = (width - sw) / 2;
    const sy = (height - sh) / 2;
    ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, width, height);
  } else {
    ctx.drawImage(videoEl, 0, 0, width, height);
  }

  const latStr = geoPosition ? geoPosition.latitude.toFixed(6) : "--";
  const lonStr = geoPosition ? geoPosition.longitude.toFixed(6) : "--";
  const now = new Date();
  const timeStr = now.toLocaleDateString("en-GB") + " " + now.toLocaleTimeString("en-US", { hour12: false });

  // Location overlay box માં છેલ્લી લાઈન તરીકે 'Powered by TCM Guide Gujarat' ઉમેર્યું છે
  const lines = [
    `📍 ${readableAddress}`,
    `Lat: ${latStr}°  Long: ${lonStr}°`,
    `Time: ${timeStr}`,
    `Powered by TCM Guide Gujarat`
  ];

  const maxDim = Math.max(width, height);
  const lineGap = Math.round(0.016 * maxDim);
  const fontSize = Math.round(0.022 * maxDim);

  ctx.font = `500 ${fontSize}px sans-serif`;
  const boxWidth = Math.max(...lines.map((line) => ctx.measureText(line).width)) + Math.round(1.6 * fontSize);
  const boxHeight = lines.length * fontSize + (lines.length - 1) * lineGap + Math.round(1.6 * fontSize);
  const margin = Math.round(0.025 * maxDim);
  const boxY = height - boxHeight - margin;

  // ઓવરલે માટે બ્લેક બેકગ્રાઉન્ડ
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(margin, boxY, boxWidth, boxHeight);

  // લાઈન દોરવી
  lines.forEach((line, i) => {
    const textY = boxY + Math.round(0.8 * fontSize) + i * (fontSize + lineGap) + Math.round(0.85 * fontSize);
    if (i === 0) {
      ctx.fillStyle = "#ffb300"; // એડ્રેસ માટે ઓરેન્જ કલર
      ctx.fillText(line, margin + Math.round(0.8 * fontSize), textY);
    } else if (i === lines.length - 1) {
      ctx.fillStyle = "#ffb300"; // Powered by TCM Guide Gujarat માટે પણ ઓરેન્જ/હાઇલાઇટ કલર
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillText(line, margin + Math.round(0.8 * fontSize), textY);
    } else {
      ctx.fillStyle = "#fff"; // બાકીના ટેક્સ્ટ માટે સફેદ કલર
      ctx.font = `500 ${fontSize}px sans-serif`;
      ctx.fillText(line, margin + Math.round(0.8 * fontSize), textY);
    }
  });

  canvasEl.toBlob(
    (blob) => {
      baseImageBlob = blob;
      dlBtn.style.opacity = "1";
      dlBtn.style.pointerEvents = "auto";
      shutterBtn.classList.remove("disabled");
      showToast("Captured successfully!");
    },
    "image/jpeg",
    0.95
  );
}

// ડાઉનલોડ બટન પર ક્લિક કરવાથી ઈમેજ ડાઉનલોડ થાય અને Alert આવે
function saveToGallery() {
  if (baseImageBlob) {
    const url = URL.createObjectURL(baseImageBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GEOTAG_${new Date().toISOString().replace(/[-:.]/g, "")}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // ડાઉનલોડ થઈ ગયા પછી Alert બતાવશે
    alert("Downloaded Successfully!");
  }
}

window.addEventListener("load", () => {
  startCameraSystem();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
});
