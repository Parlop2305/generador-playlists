const GOOGLE_CLIENT_ID = '743111186567-mfqinhq9np4q2vdpe3otkrboacquoqee.apps.googleusercontent.com';
const SPOTIFY_CLIENT_ID = '5e1d32a3e54b4fb1ba42be6b643162ea';
const SPOTIFY_REDIRECT_URI = 'http://localhost:5500';
const SPOTIFY_BACKEND_URI = 'http://localhost:3000/get-token';
const GOOGLE_REDIRECT_URI = window.location.origin;
let googleToken = null;
let spotifyToken = null;

document.getElementById("authBtnGoogle").onclick = () => {
  localStorage.setItem("authSource", "google");
  const scopes = 'https://www.googleapis.com/auth/youtube';
  const url =
    'https://accounts.google.com/o/oauth2/v2/auth' +
    '?client_id=' + GOOGLE_CLIENT_ID +
    '&redirect_uri=' + encodeURIComponent(GOOGLE_REDIRECT_URI) +
    '&response_type=token' +
    '&scope=' + encodeURIComponent(scopes);
  window.location.href = url;
};

document.getElementById("authBtnSpotify").onclick = async () => {
  const verifier = generateRandomString(64);
  const challenge = await generateCodeChallenge(verifier);
  localStorage.setItem("verifier", verifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    scope: "playlist-modify-private",
    redirect_uri: SPOTIFY_REDIRECT_URI,
    code_challenge_method: "S256",
    code_challenge: challenge
  });

  localStorage.setItem("authSource", "spotify");
  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
};

window.onload = async () => {
  const hash = window.location.hash;
  const params = new URLSearchParams(window.location.search);
  const authSource = localStorage.getItem("authSource");

  if (hash.includes('access_token') && authSource === 'google') {
    googleToken = new URLSearchParams(hash.replace('#', '?')).get('access_token');
    document.getElementById("generateYouTube").disabled = false;
  }

  if (params.get("code") && authSource === 'spotify') {
    const code = params.get("code");
    const verifier = localStorage.getItem("verifier");

    const res = await fetch(SPOTIFY_BACKEND_URI, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: code,
        code_verifier: verifier,
        redirect_uri: SPOTIFY_REDIRECT_URI
      })
    });

    const data = await res.json();
    spotifyToken = data.access_token;
    document.getElementById("generateSpotify").disabled = false;
  }
};

document.getElementById("generateYouTube").onclick = async () => {
  const artist = document.getElementById("artist").value;
  const algorithm = document.getElementById("algorithm").value;
  const queries = generateQueries(artist, algorithm);
  const videoIds = [];

  for (let query of queries) {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(query)}&maxResults=1`, {
      headers: { Authorization: `Bearer ${googleToken}` }
    });
    const data = await res.json();
    const id = data.items?.[0]?.id?.videoId;
    if (id) videoIds.push(id);
  }

  const res = await fetch('https://www.googleapis.com/youtube/v3/playlists?part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${googleToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      snippet: {
        title: `Playlist de ${artist}`,
        description: 'Playlist generada automáticamente',
      },
      status: { privacyStatus: 'private' }
    })
  });
  const playlist = await res.json();
  const playlistId = playlist.id;

  for (let id of videoIds) {
    await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${googleToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        snippet: {
          playlistId: playlistId,
          resourceId: { kind: "youtube#video", videoId: id }
        }
      })
    });
  }

  document.getElementById("playlistLink").innerHTML =
    `✅ Playlist creada en YouTube: <a href="https://www.youtube.com/playlist?list=${playlistId}" target="_blank">Ver</a>`;
};

document.getElementById("generateSpotify").onclick = async () => {
  const artist = document.getElementById("artist").value;
  const algorithm = document.getElementById("algorithm").value;
  const queries = generateQueries(artist, algorithm);
  const trackUris = [];

  for (let query of queries) {
    const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`, {
      headers: { Authorization: `Bearer ${spotifyToken}` }
    });
    const data = await res.json();
    const uri = data.tracks?.items?.[0]?.uri;
    if (uri) trackUris.push(uri);
  }

  const userRes = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${spotifyToken}` }
  });
  const userData = await userRes.json();
  const userId = userData.id;

  const plRes = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${spotifyToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: `Playlist de ${artist}`,
      public: false
    })
  });
  const playlist = await plRes.json();

  await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${spotifyToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ uris: trackUris })
  });

  document.getElementById("playlistLink").innerHTML =
    `✅ Playlist creada en Spotify: <a href="https://open.spotify.com/playlist/${playlist.id}" target="_blank">Ver</a>`;
};

function generateQueries(artist, algorithm) {
  if (algorithm === "content") {
    return [`${artist} best songs`, `${artist} acoustic`, `${artist} live`];
  } else if (algorithm === "collaborative") {
    return [`${artist} similar artists`, `inspired by ${artist}`, `${artist} fans also like`];
  } else {
    return [`${artist} hits`, `${artist} radio`, `popular ${artist}`];
  }
}

// PKCE helpers
function generateRandomString(length) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest('SHA-256', data);
}
function base64urlencode(a) {
  return btoa(String.fromCharCode(...new Uint8Array(a)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function generateCodeChallenge(codeVerifier) {
  const hashed = await sha256(codeVerifier);
  return base64urlencode(hashed);
}
