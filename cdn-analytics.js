/* --- Config --- */
const player = document.getElementById('player');
const urlInput = document.getElementById('streamUrl');
const typeSelect = document.getElementById('streamType');
const btnLoad = document.getElementById('btnLoad');
const btnStop = document.getElementById('btnStop');
const logEl = document.getElementById('log');
const analyticsInput = "http://ping.conoscense.com/beacon";

let hls = null;
let heartbeatTimer = null;



/* --- Sample generator for asp / vsp fields --- */
const session = {
  as_uid: String(Math.floor(Math.random()*1e19)),
  as_did: uuidV4() + '-' + nowTs(),
  as_ua: navigator.platform,
  as_et: "AppSessionStart",
  as_si: 'appSessionId'+`${Math.floor(Math.random()*99)}`+uuidV4(),
  as_av: "2.1",
  as_st: dataLayerVideo[0].userType, // or guest
  as_pt: getPlatformType(),
  as_pid: dataLayerVideo[0].partnerId,
  as_dname: (navigator.platform || 'unknown').toLowerCase(),
  as_os: navigator.userAgentData.platform,
};

function geoClientLocation() {
  return fetch('https://api.ipify.org?format=json')
    .then(response => response.json())
    .then(data => data.ip)
    .catch(error => {
      console.error('Error fetching IP:', error);
      return null;
    });
}

geoClientLocation().then(ip => {
  const geo = "as_geo";
  session[geo] = ip;
  console.log("Client IP:", ip);
  console.log(session,'session');

});

function getStreamTypeFromUrl(streamUrl) {
  if (!streamUrl) return 'UNKNOWN';
  const url = streamUrl.toLowerCase();
  if (url.endsWith('.mp4')) return 'MP4';
  if (url.endsWith('.m3u8')) return 'HLS';
  if (url.endsWith('.mpd')) return 'DASH';
  if (url.includes('youtube.com') || url.includes('ytimg.com')) return 'YOUTUBE';
  return 'UNKNOWN';
}


function getVideoMode(videoElement) {
  if (!videoElement) return 'UNKNOWN';
  const src = videoElement.currentSrc || videoElement.src;
  // Check file type
  if (src.endsWith('.mp4')) return 'DOWNLOADED';
  if (src.endsWith('.m3u8') || src.endsWith('.mpd')) return 'STREAM';
  // Fallback: check buffered vs duration
  const buffered = videoElement.buffered;
  if (buffered.length && buffered.end(buffered.length - 1) >= videoElement.duration) {
    return 'DOWNLOADED';
  }
  return 'STREAM';
}

/* --- Utility functions --- */
function uuidV4() {
  // quick unique ID generator (not crypto-strong)
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random()*16|0, v=c=='x'?r:(r&0x3|0x8);
    return v.toString(16);
  });
}
function nowTs() { return Date.now(); }
function isoTs() { return new Date().toISOString(); }
function ua(){ return navigator.userAgent || 'unknown'; }
function screenRes(){ return `${window.innerWidth}*${window.innerHeight}`; }
function log(msg) {
  const t = new Date().toISOString();
  logEl.textContent = `[${t}] ${msg}\n` + logEl.textContent;
}
/*------*/
function getPlatformType() {
  const userAgent = navigator.userAgent;

  // Detect iOS devices (iPhone, iPad, iPod)
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return 'IPHONE';
  }
  
  // Detect Android devices
  if (/Android/i.test(userAgent)) {
    return 'ANDROID';
  }
  
  // Detect SmartTVs
  // This is less reliable due to the variety of user agent strings.
  // Common keywords include "SMART-TV", "SmartTV", or OS-specific terms.
  if (/SmartTV|SMART-TV|TV/i.test(userAgent)) {
    return 'SMARTTV';
  }
  
  // If none of the above are matched, assume it's a web browser
  return 'WEB';
}
// network function
// Detect network type and speed
 function getNetworkInfo() {
  let networkType = 'UNKNOWN';
  let speedMbps = 'N/A';

  // 1️⃣ Detect network type
  if (!navigator.onLine) {
    networkType = 'OFFLINE';
  } else {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection) {
      if (connection.type === 'wifi') networkType = 'WIFI';
      else if (connection.type === 'ethernet') networkType = 'LAN';
      else if (connection.type === 'cellular') {
        switch (connection.effectiveType) {
          case '5g': networkType = '5G'; break;
          case '4g': networkType = '4G'; break;
          case '3g': networkType = '3G'; break;
          case '2g':
          case 'slow-2g': networkType = 'EDGE'; break;
          default: networkType = 'MOBILE';
        }
      } else if (connection.type === 'none') networkType = 'OFFLINE';
      else networkType = connection.effectiveType?.toUpperCase() || 'UNKNOWN';

      // Estimated downlink (if available)
      if (connection.downlink) {
        speedMbps = connection.downlink.toFixed(2);
      }
    }
  }

  // 2️⃣ Fallback — measure actual speed if not available
  // if (speedMbps === 'N/A' || speedMbps < 0.1) {
  //   try {
  //     const startTime = new Date().getTime();
  //     const response = await fetch('https://speed.hetzner.de/1MB.bin');
  //     const blob = await response.blob();
  //     const endTime = new Date().getTime();

  //     const duration = (endTime - startTime) / 1000;
  //     const bitsLoaded = blob.size * 8;
  //     speedMbps = (bitsLoaded / duration / 1024 / 1024).toFixed(2);
  //   } catch (error) {
  //     speedMbps = 'Unknown';
  //   }
  // }
  
  return { vs_nt: networkType, vs_cs: speedMbps };
}

/* --- Build default VSP template --- */
function buildVSP(streamUrl,actionEventName) {
  // console(dataLayerVideo,'dataLayerVideo');
    const { vs_nt, vs_cs } =  getNetworkInfo(); // 👈 get dynamic network info
  // Some derived fields: codec, content type (vod/live), vlen etc.  Replace with real values from manifest if available.
  const isMp4 = /\.mp4($|\?)/i.test(streamUrl);
  const vtype = isMp4 ? 'vod' : 'vod';
  const vsi = Math.floor(Date.now() / 100);
  console.log(vs_nt,'vs_nt');
  console.log(vs_cs,'vs_cs');
  var vspPayload = {
    "vs_et":actionEventName,
    "vs_vsi":vsi,
    "vs_cs": vs_cs+' Mbps',  //  from getNetworkInfo
    "vs_nt": vs_nt,  //  from getNetworkInfo
    "vs_vsm": getVideoMode(player),
    "vs_cid": dataLayerVideo[0].contentId,
    "vs_ctyp": dataLayerVideo[0].contentType,
    "vs_cname": dataLayerVideo[0].contentName,
    // "vs-cdn": new URL(streamUrl, window.location.href).hostname,
    // "vs-cf": isMp4 ? "MP4" : "DASH/HLS",
    // "vs-cid": Math.floor(Math.random()*1e10),
    // "vs-codec": "NA",
    // "vs-cs": "adaptive",
    // "vs-drm": "false",
    // "vs-nt": navigator.connection && navigator.connection.effectiveType ? navigator.connection.effectiveType : "unknown",
    // "vs-pn": "custom_web_player",
    // "vs-pos": Math.floor(player.currentTime || 0),
    // "vs-pv": `v-${Math.floor(Math.random()*1000)}`,
    // "vs-sce": "NA",
    // "vs-vlen": isFinite(player.duration) && player.duration > 0 ? Math.round(player.duration) : 0,
    // "vs-vsi": btoa(streamUrl).substring(0,64),
    // "vs-vsm": "streaming",
    // "vs-vt": vtype,
    // "vs-nwtd": 0,
    // "vs-al": navigator.language || "hin-Hindi",
    // "vs-sl": "off",
    // "vs-sh": streamUrl,
    // "vs-cp": "no",
    // "vs-bng": "other",
    // "vs-eplus": "no",
    // "vs-sst": nowTs(),
    // "vs-dp": location.protocol.replace(':',''),
    // "vs-pr": "1x",
    // "vs-ttfb": 0,
    // "vs-vr": screenRes(),
    // "vs-cbr": 0,
    // "vs-wtd": 0,
    // "vs-bfd": 0,
    // "vs-mvv": 1,
    // "vs-enpt": "detail-page",
    // "vs-subpn": "Registered",
    // "vs-subpr": "HD",
    // "vs-ivs": "Auto",
    // "vs-isma": 0,
    // "vs-prid": Math.floor(Math.random()*1e9),
    // "vs-plbst": "Ad"
  };
  vspPayload.vs_pn = dataLayerVideo[0].videoPlayerName;
  vspPayload.vs_pv = dataLayerVideo[0].playerVersion;
  vspPayload.vs_cf = dataLayerVideo[0].VideoContentFormat;
  vspPayload.vs_drm = dataLayerVideo[0].drm;
  vspPayload.vs_codec = dataLayerVideo[0].VideoDecode;
  vspPayload.vs_cdn = dataLayerVideo[0].cdn;
  vspPayload.vs_vt = dataLayerVideo[0].videoType;
  vspPayload.vs_vlen = dataLayerVideo[0].streamBite;
  vspPayload.vs_wtime = dataLayerVideo[0].videoWatchLength;

  return vspPayload;
}

/* --- Build ADS payload sample --- */
function buildAdSP() {
  return {
    "ads-et": "AdStart",
    "ads-sid": session.as_si + '-' + Math.floor(Math.random()*9999),
    "ads-camid": "NA",
    "ads-advid": session.as_did,
    "ads-curc": 0,
    "ads-conc": 0,
    "ads-pos": "pre-roll",
    "ads-pdpos": 1,
    "ads-alen": 0,
    "ads-an": "NA",
    "ads-surl": "NA",
    "ads-atec": "NA",
    "ads-sys": "NA",
    "ads-adv": "NA",
    "ads-crid": "NA",
    "ads-desc": "NA",
    "ads-st": "",
    "ads-isl": "",
    "ads-mfaf": "NA",
    "ads-am": "",
    "ads-amv": "",
    "ads-fas": "NA",
    "ads-faid": "NA",
    "ads-fcrid": "NA",
    "ads-cbr": 0,
    "ads-sst": nowTs(),
    "ads-papos": 0,
    "ads-pacnt": 0,
    "ads-ppewc": 0,
    "ads-bfd": 0,
    "ads-clsid": "NA",
    "ads-camnm": "NA",
    "ads-wtd": 0,
    "ads-abaen": "NA",
    "ads-abaev": "NA",
    "ads-einit": "player"
  };
}

/* --- Build top-level payload matching your example --- */
function buildPayload({eventName='generic', extra={}, ctagsEvent={} } = {}) {
  const streamUrl = urlInput.value || '';
  console.log(session,'session9489');
  const payload = {
    "asp": {
      "as_uid": session.as_uid,
      "as_did": session.as_did,
      "as_ua": session.as_ua,
      "as_et": session.as_et,
      "as_si": session.as_si,
      "as_av": session.as_av,
      "as_st": session.as_st,
      "as_pt": session.as_pt,
      "as_pid": session.as_pid,
      "as_geo": session.as_geo,
      "as_dname": session.as_dname,
      "as_os": session.as_os,
    },

    //"vsp": buildVSP(streamUrl),
    //"adsp": buildAdSP(),
    "event": {
      "e": eventName,
      "wc": String(Math.floor(new Date().getTime()/1000.0)),
      "tz": `${new Date().getTimezoneOffset() > 0 ? '-' : '+'}${String(Math.floor(Math.abs(new Date().getTimezoneOffset()/60))).padStart(2,'0')}:${String(Math.abs(new Date().getTimezoneOffset()%60)).padStart(2,'0')}`,
      ...extra
    },
    "ctags": {
      ...ctagsEvent
    }
  };
  if (eventName === 'VideoSessionStart' || eventName === 'Attempt') {
      payload.vsp = buildVSP(streamUrl,eventName);
    }
  return payload;
}

/* --- Beacon sender --- */
function sendBeacon(eventName, extra = {}, ctagsEvent = {}) {
  const endpoint = analyticsInput;
  if (!endpoint) { log('Analytics endpoint not set'); return; }

  const payload = buildPayload({ eventName, extra, ctagsEvent });
  const body = JSON.stringify(payload);

  log(`SEND → ${endpoint}\nEvent: ${eventName}\nPayload: ${JSON.stringify(payload, null, 0)}`);

  try {
    const blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, blob);
    } else {
      // fallback
      fetch(endpoint, { method:'POST', headers: { 'Content-Type': 'application/json' }, body })
        .then(r => log(`fetch result: ${r.status}`))
        .catch(e => log('fetch error: ' + e.message));
    }
  } catch (e) {
    log('Beacon send error: ' + e.message);
  }
}
// 



/* --- Player / HLS integration --- */
function initHls(url) {
  destroyHls();
  if (Hls.isSupported()) {
    hls = new Hls();
    hls.attachMedia(player);
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      log('Hls.js: media attached, loading source');
      hls.loadSource(url);
    });
    hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
      log('Hls.js: manifest parsed, levels=' + (data.levels ? data.levels.length : 0));
      sendBeacon('Attempt', {},{colour:"blue"});
      player.play().catch(()=>{});
    });
    hls.on(Hls.Events.FRAG_LOADED, (_evt, data) => {
      const fragUrl = data.frag && data.frag.url ? data.frag.url : 'unknown';
      log('Hls.js: frag loaded:' + fragUrl);
      // Send fragment-level beacon with frag URL (CDN request)
      sendBeacon('FragLoaded', { frag: fragUrl, fragRange: data.frag && data.frag.byteRange ? data.frag.byteRange : null });
    });
    hls.on(Hls.Events.ERROR, (_evt, data) => {
      log('Hls error: ' + JSON.stringify(data));
      sendBeacon('HlsError', { error: data });
    });
  } else if (player.canPlayType('application/vnd.apple.mpegurl')) {
    player.src = url;
    player.addEventListener('loadedmetadata', () => {
      log('Native HLS loaded (Safari)');
      sendBeacon('NativeHlsLoaded', {});
      player.play().catch(()=>{});
    }, { once: true });
  } else {
    log('HLS not supported in this browser');
    sendBeacon('HlsNotSupported', {});
  }
}
function destroyHls() {
  if (hls) {
    try { hls.destroy(); } catch(e) {}
    hls = null;
  }
  player.removeAttribute('src');
  try { player.load(); } catch(e) {}
}

/* --- UI actions --- */
btnLoad.addEventListener('click', () => {
  const url = urlInput.value.trim();
  if (!url) return alert('Enter stream URL');

  sendBeacon('VideoSessionStart', { },{ colour:"red"});
  if (typeSelect.value === 'mp4' || (typeSelect.value === 'auto' && /\.mp4($|\?)/i.test(url))) {
    destroyHls();
    player.src = url;
    player.crossOrigin = 'anonymous';
    player.play().then(() => {
      sendBeacon('LoadMP4', {});
      log('Playing MP4');
    }).catch(err => {
      log('Play error: ' + err.message);
      sendBeacon('PlayError', { message: err.message });
    });
  } else {
    initHls(url);
  }
});

btnStop.addEventListener('click', () => {
  player.pause();
  destroyHls();
  sendBeacon('Stop', {});
});

/* --- Player events mapped to beacons --- */
player.addEventListener('play', () => {
  sendBeacon('Play', { pos: Math.floor(player.currentTime) });
  startHeartbeat();
});
player.addEventListener('playing', () => {
  sendBeacon('Playing', { pos: Math.floor(player.currentTime) });
});
player.addEventListener('pause', () => {
  sendBeacon('Pause', { pos: Math.floor(player.currentTime) });
  stopHeartbeat();
});
player.addEventListener('seeking', () => {
  sendBeacon('Seeking', { seekTime: Math.floor(player.currentTime) });
});
player.addEventListener('seeked', () => {
  sendBeacon('Seeked', { seekTime: Math.floor(player.currentTime) });
});
player.addEventListener('ended', () => {
  sendBeacon('Ended', {});
  stopHeartbeat();
});
player.addEventListener('error', (ev) => {
  const err = player.error;
  sendBeacon('MediaError', { code: err ? err.code : 'unknown', message: err ? err.message : 'no message' });
});

/* --- Heartbeat --- */
function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    sendBeacon('Heartbeat', { pos: Math.floor(player.currentTime), duration: isFinite(player.duration) ? Math.round(player.duration) : 0 });
  }, 15000); // 15s
}
function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}
/* --- On load, send a session start beacon --- */
window.addEventListener('load', () => {
  setTimeout(()=> sendBeacon('AppSessionStart', { }, { colour:"blue"}), 2000);
  log('SessionStart beacon sent');
});

/* --- Expose debug API in console --- */
window.__sonylivBeacon = {
  send: sendBeacon,
  buildPayload,
  session
};