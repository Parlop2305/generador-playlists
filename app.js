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
    const spotifyAuthURL =
      'https://accounts.spotify.com/authorize' +
      '?response_type=token' +
      '&client_id=' + SPOTIFY_CLIENT_ID +
      '&redirect_uri=' + encodeURIComponent(SPOTIFY_REDIRECT_URI) +
      '&scope=' + encodeURIComponent(SPOTIFY_SCOPES.join(' '));

    let googleToken = null;
    let spotifyToken = null;

    document.getElementById("authBtn").onclick = async () => {
      localStorage.setItem("authSource", "google");
      console.log("Redirigiendo a Google:", googleAuthURL);
      window.location.href = googleAuthURL;
    };

   document.getElementById("spotifyBtn").onclick = async () => {
  const verifier = generateCodeVerifier(); // Genera el code_verifier
  const challenge = await generateCodeChallenge(verifier); // Genera el code_challenge

  sessionStorage.setItem('spotify_code_verifier', verifier); // Lo guardas para después

  const authUrl = `https://accounts.spotify.com/authorize?client_id=${SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(SPOTIFY_REDIRECT_URI)}&code_challenge_method=S256&code_challenge=${challenge}&scope=playlist-modify-public playlist-modify-private user-read-private`;

  window.location.href = authUrl;
};

    window.addEventListener('load', async function () {
  const hash = window.location.hash;
  if (hash.includes('access_token')) {
    // YouTube flow
    const token = new URLSearchParams(hash.substring(1)).get('access_token');
    const source = localStorage.getItem("authSource");
    if (source === "google") {
      googleToken = token;
      document.getElementById("generateBtn").disabled = false;
    } else if (source === "spotify") {
      spotifyToken = token;
      document.getElementById("generateSpotifyBtn").disabled = false;
    }
    window.history.replaceState({}, document.title, window.location.pathname);    
  }

  // Spotify PKCE flow
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const verifier = sessionStorage.getItem('spotify_code_verifier');
  if (code && verifier) {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: 'https://parlop2305.github.io/generador-playlists/',
      client_id: '5e1d32a3e54b4fb1ba42be6b643162ea',
      code_verifier: verifier
    });

    try {
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
      });
      const data = await res.json();
      if (data.access_token) {
       sessionStorage.setItem('spotifyToken', data.access_token);
        document.getElementById("generateSpotifyBtn").disabled = false;
        history.replaceState({}, null, window.location.pathname);
      }
    } catch (err) {
      console.error("Error al intercambiar código por token:", err);
    }
  }
});

    document.getElementById("generateBtn").onclick = async () => {
  console.log("🎬 Generando playlist en YouTube...");

  const limit = parseInt(document.getElementById("trackCount").value);
  const artist = document.getElementById("artist").value;
  const algorithm = document.getElementById("algorithm").value;
  const sortType = document.getElementById("sort").value;

  let queries = buildQueries(artist, algorithm);
  let rawVideos = [];

  for (let query of queries) {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(query)}&maxResults=5`, {
      headers: { Authorization: `Bearer ${googleToken}` }
    });

    if (!res.ok) {
      console.warn("Error al buscar:", query, res.status);
      continue;
    }

    const data = await res.json();
    if (!data.items || !Array.isArray(data.items)) continue;

    for (let item of data.items) {
      const title = item.snippet.title;
      const id = item.id?.videoId;

      if (
        id &&
        !title.toLowerCase().includes("mix") &&
        !title.toLowerCase().includes("album") &&
        !title.toLowerCase().includes("recopilación") &&
        !title.toLowerCase().includes("full") &&
        !title.toLowerCase().includes("live") &&
        !title.toLowerCase().includes("concert") &&
        !rawVideos.some(v => v.id === id)
      ) {
        rawVideos.push({ id, title });
      }

      if (rawVideos.length >= limit) break;
    }

    if (rawVideos.length >= limit) break;
  }

  if (rawVideos.length === 0) {
    document.getElementById("playlistLink").innerHTML =
      "⚠️ No se encontraron canciones. Intenta con otro artista.";
    return;
  }

  // Ordena solo si se elige "title"
  if (sortType === "title") {
    rawVideos.sort((a, b) => a.title.localeCompare(b.title));
  }

  const videoIds = rawVideos.slice(0, limit).map(v => v.id);
  const playlistId = await createPlaylist(`Playlist (${algorithm}) - ${artist}`);

  for (let videoId of videoIds) {
    await addVideoToPlaylist(playlistId, videoId);
  }

  document.getElementById("playlistLink").innerHTML =
    `✅ Playlist creada en YouTube con ${videoIds.length} canciones: <a href="https://www.youtube.com/playlist?list=${playlistId}" target="_blank">Ver</a>`;
};
    
    document.getElementById("generateSpotifyBtn").onclick = async () => {
  console.log("🎧 Generando playlist en Spotify...");

  const token = sessionStorage.getItem("spotifyToken");
  const artist = document.getElementById("artist").value;
  const algorithm = document.getElementById("algorithm").value;
  const limit = parseInt(document.getElementById("trackCount").value);

  if (!token) {
    alert("🔒 Primero inicia sesión en Spotify.");
    return;
  }

  let queries = buildQueries(artist, algorithm);
  let trackUris = [];
  let rawTracks = [];

for (let q of queries) {
  const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=5`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = await res.json();
  const tracks = data.tracks?.items || [];

  for (let track of tracks) {
    const uri = track.uri;
    if (uri && !trackUris.includes(uri)) {
      trackUris.push(uri);
      rawTracks.push(track);
    }
    if (trackUris.length >= limit) break;
  }

  if (trackUris.length >= limit) break;
}

// APLICAR ORDENAMIENTO
rawTracks = applySortingIfNeeded(rawTracks, 'spotify');
trackUris = rawTracks.slice(0, limit).map(t => t.uri);
      

  const userRes = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${token}` }
  });

  const userData = await userRes.json();
  const userId = userData.id;

  const playlistRes = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: `Playlist (${algorithm}) - ${artist}`,
      description: "Generado automáticamente con PKCE",
      public: false
    })
  });

  const playlistData = await playlistRes.json();
  const playlistId = playlistData.id;

  await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      uris: trackUris
    })
  });

  document.getElementById("playlistLink").innerHTML =
    `✅ Playlist creada en Spotify con ${trackUris.length} canciones: <a href="https://open.spotify.com/playlist/${playlistId}" target="_blank">Ver Playlist</a>`;
};



  document.getElementById("spotifyBtn").onclick = async () => {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
 sessionStorage.setItem("spotify_code_verifier", codeVerifier);

  const clientId = "5e1d32a3e54b4fb1ba42be6b643162ea";  // Tu Client ID
  const redirectUri = "https://parlop2305.github.io/generador-playlists/";
  const scopes = "playlist-modify-public playlist-modify-private user-read-private";

  const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&code_challenge_method=S256&code_challenge=${codeChallenge}`;

  window.location.href = authUrl;
};

    function buildQueries(artist, algorithm) {
    const año = new Date().getFullYear();
    const extras = ["official audio", "live", "remix", "versión acústica", "lyric video"];
    const extra = extras[Math.floor(Math.random() * extras.length)];
  if (algorithm === "content") {
    return [
      `artist:${artist} official music video`,
      `artist:${artist} official audio`,
      `artist:${artist} song`,
      `artist:${artist} single`,
      `artist:${artist} videoclip`
];
  } else if (algorithm === "collaborative") {
   const perfiles = {
  Sofía: ["Adele", "Taylor Swift", "Lana del Rey"],
  Carlos: ["Linkin Park", "Imagine Dragons", "The Killers"],
  Mariana: ["Bad Bunny", "Feid", "Karol G"],
  David: ["Kendrick Lamar", "Drake", "J. Cole"],
  Elisa: ["Billie Eilish", "Olivia Rodrigo", "Halsey"],
  Juan: ["Luis Miguel", "Camila", "Reik"]
};

  let todosArtistas = Object.values(perfiles).flat();
  let relacionados = todosArtistas.filter(a => a.toLowerCase().includes(artist.toLowerCase()));

  let finalArtists = relacionados.length > 0
  ? relacionados
  : [...new Set(todosArtistas)].sort(() => 0.5 - Math.random()).slice(0, 3);

  return finalArtists.map(a => `${a} official music video`);

  } else {
    return [
      `Top global songs ${año}`,
      `Top latino hits ${año}`,
      `Top indie songs ${año}`
    ].sort(() => 0.5 - Math.random()).slice(0, 2).concat([
      `${artist} ${extra}`
    ]);
  }
}

async function searchVideo(query) {
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(query + ' official music video')}&maxResults=5`, {
      headers: { Authorization: `Bearer ${googleToken}` }
    });

    if (!res.ok) {
      console.error("Error en la API de YouTube:", res.status);
      return null;
    }

    const data = await res.json();

    if (!data.items || !Array.isArray(data.items)) {
      console.warn("Respuesta inesperada de YouTube:", data);
      return null;
    }

    for (let item of data.items) {
      const title = item.snippet.title.toLowerCase();
      const id = item.id?.videoId;

      if (
        id &&
        !title.includes("mix") &&
        !title.includes("album") &&
        !title.includes("recopilación") &&
        !title.includes("full") &&
        !title.includes("live") &&
        !title.includes("concert")
      ) {
        return id;
      }
    }
  } catch (err) {
    console.error("Error en searchVideo:", err);
  }

  return null;
}

    async function validateSpotifyToken() {
  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: {
      Authorization: `Bearer ${spotifyToken}`
    }
  });
  const data = await res.json();
  console.log("👤 Usuario conectado en Spotify:", data.display_name);
}

    async function createPlaylist(title) {
      const res = await fetch('https://www.googleapis.com/youtube/v3/playlists?part=snippet,status', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${googleToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          snippet: { title: title, description: 'Generado automáticamente' },
          status: { privacyStatus: 'private' }
        })
      });
      const data = await res.json();
      return data.id;
    }

    async function addVideoToPlaylist(playlistId, videoId) {
      await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${googleToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          snippet: {
            playlistId: playlistId,
            resourceId: { kind: "youtube#video", videoId: videoId }
          }
        })
      });
    }

    async function searchSpotifyTracks(query) {
      const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`, {
        headers: { Authorization: `Bearer ${spotifyToken}` }
      });
      const data = await res.json();
      return data.tracks?.items?.[0]?.uri || null;
    }

    async function getSpotifyUserId() {
      const res = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${spotifyToken}` }
      });
      const data = await res.json();
      return data.id;
    }

    async function createSpotifyPlaylist(userId, name) {
      const res = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${spotifyToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: name,
          description: 'Generado automáticamente',
          public: false
        })
      });
      const data = await res.json();
      return data.id;
    }

    async function addTracksToSpotifyPlaylist(playlistId, trackUris) {
      await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${spotifyToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ uris: trackUris })
      });
    }
    document.getElementById("trackCount").addEventListener("input", function () {
    document.getElementById("trackCountValue").textContent = this.value;
});
  
function generateCodeVerifier() {
  const array = new Uint8Array(64);
  window.crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

    function applySortingIfNeeded(items, platform) {
  const sortType = document.getElementById('sort').value;

  if (sortType === 'title') {
    return items.sort((a, b) => {
      const titleA = platform === 'spotify' ? a.name : a.title;
      const titleB = platform === 'spotify' ? b.name : b.title;
      return titleA.localeCompare(titleB);
    });
  }

  if (sortType === 'duration') {
    return bubbleSortByKey(items, platform === 'spotify' ? 'duration_ms' : 'duration');
  }

  if (sortType === 'popularity') {
    return items.sort((a, b) => a.popularity - b.popularity);
  }

  return items;
}

    function bubbleSortByKey(arr, key) {
      let n = arr.length;
      let swapped;
      do {
        swapped = false;
        for (let i = 0; i < n - 1; i++) {
          if (arr[i][key] > arr[i + 1][key]) {
            [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
            swapped = true;
          }
        }
        n--;
      } while (swapped);
      return arr;
    }

    document.getElementById("trackCount").addEventListener("input", function () {
      document.getElementById("trackCountValue").textContent = this.value;
    });
