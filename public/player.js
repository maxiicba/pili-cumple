/* Reproductor de música compartido para las páginas internas (historia, fotos,
   juegos, frases, muro). Inyecta el botón + panel, lee la playlist de /api/songs
   (o el mp3 de fondo) y RETOMA la canción donde iba en la página anterior.

   Estado compartido en localStorage:
     pili_musica       -> "off" si el usuario pausó a propósito (no autoarrancar)
     pili_music_state  -> { mode:"yt"|"mp3", idx, time, playing }

   Nota: al cambiar de página el navegador corta el audio; acá lo reanudamos.
   El autoplay con sonido puede estar bloqueado hasta el primer toque/scroll,
   así que reanudamos al instante si el navegador lo permite, o en el primer gesto. */
(function () {
  if (window.PiliPlayer) return;

  var PREF_KEY = "pili_musica";
  var STATE_KEY = "pili_music_state";
  var PATH_PLAY = "M8 5v14l11-7z";
  var PATH_PAUSE = "M6 5h4v14H6zm8 0h4v14h-4z";

  function musicaApagada() { try { return localStorage.getItem(PREF_KEY) === "off"; } catch (e) { return false; } }
  function recordarPreferencia(off) { try { localStorage.setItem(PREF_KEY, off ? "off" : "on"); } catch (e) {} }
  function loadState() { try { return JSON.parse(localStorage.getItem(STATE_KEY) || "{}") || {}; } catch (e) { return {}; } }
  function saveState(s) { try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (e) {} }

  var musicBtn = null;
  var startRequested = false;   // el usuario pidió arrancar (botón)
  var requestStart = null;      // "intentar arrancar/reanudar ahora" (lo define el modo activo)

  function setPlayingUI(on) { if (!musicBtn) return; if (on) musicBtn.classList.add("playing"); else musicBtn.classList.remove("playing"); }

  function injectUI() {
    if (document.getElementById("piliMusicBtn")) return;
    var btn = document.createElement("button");
    btn.className = "pili-music-btn"; btn.id = "piliMusicBtn";
    btn.title = "Música"; btn.setAttribute("aria-label", "Música");
    btn.innerHTML = '<svg class="disc" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>';
    document.body.appendChild(btn);

    var panel = document.createElement("div");
    panel.className = "pili-player paused"; panel.id = "piliPlayer";
    panel.setAttribute("aria-hidden", "true"); panel.hidden = true;
    panel.innerHTML =
      '<div class="pili-player-head">' +
        '<div class="pili-player-now"><span class="pili-eq" aria-hidden="true"><i></i><i></i><i></i></span>' +
        '<div class="pili-player-title" id="piliPlayerTitle">Playlist de Pili</div></div>' +
        '<button class="pili-player-close" id="piliClose" aria-label="Cerrar reproductor">✕</button>' +
      '</div>' +
      '<div class="pili-player-video"><div id="piliYt"></div></div>' +
      '<div class="pili-player-controls">' +
        '<button id="piliPrev" aria-label="Canción anterior"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg></button>' +
        '<button class="p-play" id="piliPlay" aria-label="Reproducir o pausar"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path id="piliPlayPath" d="M8 5v14l11-7z"/></svg></button>' +
        '<button id="piliNext" aria-label="Canción siguiente"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg></button>' +
      '</div>' +
      '<ul class="pili-player-list" id="piliPlayerList"></ul>';
    document.body.appendChild(panel);

    var audio = document.createElement("audio");
    audio.id = "piliBgm"; audio.loop = true; audio.preload = "none";
    audio.src = "assets/musica.mp3";
    document.body.appendChild(audio);
  }

  // Un único enganche: al primer gesto del usuario intentamos arrancar/reanudar.
  function armAutostart() {
    function go() {
      window.removeEventListener("pointerdown", go);
      window.removeEventListener("scroll", go);
      if (typeof requestStart === "function") requestStart();
    }
    window.addEventListener("pointerdown", go);
    window.addEventListener("scroll", go, { passive: true });
  }

  function boot() {
    injectUI();
    musicBtn = document.getElementById("piliMusicBtn");
    fetch("/api/songs")
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        if (Array.isArray(list) && list.length) initPlaylist(list);
        else initMp3();
        armAutostart();
      })
      .catch(function () { initMp3(); armAutostart(); });
  }

  /* ---- Modo playlist (YouTube) ---- */
  function initPlaylist(songs) {
    var panel = document.getElementById("piliPlayer");
    var titleEl = document.getElementById("piliPlayerTitle");
    var listEl = document.getElementById("piliPlayerList");
    var pPlay = document.getElementById("piliPlay");
    var pPlayPath = document.getElementById("piliPlayPath");
    var pPrev = document.getElementById("piliPrev");
    var pNext = document.getElementById("piliNext");
    var closeBtn = document.getElementById("piliClose");

    var st = loadState();
    var resumeWanted = (st.playing === true) && !musicaApagada();
    var curIdx = (typeof st.idx === "number" && st.idx >= 0 && st.idx < songs.length) ? st.idx : 0;
    var startAt = (st.mode === "yt" && st.time > 0) ? Math.floor(st.time) : 0;
    var ytPlayer = null, isPlaying = false, ready = false, errStreak = 0;

    panel.hidden = false;

    var lis = [];
    songs.forEach(function (s, i) {
      var li = document.createElement("li");
      var idx = document.createElement("span"); idx.className = "idx"; idx.textContent = (i + 1);
      var nm = document.createElement("span"); nm.className = "nm"; nm.textContent = s.title || "Canción";
      li.appendChild(idx); li.appendChild(nm);
      li.addEventListener("click", function () { userPlay(i); });
      listEl.appendChild(li); lis.push(li);
    });

    function refreshUI() {
      titleEl.textContent = (songs[curIdx] && songs[curIdx].title) || "Playlist de Pili";
      lis.forEach(function (li, i) { li.classList.toggle("active", i === curIdx); });
      panel.classList.toggle("paused", !isPlaying);
      pPlayPath.setAttribute("d", isPlaying ? PATH_PAUSE : PATH_PLAY);
      setPlayingUI(isPlaying);
    }
    function persist() {
      var t = 0; try { t = (ytPlayer && ytPlayer.getCurrentTime) ? ytPlayer.getCurrentTime() : 0; } catch (e) {}
      saveState({ mode: "yt", idx: curIdx, time: t, playing: isPlaying });
    }
    function playCurrent() { if (ytPlayer && ytPlayer.loadVideoById) ytPlayer.loadVideoById(songs[curIdx].youtube_id); }
    function userPlay(i) { curIdx = (i + songs.length) % songs.length; errStreak = 0; recordarPreferencia(false); playCurrent(); }

    requestStart = function () {
      if (musicaApagada() || isPlaying || !ready || !ytPlayer) return;
      if (!startRequested && !resumeWanted) return;
      ytPlayer.playVideo();
    };

    pPlay.addEventListener("click", function () {
      if (!ready) return;
      if (isPlaying) { ytPlayer.pauseVideo(); recordarPreferencia(true); }
      else { startRequested = true; ytPlayer.playVideo(); recordarPreferencia(false); }
    });
    pPrev.addEventListener("click", function () { if (ready) userPlay(curIdx - 1); });
    pNext.addEventListener("click", function () { if (ready) userPlay(curIdx + 1); });
    musicBtn.addEventListener("click", function () {
      var open = panel.classList.toggle("open");
      panel.setAttribute("aria-hidden", open ? "false" : "true");
    });
    closeBtn.addEventListener("click", function () { panel.classList.remove("open"); panel.setAttribute("aria-hidden", "true"); });

    var prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () { if (typeof prev === "function") { try { prev(); } catch (e) {} } createPlayer(); };
    if (window.YT && window.YT.Player) createPlayer();
    else { var tag = document.createElement("script"); tag.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(tag); }

    function createPlayer() {
      if (ytPlayer) return;
      ytPlayer = new YT.Player("piliYt", {
        width: "100%", height: "100%",
        videoId: songs[curIdx].youtube_id,
        playerVars: { autoplay: 0, playsinline: 1, rel: 0, modestbranding: 1, controls: 0, start: startAt },
        events: {
          onReady: function () { ready = true; refreshUI(); requestStart(); },
          onStateChange: onState,
          onError: onErr
        }
      });
    }
    function onState(e) {
      if (e.data === YT.PlayerState.PLAYING) { isPlaying = true; errStreak = 0; refreshUI(); persist(); }
      else if (e.data === YT.PlayerState.PAUSED) { isPlaying = false; refreshUI(); persist(); }
      else if (e.data === YT.PlayerState.ENDED) { curIdx = (curIdx + 1) % songs.length; refreshUI(); playCurrent(); }
    }
    function onErr() {
      errStreak++;
      if (errStreak >= songs.length) { isPlaying = false; refreshUI(); return; }
      curIdx = (curIdx + 1) % songs.length; refreshUI(); playCurrent();
    }

    setInterval(function () { if (isPlaying) persist(); }, 1000);
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", function () { if (document.hidden) persist(); });
    refreshUI();
  }

  /* ---- Modo mp3 (fallback si no hay canciones cargadas) ---- */
  function initMp3() {
    var bgm = document.getElementById("piliBgm");
    var st = loadState();
    var resumeWanted = (st.playing === true) && !musicaApagada();
    if (st.mode === "mp3" && st.time > 0) { try { bgm.currentTime = st.time; } catch (e) {} }

    function persist() { saveState({ mode: "mp3", idx: 0, time: bgm.currentTime || 0, playing: !bgm.paused }); }
    function startMusic() { return bgm.play().then(function () { setPlayingUI(true); persist(); }); }

    requestStart = function () {
      if (musicaApagada() || !bgm.paused) return;
      if (!startRequested && !resumeWanted) return;
      startMusic().catch(function () {});
    };
    requestStart(); // intento inmediato de reanudar (si el navegador lo permite)

    musicBtn.addEventListener("click", function () {
      if (bgm.paused) { startRequested = true; bgm.play(); setPlayingUI(true); recordarPreferencia(false); persist(); }
      else { bgm.pause(); setPlayingUI(false); recordarPreferencia(true); persist(); }
    });
    bgm.addEventListener("play", function () { setPlayingUI(true); });
    bgm.addEventListener("pause", function () { setPlayingUI(false); });
    setInterval(function () { if (!bgm.paused) persist(); }, 1000);
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", function () { if (document.hidden) persist(); });
  }

  // API pública (por si alguna página quiere arrancar desde un gesto propio).
  window.PiliPlayer = {
    start: function () { startRequested = true; if (typeof requestStart === "function") requestStart(); }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
