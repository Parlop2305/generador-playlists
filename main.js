// main.js

// ===================== CONFIG =====================
const GOOGLE_CLIENT_ID = '743111186567-mfqinhq9np4q2vdpe3otkrboacquoqee.apps.googleusercontent.com';
const GOOGLE_REDIRECT_URI = 'https://parlop2305.github.io/generador-playlists/';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/youtube';
const googleAuthURL =
      'https://accounts.google.com/o/oauth2/v2/auth' +
      '?client_id=' + GOOGLE_CLIENT_ID +
      '&redirect_uri=' + encodeURIComponent(GOOGLE_REDIRECT_URI) +
      '&response_type=token' +
      '&scope=' + encodeURIComponent(GOOGLE_SCOPES);

const SPOTIFY_CLIENT_ID = '5e1d32a3e54b4fb1ba42be6b643162ea';
const SPOTIFY_REDIRECT_URI = 'https://parlop2305.github.io/generador-playlists/';
const SPOTIFY_SCOPES = [
  'playlist-modify-public',
  'playlist-modify-private',
  'user-read-private'
];

let googleToken = null;
let spotifyToken = null;

// ===================== GOOGLE =====================
document.getElementById("authBtn").onclick = () => {
  localStorage.setItem("authSource", "google");
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}&response_type=token&scope=${encodeURIComponent(GOOGLE_SCOPES)}`;
  window.location.href = authUrl;
};

// ===================== SPOTIFY (PKCE) =====================
document.getElementById("spotifyPKCEBtn").onclick = async () => {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  localStorage.setItem("code_verifier", codeVerifier);

  const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${SPOTIFY_CLIENT_ID}&redirect_uri=${encodeURIComponent(SPOTIFY_REDIRECT_URI)}&scope=${encodeURIComponent(SPOTIFY_SCOPES.join(' '))}&code_challenge_method=S256&code_challenge=${codeChallenge}`;
  window.location.href = authUrl;
};

window.addEventListener("load", async () => {
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash;

  if (hash.includes("access_token")) {
    const token = new URLSearchParams(hash.substring(1)).get("access_token");
    const source = localStorage.getItem("authSource");
    if (source === "google") {
      googleToken = token;
      document.getElementById("generateBtn").disabled = false;
    }
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (params.has("code")) {
    const code = params.get("code");
    const verifier = localStorage.getItem("code_verifier");
    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: SPOTIFY_CLIENT_ID,
        grant_type: "authorization_code",
        code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
        code_verifier: verifier
      })
    });
    const tokenData = await tokenResponse.json();
    spotifyToken = tokenData.access_token;
    document.getElementById("generateSpotifyBtn").disabled = false;
    document.getElementById("validateSpotifyBtn").disabled = false;
    window.history.replaceState({}, document.title, window.location.pathname);
  }
});

function generateCodeVerifier() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  return Array.from({ length: 128 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}

async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ===================== EVENTOS UI =====================
document.getElementById("trackCount").addEventListener("input", function () {
  document.getElementById("trackCountValue").textContent = this.value;
});

document.getElementById("validateSpotifyBtn").onclick = async () => {
  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${spotifyToken}` }
  });
  const data = await res.json();
  document.getElementById("spotifyStatus").textContent = `✅ Conectado como: ${data.display_name}`;
};

document.getElementById("generateBtn").onclick = async () => {
  const limit = parseInt(document.getElementById("trackCount").value);
  const artist = document.getElementById("artist").value;
  const algorithm = document.getElementById("algorithm").value;
  const queries = buildQueries(artist, algorithm);
  const videoIds = [];

  for (let query of queries) {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(query)}&maxResults=5`, {
      headers: { Authorization: `Bearer ${googleToken}` }
    });
    const data = await res.json();
    for (let item of data.items || []) {
      const title = item.snippet.title.toLowerCase();
      const id = item.id?.videoId;
      if (id && !videoIds.includes(id) && !/mix|album|recopilación|full|live|concert/.test(title)) videoIds.push(id);
      if (videoIds.length >= limit) break;
    }
    if (videoIds.length >= limit) break;
  }

  if (videoIds.length === 0) return alert("⚠️ No se encontraron canciones.");
  const playlistId = await createPlaylist(`Playlist (${algorithm}) - ${artist}`);
  for (let id of videoIds) await addVideoToPlaylist(playlistId, id);
  document.getElementById("playlistLink").innerHTML = `✅ Playlist creada en YouTube: <a href="https://www.youtube.com/playlist?list=${playlistId}" target="_blank">Ver</a>`;
};

document.getElementById("generateSpotifyBtn").onclick = async () => {
  const artist = document.getElementById("artist").value;
  const algorithm = document.getElementById("algorithm").value;
  const queries = buildQueries(artist, algorithm);
  const uris = [];
  for (let q of queries) {
    const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1`, {
      headers: { Authorization: `Bearer ${spotifyToken}` }
    });
    const data = await res.json();
    if (data.tracks?.items?.[0]?.uri) uris.push(data.tracks.items[0].uri);
  }
  const userId = await (await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${spotifyToken}` } })).json();
  const playlistId = await createSpotifyPlaylist(userId.id, `Playlist (${algorithm}) - ${artist}`);
  await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${spotifyToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris })
  });
  document.getElementById("playlistLink").innerHTML = `✅ Playlist creada en Spotify: <a href="https://open.spotify.com/playlist/${playlistId}" target="_blank">Ver</a>`;
};

// ===================== HELPERS =====================
function buildQueries(artist, algorithm) {
  const year = new Date().getFullYear();
  const extras = ["official audio", "live", "remix", "versión acústica", "lyric video"];
  const extra = extras[Math.floor(Math.random() * extras.length)];
  if (algorithm === "content") {
    return [`${artist} official music video`, `${artist} official audio`, `${artist} song`, `${artist} single`, `${artist} videoclip`];
  } else if (algorithm === "collaborative") {
    const perfiles = {
      Sofía: ["Adele", "Taylor Swift", "Lana del Rey"],
      Carlos: ["Linkin Park", "Imagine Dragons", "The Killers"],
      Mariana: ["Bad Bunny", "Feid", "Karol G"],
      David: ["Kendrick Lamar", "Drake", "J. Cole"],
      Elisa: ["Billie Eilish", "Olivia Rodrigo", "Halsey"],
      Juan: ["Luis Miguel", "Camila", "Reik"]
    };
    let todos = Object.values(perfiles).flat();
    let relacionados = todos.filter(a => a.toLowerCase().includes(artist.toLowerCase()));
    let final = relacionados.length > 0 ? relacionados : [...new Set(todos)].sort(() => 0.5 - Math.random()).slice(0, 3);
    return final.map(a => `${a} official music video`);
  } else {
    return [`Top global songs ${year}`, `Top latino hits ${year}`, `Top indie songs ${year}`].sort(() => 0.5 - Math.random()).slice(0, 2).concat(`${artist} ${extra}`);
  }
}

async function createPlaylist(title) {
  const res = await fetch('https://www.googleapis.com/youtube/v3/playlists?part=snippet,status', {
    method: 'POST',
    headers: { Authorization: `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      snippet: { title, description: 'Generado automáticamente' },
      status: { privacyStatus: 'private' }
    })
  });
  const data = await res.json();
  return data.id;
}

async function addVideoToPlaylist(playlistId, videoId) {
  await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      snippet: {
        playlistId,
        resourceId: { kind: 'youtube#video', videoId }
      }
    })
  });
}

async function createSpotifyPlaylist(userId, name) {
  const res = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${spotifyToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name, description: 'Generado automáticamente', public: false })
  });
  const data = await res.json();
  return data.id;
}
