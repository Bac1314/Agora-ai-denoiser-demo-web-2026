// Agora AI Noise Suppression demo — plain script, no build step.
const EXT_VERSION = "2.0.2";
const ASSETS_PATH = `https://cdn.jsdelivr.net/npm/agora-extension-ai-denoiser@${EXT_VERSION}/external`;

const $ = (id) => document.getElementById(id);
let client = null, mic = null, cam = null, processor = null;

// ---------- banners ----------
function banner(kind, text) {
  const el = document.createElement("div");
  el.className = `callout ${kind}`;
  el.textContent = text;
  const close = document.createElement("button");
  close.className = "close";
  close.textContent = "×";
  close.onclick = () => el.remove();
  el.prepend(close);
  $("banners").prepend(el);
}

// ---------- extension setup ----------
$("sdk-ver").textContent = AgoraRTC.VERSION;
const extension = new AIDenoiser.AIDenoiserExtension({ assetsPath: ASSETS_PATH });
if (!extension.checkCompatibility()) {
  banner("error", "This browser does not support AI Noise Suppression. Use desktop Chrome or Edge.");
}
AgoraRTC.registerExtensions([extension]);

// ---------- saved settings / invite link ----------
const params = new URLSearchParams(location.search);
for (const id of ["appid", "channel"]) {
  const v = params.get(id) ?? localStorage.getItem(`ains-${id}`);
  if (v) $(id).value = v;
}

$("invite").onclick = async () => {
  const url = new URL(location.href.split("?")[0]);
  url.searchParams.set("appid", $("appid").value.trim());
  url.searchParams.set("channel", $("channel").value.trim());
  try {
    await navigator.clipboard.writeText(url.toString());
    $("status").textContent = "Invite link copied.";
  } catch {
    prompt("Copy this link:", url.toString());
  }
};

// ---------- microphones ----------
async function refreshMics() {
  const devices = await AgoraRTC.getMicrophones().catch(() => []);
  const sel = $("mic"), current = sel.value;
  sel.replaceChildren(new Option("Default microphone", ""));
  devices.forEach((d, i) => sel.add(new Option(d.label || `Microphone ${i + 1}`, d.deviceId)));
  if (current) sel.value = current;
}
AgoraRTC.onMicrophoneChanged = refreshMics;
refreshMics();

$("mic").onchange = () => mic?.setDevice($("mic").value || "default").catch((e) => banner("error", `Mic switch failed: ${e.message}`));

// ---------- AI denoiser controls (apply live) ----------
async function applyDenoiser() {
  if (!processor) return;
  await processor.setMode($("mode").value);
  await processor.setLevel($("level").value);
  await processor.setLatency($("latency").value);
  $("ains").checked ? await processor.enable() : await processor.disable();
  updateStatus();
}
for (const id of ["ains", "mode", "level", "latency"]) {
  $(id).onchange = () => applyDenoiser().catch((e) => banner("error", `Denoiser setting failed: ${e.message}`));
}

$("monitor").onchange = () => {
  if (!mic) return;
  $("monitor").checked ? mic.play() : mic.stop();
};

$("cam").onchange = async () => {
  if (!client) return;
  try {
    if ($("cam").checked) await startCamera();
    else await stopCamera();
  } catch (e) {
    $("cam").checked = false;
    banner("error", `Camera failed: ${e.message}`);
  }
};

async function startCamera() {
  cam = await AgoraRTC.createCameraVideoTrack();
  $("local-video").replaceChildren();
  cam.play("local-video", { mirror: true });
  await client.publish(cam);
}
async function stopCamera() {
  if (!cam) return;
  await client.unpublish(cam).catch(() => {});
  cam.close();
  cam = null;
  $("local-video").innerHTML = '<span class="placeholder">Camera off</span>';
}

$("dump").onclick = async () => {
  if (!processor) return;
  $("dump").disabled = true;
  $("dump").textContent = "Recording dump…";
  try {
    await processor.dump();
  } catch (e) {
    banner("error", `Dump failed: ${e.message}`);
    resetDumpButton();
  }
};
function resetDumpButton() {
  $("dump").disabled = !processor;
  $("dump").textContent = "Dump audio for support";
}

// ---------- processor lifecycle ----------
function createProcessor() {
  const p = extension.createProcessor();
  p.on("overload", async () => {
    banner("warn", "The denoiser is overloaded: your CPU can't keep up.");
    if ($("fallback").checked && $("mode").value !== "STATIONARY_NS") {
      $("mode").value = "STATIONARY_NS";
      await p.setMode("STATIONARY_NS");
      banner("warn", "Switched to STATIONARY_NS mode automatically to reduce CPU load.");
      updateStatus();
    }
  });
  p.on("pipeerror", (err) => {
    banner("error", `AI denoiser failed to load (${err?.message || err}). Sending the mic without AI noise suppression.`);
    p.unpipe();
    mic?.unpipe();
    mic?.pipe(mic.processorDestination);
    $("ains").checked = false;
    $("ains").disabled = true;
  });
  p.on("dump", (blob, name) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  p.on("dumpend", resetDumpButton);
  return p;
}

// ---------- join / leave ----------
$("join-form").onsubmit = async (e) => {
  e.preventDefault();
  const appId = $("appid").value.trim();
  const channel = $("channel").value.trim();
  const token = $("token").value.trim() || null;
  const uidRaw = $("uid").value.trim();
  const uid = uidRaw ? Number(uidRaw) : null;
  if (uidRaw && !Number.isInteger(uid)) return banner("error", "UID must be a whole number.");

  localStorage.setItem("ains-appid", appId);
  localStorage.setItem("ains-channel", channel);
  setJoined(true, "Joining…");

  try {
    client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    client.on("user-published", onUserPublished);
    client.on("user-unpublished", onUserUnpublished);
    client.on("user-left", (user) => removeTile(user.uid));
    const myUid = await client.join(appId, channel, token, uid);

    mic = await AgoraRTC.createMicrophoneAudioTrack({
      microphoneId: $("mic").value || undefined,
      AEC: $("aec").checked,
      ANS: $("ans").checked,
      AGC: $("agc").checked,
    });
    processor = createProcessor();
    mic.pipe(processor).pipe(mic.processorDestination);
    await applyDenoiser();
    await client.publish(mic);
    if ($("monitor").checked) mic.play();
    if ($("cam").checked) await startCamera();

    $("local-uid").textContent = `uid ${myUid}`;
    resetDumpButton();
    refreshMics();
    updateStatus();
  } catch (err) {
    banner("error", `Join failed: ${err.message}`);
    await leave();
  }
};

$("leave").onclick = leave;

async function leave() {
  await stopCamera().catch(() => {});
  if (mic) {
    mic.unpipe();
    mic.close();
    mic = null;
  }
  if (processor) {
    processor.unpipe();
    await processor.destroy().catch(() => {});
    processor = null;
  }
  await client?.leave().catch(() => {});
  client = null;
  $("remotes").replaceChildren();
  $("remote-empty").hidden = false;
  $("local-uid").textContent = "";
  $("ains").disabled = false;
  resetDumpButton();
  setJoined(false, "");
}

function setJoined(joined, text) {
  $("join").disabled = joined;
  $("leave").disabled = !joined;
  for (const id of ["appid", "channel", "token", "uid", "aec", "ans", "agc"]) $(id).disabled = joined;
  $("status").textContent = text;
}

function updateStatus() {
  if (!processor) return;
  $("status").textContent = $("ains").checked
    ? `Connected · AI NS on · ${$("mode").value} / ${$("level").value} / ${$("latency").value}`
    : "Connected · AI NS off";
}

// ---------- remote users ----------
function tileFor(uid) {
  let tile = document.querySelector(`[data-uid="${CSS.escape(String(uid))}"]`);
  if (!tile) {
    tile = document.createElement("div");
    tile.className = "remote";
    tile.dataset.uid = uid;
    tile.innerHTML = '<div class="video"><span class="placeholder">No video</span></div><div class="meter"><div></div></div><div class="small muted name"></div>';
    tile.querySelector(".name").textContent = `uid ${uid}`;
    $("remotes").append(tile);
    $("remote-empty").hidden = true;
  }
  return tile;
}

function removeTile(uid) {
  document.querySelector(`[data-uid="${CSS.escape(String(uid))}"]`)?.remove();
  $("remote-empty").hidden = $("remotes").children.length > 0;
}

async function onUserPublished(user, mediaType) {
  await client.subscribe(user, mediaType);
  const tile = tileFor(user.uid);
  if (mediaType === "video") {
    const box = tile.querySelector(".video");
    box.replaceChildren();
    user.videoTrack.play(box);
  } else {
    user.audioTrack.play();
  }
}

function onUserUnpublished(user, mediaType) {
  if (mediaType === "video") {
    tileFor(user.uid).querySelector(".video").innerHTML = '<span class="placeholder">No video</span>';
  }
}

// ---------- volume meters ----------
const setMeter = (el, level) => { if (el) el.style.width = `${Math.min(100, level * 100)}%`; };
(function tick() {
  setMeter($("local-meter"), mic ? mic.getVolumeLevel() : 0);
  client?.remoteUsers.forEach((u) => {
    const el = document.querySelector(`[data-uid="${CSS.escape(String(u.uid))}"] .meter div`);
    setMeter(el, u.audioTrack ? u.audioTrack.getVolumeLevel() : 0);
  });
  requestAnimationFrame(tick);
})();
